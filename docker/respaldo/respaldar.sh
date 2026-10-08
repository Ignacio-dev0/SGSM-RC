#!/bin/sh
# Un respaldo de la base (T801), dentro del contenedor "respaldo" (postgres:17-alpine, la misma
# versión que la base). pg_dump en formato custom (-Fc: comprimido, se restaura con pg_restore o
# scripts/restaurar.sh), verificado antes de darlo por bueno y con la fecha en el nombre.
#
# Uso: respaldar.sh [etiqueta]
#   Sin etiqueta: respaldo automático (sgsm-AAAA-MM-DD_HHMMSS.dump) y después la retención deja
#   los últimos RESPALDO_RETENCION automáticos.
#   Con etiqueta (manual, antes-de-actualizar…): sgsm-AAAA-MM-DD_HHMMSS-<etiqueta>.dump; la
#   retención no los borra nunca.
#
# Conexión: PGHOST, PGUSER, PGPASSWORD y PGDATABASE (los pone docker-compose.yml).
set -eu

CARPETA=/respaldos
BASE="${PGDATABASE:-sgsm}"
RETENCION="${RESPALDO_RETENCION:-14}"
ETIQUETA="${1:-}"

registrar() { echo "$(date '+%Y-%m-%d %H:%M:%S') [respaldo] $*"; }

case "$RETENCION" in
  '' | *[!0-9]* | 0) registrar "ERROR: RESPALDO_RETENCION debe ser un número mayor que 0" && exit 1 ;;
esac
case "$ETIQUETA" in
  *[!a-z0-9-]*) registrar "ERROR: la etiqueta solo puede tener minúsculas, números y guiones" && exit 1 ;;
esac

nombre="$BASE-$(date +%Y-%m-%d_%H%M%S)${ETIQUETA:+-$ETIQUETA}.dump"
destino="$CARPETA/$nombre"
parcial="$destino.parcial"
# Si algo falla a mitad de camino no queda un archivo cortado que parezca un respaldo.
trap 'rm -f "$parcial"' EXIT

inicio=$(date +%s)
registrar "respaldando la base $BASE en $nombre"
pg_dump --format=custom --file="$parcial" "$BASE"
# Lee el archivo entero (todos los bloques comprimidos): si está dañado, falla acá.
pg_restore --file=/dev/null "$parcial"
mv "$parcial" "$destino"
registrar "listo: $nombre ($(du -h "$destino" | cut -f1), $(($(date +%s) - inicio)) s)"

# Retención: solo los automáticos (el nombre exacto, sin etiqueta), del más nuevo al más viejo.
if [ -z "$ETIQUETA" ]; then
  ls -1 "$CARPETA"/"$BASE"-????-??-??_??????.dump 2>/dev/null | sort -r |
    tail -n +"$((RETENCION + 1))" | while read -r viejo; do
      rm -f "$viejo"
      registrar "retención ($RETENCION): borrado $(basename "$viejo")"
    done
fi
