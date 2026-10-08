#!/bin/sh
# Genera (o renueva) la CA local del SGSM-RC y el certificado HTTPS del servidor (T802).
# Lo llama scripts/certificado.sh dentro de un contenedor con openssl (o en la PC con --local).
#
# Variables:
#   NOMBRES   nombres del servidor separados por comas (sgsm.local,sgsm.hospital.lan)
#   IPS       direcciones IP del servidor separadas por comas (192.168.1.50)
#   DIR       carpeta de salida (por defecto /certificados)
#   NUEVA_CA  "si" para crear una CA nueva aunque ya exista (hay que reinstalarla en las tablets)
#
# Salida:
#   $DIR/ca/sgsm-ca.key       clave de la CA: SECRETA, nunca sale de la PC ni entra a un contenedor
#   $DIR/ca/sgsm-ca.crt       certificado de la CA (público)
#   $DIR/nginx/servidor.crt   certificado del servidor  } lo que monta nginx
#   $DIR/nginx/servidor.key   clave del servidor        }
#   $DIR/nginx/sgsm-ca.crt    la CA en PEM, para descargar desde las tablets (Android)
#   $DIR/nginx/sgsm-ca.cer    la CA en DER, para descargar desde las tablets (iPad)
set -eu

DIR="${DIR:-/certificados}"
CA="$DIR/ca"
NGINX="$DIR/nginx"
# La CA dura 10 años. El certificado del servidor, 825 días: es el máximo que acepta iOS para
# certificados de una CA instalada a mano (con más, Safari lo rechaza aunque la CA sea de confianza).
DIAS_CA=3650
DIAS_SERVIDOR=825

error() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v openssl >/dev/null 2>&1 || error "no se encontró openssl"

# Nombres alternativos (SAN): los navegadores validan contra estos, no contra el CN. localhost y
# 127.0.0.1 van siempre, para poder probar desde la propia PC servidor.
san=""
vistos=" "
agregar() {
  case "$vistos" in *" $1 "*) return ;; esac
  vistos="$vistos$1 "
  san="${san:+$san,}$1"
}
primer_nombre=""
for nombre in $(echo "${NOMBRES:-}" | tr ',' ' '); do
  case "$nombre" in
    *[!A-Za-z0-9.-]* | .* | *. | "") error "nombre de servidor inválido: '$nombre'" ;;
  esac
  [ -n "$primer_nombre" ] || primer_nombre="$nombre"
  agregar "DNS:$nombre"
done
agregar "DNS:localhost"
for ip in $(echo "${IPS:-}" | tr ',' ' '); do
  case "$ip" in
    *[!0-9A-Fa-f.:]* | "") error "dirección IP inválida: '$ip'" ;;
  esac
  agregar "IP:$ip"
done
agregar "IP:127.0.0.1"
[ -n "$primer_nombre" ] || primer_nombre=localhost

mkdir -p "$CA" "$NGINX"

if [ "${NUEVA_CA:-no}" = si ] || [ ! -s "$CA/sgsm-ca.key" ] || [ ! -s "$CA/sgsm-ca.crt" ]; then
  echo "Creando la CA local (hay que instalarla en cada tablet)..."
  openssl genrsa -out "$CA/sgsm-ca.key" 4096 2>/dev/null
  chmod 600 "$CA/sgsm-ca.key"
  openssl req -x509 -new -key "$CA/sgsm-ca.key" -sha256 -days "$DIAS_CA" \
    -subj "/O=Hospital El Dique/CN=SGSM-RC CA local" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash" \
    -out "$CA/sgsm-ca.crt"
  ca_nueva=si
else
  echo "Se usa la CA existente: las tablets que ya la instalaron no necesitan nada más."
  ca_nueva=no
fi

echo "Creando el certificado del servidor para: $san"
temporal="$(mktemp -d)"
trap 'rm -rf "$temporal"' EXIT
openssl genrsa -out "$temporal/servidor.key" 2048 2>/dev/null
openssl req -new -key "$temporal/servidor.key" -subj "/O=Hospital El Dique/CN=$primer_nombre" \
  -out "$temporal/servidor.csr"
# Lo que exigen iOS y Android: SAN, uso "serverAuth", no es una CA y vale 825 días o menos.
cat >"$temporal/extensiones.cnf" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$san
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
EOF
openssl x509 -req -in "$temporal/servidor.csr" -CA "$CA/sgsm-ca.crt" -CAkey "$CA/sgsm-ca.key" \
  -set_serial "0x$(openssl rand -hex 16)" -days "$DIAS_SERVIDOR" -sha256 \
  -extfile "$temporal/extensiones.cnf" -out "$temporal/servidor.crt" 2>/dev/null
openssl verify -CAfile "$CA/sgsm-ca.crt" "$temporal/servidor.crt" >/dev/null ||
  error "el certificado generado no valida contra la CA"

# Recién ahora se reemplazan los del servidor (si algo falló antes, quedan los anteriores).
cp "$temporal/servidor.key" "$NGINX/servidor.key"
chmod 600 "$NGINX/servidor.key"
cp "$temporal/servidor.crt" "$NGINX/servidor.crt"
cp "$CA/sgsm-ca.crt" "$NGINX/sgsm-ca.crt"
openssl x509 -in "$CA/sgsm-ca.crt" -outform DER -out "$NGINX/sgsm-ca.cer"

# En Linux, que los archivos queden del usuario que corrió el script (el contenedor es root).
if [ -n "${DUENO:-}" ]; then chown -R "$DUENO" "$DIR" 2>/dev/null || true; fi

echo
echo "Listo."
echo "  Válido para:   $san"
echo "  Vence:         $(openssl x509 -in "$NGINX/servidor.crt" -noout -enddate | cut -d= -f2)"
echo "  Huella de la CA (SHA-256), para comparar en la tablet al instalarla:"
echo "    $(openssl x509 -in "$CA/sgsm-ca.crt" -noout -fingerprint -sha256 | cut -d= -f2)"
if [ "$ca_nueva" = si ]; then
  echo "  CA NUEVA: instalala en cada tablet (docs/despliegue.md, \"Instalar la CA en las tablets\")."
fi
