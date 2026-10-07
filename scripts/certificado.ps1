# Genera la CA local y el certificado HTTPS del servidor (T802 · docs/despliegue.md) con Docker.
# Equivalente de scripts/certificado.sh para PowerShell; la lógica está en
# docker/nginx/generar-certificados.sh y corre dentro de un contenedor.
#
# Uso: powershell -ExecutionPolicy Bypass -File scripts\certificado.ps1 [-Nombre sgsm.local] [-Ip 192.168.1.50] [-NuevaCa]
#   Sin -Nombre ni -Ip usa SGSM_SERVIDOR y SGSM_IP del .env. localhost y 127.0.0.1 van siempre.
param(
  [string[]]$Nombre,
  [string[]]$Ip,
  [switch]$NuevaCa
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

# Valor de una variable del .env (o vacío).
function Leer-Env([string]$variable) {
  $archivo = Join-Path $raiz '.env'
  if (-not (Test-Path $archivo)) { return '' }
  $linea = Get-Content $archivo | Where-Object { $_ -match "^\s*$variable\s*=" } | Select-Object -Last 1
  if (-not $linea) { return '' }
  return ($linea -replace "^\s*$variable\s*=\s*", '').Trim().Trim('"').Trim("'")
}

$nombres = if ($Nombre) { $Nombre -join ',' } else { Leer-Env 'SGSM_SERVIDOR' }
$ips = if ($Ip) { $Ip -join ',' } else { Leer-Env 'SGSM_IP' }
$nombres = $nombres -replace '\s', ''
$ips = $ips -replace '\s', ''
if (-not $ips) {
  Write-Warning 'Sin IP: las tablets que entren por la dirección IP van a ver un error de certificado.'
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -ne '127.0.0.1' } |
    ForEach-Object { Write-Host "  IPv4 de esta PC: $($_.IPAddress) ($($_.InterfaceAlias))" }
}

$certificados = Join-Path $raiz 'docker\certificados'
New-Item -ItemType Directory -Force $certificados | Out-Null
$nueva = if ($NuevaCa) { 'si' } else { 'no' }

docker run --rm `
  -e "NOMBRES=$nombres" -e "IPS=$ips" -e "NUEVA_CA=$nueva" `
  -v "${certificados}:/certificados" `
  -v "$(Join-Path $raiz 'docker\nginx'):/scripts:ro" `
  nginx:1.27-alpine sh -c 'apk add --no-cache --quiet openssl >/dev/null && sh /scripts/generar-certificados.sh'
if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar el certificado (ver el mensaje de arriba).' }

Write-Host ''
Write-Host 'Siguientes pasos: docs/despliegue.md, "Certificado" (reiniciar la interfaz e instalar la CA en las tablets).'
