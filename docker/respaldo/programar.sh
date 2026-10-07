#!/bin/sh
# Programa del contenedor "respaldo" (T801 · docs/despliegue.md): un respaldo por día a la hora
# RESPALDO_HORA (HH:MM, hora de Argentina por TZ). Si la PC estuvo apagada o suspendida a esa
# hora, el respaldo se hace apenas vuelve; también al arrancar, si no hay ninguno automático de
# las últimas 24 h. Si un respaldo falla, se reintenta a los 30 minutos.
set -eu

HORA="${RESPALDO_HORA:-03:00}"
CARPETA=/respaldos
BASE="${PGDATABASE:-sgsm}"

registrar() { echo "$(date '+%Y-%m-%d %H:%M:%S') [respaldo] $*"; }

case "$HORA" in
  [01][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
  *)
    registrar "ERROR: RESPALDO_HORA debe tener el formato HH:MM (24 h), no '$HORA'"
    exit 1
    ;;
esac

# docker stop manda SIGTERM: salir enseguida (la espera es "sleep & wait" para poder cortarla).
trap 'registrar "detenido"; exit 0' TERM INT

# Próxima vez que el reloj marque HORA, en segundos desde 1970.
siguiente() {
  hoy=$(date -d "$HORA" +%s)
  if [ "$hoy" -le "$(date +%s)" ]; then echo $((hoy + 86400)); else echo "$hoy"; fi
}

respaldar() {
  if sh /respaldo/respaldar.sh; then
    objetivo=$(siguiente)
  else
    registrar "ERROR: el respaldo falló (ver arriba); se reintenta en 30 minutos"
    objetivo=$(($(date +%s) + 1800))
  fi
}

mkdir -p "$CARPETA"
# Restos de un respaldo cortado (el contenedor se detuvo a mitad de camino).
rm -f "$CARPETA"/*.parcial

ultimo=$(ls -1 "$CARPETA"/"$BASE"-????-??-??_??????.dump 2>/dev/null | sort | tail -n 1)
if [ -z "$ultimo" ] || [ -z "$(find "$ultimo" -mmin -1440)" ]; then
  registrar "no hay un respaldo automático de las últimas 24 h: se hace uno ahora"
  respaldar
else
  registrar "último respaldo: $(basename "$ultimo")"
  objetivo=$(siguiente)
fi

while :; do
  registrar "próximo respaldo: $(date -d "@$objetivo" '+%Y-%m-%d %H:%M')"
  # Se mira el reloj cada 30 s en lugar de dormir de una vez: si la PC se suspende, el sueño
  # largo se correría y el respaldo llegaría tarde.
  while [ "$(date +%s)" -lt "$objetivo" ]; do
    sleep 30 &
    wait $!
  done
  respaldar
done
