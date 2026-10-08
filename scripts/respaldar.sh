#!/usr/bin/env bash
# Hace un respaldo de la base AHORA (T801 · docs/despliegue.md), además del diario automático.
# Lo usa scripts/actualizar.sh antes de migrar. Los respaldos con etiqueta no los borra la
# retención: se borran a mano cuando ya no hacen falta.
#
# Uso: bash scripts/respaldar.sh [etiqueta]     (por defecto "manual")
#   El archivo queda en RESPALDO_CARPETA (./respaldos): sgsm-AAAA-MM-DD_HHMMSS-<etiqueta>.dump
source "$(dirname "$0")/lib/comun.sh"

etiqueta="${1:-manual}"
base_corriendo || error "la base no está corriendo (docker compose up -d db)"

# Un contenedor de un solo uso con la configuración del servicio "respaldo" (misma versión de
# pg_dump que la base y la misma carpeta), sin levantar ni tocar los demás servicios.
docker compose run --rm --no-deps --entrypoint sh respaldo /respaldo/respaldar.sh "$etiqueta"
