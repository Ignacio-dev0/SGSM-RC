#!/usr/bin/env bash
# Restaura un respaldo (pg_dump -Fc) en una base nueva o en la indicada (T801 · docs/despliegue.md).
#
# Uso: bash scripts/restaurar.sh ARCHIVO [--base NOMBRE] [--si] [--forzar]
#   ARCHIVO   un respaldo .dump (de RESPALDO_CARPETA o de cualquier lado: un disco externo, etc.)
#   --base    base destino; por defecto sgsm_restaurada (una base aparte, para revisar sin tocar
#             la del sistema). Si ya existe, se reemplaza, pero ANTES se respalda en
#             RESPALDO_CARPETA (<base>-<fecha>-antes-de-restaurar.dump).
#   --si      confirma. Sin --si solo muestra qué haría: NUNCA toca una base sin esta opción.
#   --forzar  corta las conexiones abiertas a la base destino (por defecto se niega si hay).
#
# Para volver el sistema a un respaldo (base sgsm): detener la API primero,
#   docker compose stop backend
#   bash scripts/restaurar.sh respaldos/sgsm-….dump --base sgsm --si
#   docker compose start backend
source "$(dirname "$0")/lib/comun.sh"

archivo=""
base=sgsm_restaurada
confirmado=no
forzar=no
while [ $# -gt 0 ]; do
  case "$1" in
    --base) base="${2:?falta el nombre de la base}" && shift 2 ;;
    --si) confirmado=si && shift ;;
    --forzar) forzar=si && shift ;;
    -h | --help)
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
      exit 0
      ;;
    -*) error "opción desconocida: $1 (ver --help)" ;;
    *) [ -z "$archivo" ] && archivo="$1" && shift || error "un solo archivo por vez" ;;
  esac
done

[ -n "$archivo" ] || error "falta el archivo del respaldo (ver --help)"
[ -f "$archivo" ] || error "no existe el archivo $archivo"
[[ "$base" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || error "nombre de base inválido: $base (minúsculas, números y _)"
case "$base" in postgres | template0 | template1) error "la base $base es del sistema de PostgreSQL" ;; esac
base_corriendo || error "la base no está corriendo (docker compose up -d db)"

# Comandos dentro del contenedor de la base (mismas versiones de psql y pg_restore que el servidor).
en_la_base() { docker compose exec -T db "$@"; }
sql() { en_la_base psql -U sgsm -d postgres -v ON_ERROR_STOP=1 -tA -c "$1"; }

titulo "Respaldo"
cabecera="$(en_la_base pg_restore --list <"$archivo" 2>&1)" ||
  error "el archivo no es un respaldo válido de pg_dump -Fc: $(echo "$cabecera" | head -n 2)"
echo "Archivo:  $archivo ($(du -h "$archivo" | cut -f1))"
echo "$cabecera" | grep -E '^;[[:space:]]+(Archive created at|dbname|Dumped from database version|TOC Entries)' |
  sed 's/^;[[:space:]]*/          /'

existe="$(sql "SELECT count(*) FROM pg_database WHERE datname = '$base'")"
conexiones=0
[ "$existe" = 1 ] && conexiones="$(sql "SELECT count(*) FROM pg_stat_activity WHERE datname = '$base'")"

titulo "Plan"
carpeta="$(carpeta_respaldos)"
resguardo="$carpeta/$base-$(date +%Y-%m-%d_%H%M%S)-antes-de-restaurar.dump"
if [ "$existe" = 1 ]; then
  echo "1. La base $base YA EXISTE ($conexiones conexiones abiertas): se respalda en"
  echo "   $resguardo"
  echo "2. Se BORRA la base $base y se crea vacía."
else
  echo "1. Se crea la base nueva $base."
fi
echo "Después se carga el respaldo en una sola transacción (si algo falla, la base queda vacía)."

if [ "$confirmado" != si ]; then
  echo
  echo "No se cambió nada. Para restaurar de verdad, repetí el comando agregando --si."
  exit 2
fi
if [ "$existe" = 1 ] && [ "$conexiones" != 0 ] && [ "$forzar" != si ]; then
  error "la base $base tiene $conexiones conexiones abiertas (¿la API?). Detené la API con
  docker compose stop backend   o agregá --forzar para cortarlas."
fi

titulo "Restaurando"
if [ "$existe" = 1 ]; then
  mkdir -p "$carpeta"
  en_la_base pg_dump -U sgsm --format=custom "$base" >"$resguardo"
  en_la_base pg_restore --file=/dev/null <"$resguardo" || error "el resguardo previo no se pudo verificar: no se borró nada"
  echo "Resguardo de la base anterior: $resguardo ($(du -h "$resguardo" | cut -f1))"
  sql "DROP DATABASE \"$base\" WITH (FORCE)" >/dev/null
fi
sql "CREATE DATABASE \"$base\" OWNER sgsm" >/dev/null
en_la_base pg_restore -U sgsm -d "$base" --no-owner --single-transaction --exit-on-error <"$archivo"

titulo "Filas por tabla en $base"
en_la_base psql -U sgsm -d "$base" -v ON_ERROR_STOP=1 -c "
  SELECT table_name AS tabla,
         (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text::bigint AS filas
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name"
echo "Listo: el respaldo quedó en la base $base."
