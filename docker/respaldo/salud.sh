#!/bin/sh
# Chequeo de salud del contenedor "respaldo" (T801): sano si hay un respaldo AUTOMÁTICO de las
# últimas 26 h (un día más dos horas de margen); los manuales no cuentan. Si no, `docker compose
# ps` y scripts/estado.sh lo marcan.
BASE="${PGDATABASE:-sgsm}"
reciente=$(find /respaldos -maxdepth 1 -name "$BASE-????-??-??_??????.dump" -mmin -1560 2>/dev/null | sort | tail -n 1)
if [ -z "$reciente" ]; then
  echo "no hay respaldos automáticos de las últimas 26 h en /respaldos"
  exit 1
fi
echo "último respaldo: $(basename "$reciente")"
