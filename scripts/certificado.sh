#!/usr/bin/env bash
# Genera la CA local y el certificado HTTPS del servidor (T802 · docs/despliegue.md).
# openssl corre dentro de un contenedor (no depende de lo instalado en la PC); con --local usa el
# openssl de la PC (viene con Git for Windows). La lógica está en docker/nginx/generar-certificados.sh.
#
# Uso: bash scripts/certificado.sh [--nombre NOMBRE]... [--ip IP]... [--nueva-ca] [--local]
#   Sin --nombre ni --ip usa SGSM_SERVIDOR y SGSM_IP del .env. localhost y 127.0.0.1 van siempre.
#   La CA se crea una sola vez y se reutiliza (las tablets no se tocan al renovar); --nueva-ca
#   fuerza una nueva (hay que reinstalarla en todas las tablets).
source "$(dirname "$0")/lib/comun.sh"

# La misma imagen base que la interfaz (frontend/Dockerfile): ya está descargada.
IMAGEN=nginx:1.27-alpine

nombres=""
ips=""
nueva_ca=no
en_la_pc=no
while [ $# -gt 0 ]; do
  case "$1" in
    --nombre) nombres="${nombres:+$nombres,}${2:?falta el nombre}" && shift 2 ;;
    --ip) ips="${ips:+$ips,}${2:?falta la IP}" && shift 2 ;;
    --nueva-ca) nueva_ca=si && shift ;;
    --local) en_la_pc=si && shift ;;
    -h | --help)
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
      exit 0
      ;;
    *) error "opción desconocida: $1 (ver --help)" ;;
  esac
done
[ -n "$nombres" ] || nombres="$(valor SGSM_SERVIDOR)"
[ -n "$ips" ] || ips="$(valor SGSM_IP)"
nombres="${nombres// /}"
ips="${ips// /}"

if [ -z "$nombres" ] && [ -z "$ips" ]; then
  aviso "sin --nombre/--ip ni SGSM_SERVIDOR/SGSM_IP en el .env: el certificado solo sirve para localhost."
fi
if [ -z "$ips" ]; then
  aviso "sin IP: las tablets que entren por la dirección IP van a ver un error de certificado."
  if command -v ipconfig >/dev/null 2>&1; then
    echo "Direcciones IPv4 de esta PC (la de la red del hospital va con --ip o en SGSM_IP):" >&2
    ipconfig | grep -a -i 'IPv4' | sed 's/.*: */  /' >&2 || true
  fi
fi

mkdir -p docker/certificados
if [ "$en_la_pc" = si ]; then
  command -v openssl >/dev/null 2>&1 || error "no hay openssl en la PC: correlo sin --local (usa Docker)"
  NOMBRES="$nombres" IPS="$ips" NUEVA_CA="$nueva_ca" DIR=docker/certificados \
    sh docker/nginx/generar-certificados.sh
else
  command -v docker >/dev/null 2>&1 || error "no se encontró docker (o usá --local)"
  dueno=""
  case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) ;; *) dueno="$(id -u):$(id -g)" ;; esac
  docker run --rm \
    -e NOMBRES="$nombres" -e IPS="$ips" -e NUEVA_CA="$nueva_ca" -e DUENO="$dueno" \
    -v "$(ruta_docker docker/certificados):/certificados" \
    -v "$(ruta_docker docker/nginx):/scripts:ro" \
    "$IMAGEN" sh -c 'apk add --no-cache --quiet openssl >/dev/null && sh /scripts/generar-certificados.sh'
fi

http_puerto="$(valor HTTP_PUERTO 8080)"
servidor="${nombres%%,*}"
[ -n "$servidor" ] || servidor="${ips%%,*}"
cat <<EOF

Siguientes pasos:
  - Si la interfaz ya estaba levantada: docker compose restart frontend
  - En cada tablet, instalar la CA desde http://${servidor:-localhost}:${http_puerto}/sgsm-ca.crt
    (iPad: /sgsm-ca.cer) y comparar la huella de arriba: docs/despliegue.md.
  - Guardar docker/certificados/ca/ (la clave de la CA) en un lugar seguro fuera de esta PC.
EOF
