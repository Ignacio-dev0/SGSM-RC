# Funciones comunes de los scripts de operación (docs/despliegue.md). Se cargan con `source`.
# Funcionan en Git Bash (Windows) y en bash (Linux); se corren desde cualquier carpeta.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"

# Git Bash convierte los argumentos que empiezan con "/" en rutas de Windows ("/respaldos" pasa a
# "C:/Program Files/Git/respaldos") al llamar a docker: así quedan tal cual.
export MSYS_NO_PATHCONV=1

error() {
  echo "ERROR: $*" >&2
  exit 1
}
aviso() { echo "AVISO: $*" >&2; }
titulo() { printf '\n== %s ==\n' "$*"; }

# El archivo de variables de compose: el primero de COMPOSE_ENV_FILES si está definida (compose
# hace lo mismo), si no el .env de la raíz.
archivo_env() {
  local archivos="${COMPOSE_ENV_FILES:-.env}"
  echo "${archivos%%,*}"
}

# Valor de una variable de compose: la del entorno, si no la del .env, si no el valor por defecto.
valor() {
  local nombre="$1" defecto="${2:-}" v="${!1:-}" archivo
  archivo="$(archivo_env)"
  if [ -z "$v" ] && [ -f "$archivo" ]; then
    v="$(sed -n "s/^[[:space:]]*${nombre}[[:space:]]*=[[:space:]]*//p" "$archivo" | tail -n 1 | tr -d '\r')"
    v="${v%\"}" && v="${v#\"}" && v="${v%\'}" && v="${v#\'}"
  fi
  echo "${v:-$defecto}"
}

# Ruta de una carpeta tal como la entiende docker en -v (C:/… en Git Bash).
ruta_docker() {
  if (cd "$1" && pwd -W) >/dev/null 2>&1; then (cd "$1" && pwd -W); else (cd "$1" && pwd); fi
}

# Carpeta de los respaldos en la PC (RESPALDO_CARPETA, relativa a la raíz del repositorio).
carpeta_respaldos() { valor RESPALDO_CARPETA ./respaldos; }

# El servicio "db" de compose está corriendo.
base_corriendo() {
  [ -n "$(docker compose ps --status running --quiet db 2>/dev/null)" ]
}
