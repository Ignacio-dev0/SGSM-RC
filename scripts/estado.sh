#!/usr/bin/env bash
# Estado del despliegue (T801 · docs/despliegue.md): contenedores, API, certificado, último
# respaldo y espacio en disco. Termina con código 1 si algo necesita atención, así se puede
# programar (Programador de tareas de Windows) y mirar solo cuando falla.
#
# Uso: bash scripts/estado.sh
source "$(dirname "$0")/lib/comun.sh"

problemas=0
mal() {
  echo "  !! $*"
  problemas=$((problemas + 1))
}
bien() { echo "  ok $*"; }

titulo "Contenedores"
docker compose ps -a --format 'table {{.Service}}\t{{.State}}\t{{.Status}}' 2>/dev/null ||
  mal "no se pudo consultar docker (¿Docker Desktop está abierto?)"
for servicio in db backend frontend respaldo; do
  id="$(docker compose ps -a --quiet "$servicio" 2>/dev/null | head -n 1)"
  if [ -z "$id" ]; then
    mal "$servicio: no existe (docker compose up -d)"
    continue
  fi
  read -r estado salud reinicios <<<"$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}} {{.RestartCount}}' "$id")"
  if [ "$estado" != running ]; then
    mal "$servicio: $estado (docker compose logs $servicio)"
  elif [ "$salud" != healthy ] && [ "$salud" != - ]; then
    mal "$servicio: $salud (docker compose logs $servicio)"
  elif [ "$reinicios" != 0 ]; then
    mal "$servicio: se reinició $reinicios veces (docker compose logs $servicio)"
  else
    bien "$servicio"
  fi
done

titulo "API a través de nginx"
https_puerto="$(valor HTTPS_PUERTO 8443)"
url="https://localhost:$https_puerto/api/salud"
ca=docker/certificados/ca/sgsm-ca.crt
# --ssl-no-revoke: el curl de Git for Windows (Schannel) busca la lista de revocación, que una CA
# local no tiene; en Linux no hace nada.
if respuesta="$(curl -fsS --max-time 10 --ssl-no-revoke --cacert "$ca" "$url" 2>&1)"; then
  bien "$url -> $respuesta"
else
  mal "$url no responde: $respuesta"
fi

titulo "Certificado HTTPS"
certificado=docker/certificados/nginx/servidor.crt
if [ ! -f "$certificado" ]; then
  mal "no hay certificado (bash scripts/certificado.sh)"
elif ! command -v openssl >/dev/null 2>&1; then
  echo "  (sin openssl en la PC para leer el vencimiento)"
else
  vence="$(openssl x509 -in "$certificado" -noout -enddate | cut -d= -f2)"
  dias=$((($(date -d "$vence" +%s) - $(date +%s)) / 86400))
  nombres="$(openssl x509 -in "$certificado" -noout -ext subjectAltName | tail -n +2 | sed 's/^ *//')"
  if [ "$dias" -lt 30 ]; then
    mal "vence en $dias días ($vence): renovalo con bash scripts/certificado.sh"
  else
    bien "vence en $dias días; válido para $nombres"
  fi
fi

titulo "Respaldos"
carpeta="$(carpeta_respaldos)"
if [ ! -d "$carpeta" ]; then
  mal "no existe la carpeta $carpeta"
else
  # El último automático (los manuales y los "antes-de-…" no dicen si el diario anda).
  ultimo="$(ls -1 "$carpeta"/sgsm-????-??-??_??????.dump 2>/dev/null | sort | tail -n 1 || true)"
  cantidad="$(ls -1 "$carpeta"/sgsm-*.dump 2>/dev/null | wc -l | tr -d ' ')"
  if [ -z "$ultimo" ]; then
    mal "no hay respaldos automáticos en $carpeta"
  else
    horas=$((($(date +%s) - $(date -r "$ultimo" +%s)) / 3600))
    texto="último automático $(basename "$ultimo") ($(du -h "$ultimo" | cut -f1), hace $horas h); $cantidad en $carpeta ($(du -sh "$carpeta" | cut -f1))"
    if [ "$horas" -ge 26 ]; then mal "el último automático tiene más de un día: $texto"; else bien "$texto"; fi
  fi
fi

titulo "Espacio en disco"
for ruta in . "$carpeta"; do
  [ -d "$ruta" ] || continue
  read -r usado libre montaje <<<"$(df -hP "$ruta" | awk 'NR == 2 { print $5, $4, $6 }')"
  if [ "${usado%\%}" -ge 90 ]; then
    mal "$montaje ($ruta): $usado usado, quedan $libre"
  else
    bien "$montaje ($ruta): $usado usado, quedan $libre"
  fi
done
if base_corriendo; then
  echo "  Base sgsm: $(docker compose exec -T db psql -U sgsm -d sgsm -tA -c "SELECT pg_size_pretty(pg_database_size('sgsm'))" 2>/dev/null | tr -d '\r')"
fi
echo "  Docker (imágenes, volúmenes, caché):"
docker system df 2>/dev/null | sed 's/^/    /'

echo
if [ "$problemas" -eq 0 ]; then
  echo "Todo en orden."
else
  echo "$problemas cosa(s) para revisar (marcadas con !!)."
  exit 1
fi
