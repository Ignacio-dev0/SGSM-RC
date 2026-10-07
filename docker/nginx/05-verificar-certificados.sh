#!/bin/sh
# Lo corre la imagen oficial de nginx antes de arrancar (/docker-entrypoint.d). Sin certificado no
# hay HTTPS (T802): mejor un mensaje claro que el error de nginx al leer el archivo.
set -eu

carpeta=/etc/nginx/certificados
for archivo in servidor.crt servidor.key sgsm-ca.crt; do
  if [ ! -s "$carpeta/$archivo" ]; then
    echo "ERROR: falta el certificado $carpeta/$archivo (docker/certificados/nginx en la PC)." >&2
    echo "Generalo con: bash scripts/certificado.sh   (ver docs/despliegue.md, \"Certificado\")" >&2
    exit 1
  fi
done
