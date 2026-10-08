#!/usr/bin/env bash
# Pasa el servidor a la versión que está en esta carpeta (docs/despliegue.md, "Actualizar").
# Antes hay que traer la versión nueva (git pull, o copiar la carpeta) sin tocar .env,
# docker/certificados ni respaldos. Pasos:
#   1. Respaldo "antes-de-actualizar" (la API migra la base al arrancar: si algo sale mal, se
#      vuelve a este respaldo con scripts/restaurar.sh).
#   2. Construye las imágenes nuevas (y trae las actualizaciones de seguridad de node y nginx).
#   3. Recrea los contenedores que cambiaron y espera a que estén sanos (migraciones incluidas).
#   4. Corre el instalador: suma los permisos y tipos de estudio nuevos de la versión (idempotente;
#      con un administrador ya creado no pregunta nada, D106).
#   5. Muestra el estado.
#
# Uso: bash scripts/actualizar.sh
source "$(dirname "$0")/lib/comun.sh"

[ -f "$(archivo_env)" ] || error "no hay $(archivo_env): este script es para el servidor (ver docs/despliegue.md)"

titulo "1/5 Respaldo antes de actualizar"
bash scripts/respaldar.sh antes-de-actualizar

titulo "2/5 Construyendo las imágenes"
docker compose build --pull

titulo "3/5 Levantando la versión nueva (aplica las migraciones)"
if ! docker compose up -d --wait --wait-timeout 300; then
  cat >&2 <<EOF

ERROR: la versión nueva no quedó sana. Ver qué pasó con:
  docker compose logs --tail 100 backend
Para volver atrás (docs/despliegue.md, "Volver atrás"):
  docker compose stop backend
  bash scripts/restaurar.sh $(carpeta_respaldos)/sgsm-…-antes-de-actualizar.dump --base sgsm --si
  traer la versión anterior del código y correr otra vez bash scripts/actualizar.sh
EOF
  exit 1
fi

titulo "4/5 Permisos y datos base de esta versión"
if ! docker compose run --rm -T backend node dist/scripts/instalar.js; then
  error "el instalador no terminó bien: revisar el mensaje de arriba (docs/despliegue.md, paso 7)"
fi

titulo "5/5 Estado"
bash scripts/estado.sh
