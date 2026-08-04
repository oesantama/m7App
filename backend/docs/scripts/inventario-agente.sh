#!/usr/bin/env bash
#
# OrbitM7 - Agente de Inventario de Activos Tecnologicos (Linux/macOS)
# Milla 7 S.A.S.
#
# Recolecta informacion de hardware, sistema operativo y perifericos,
# y la envia automaticamente a OrbitM7.
#
# Este archivo se descarga desde OrbitM7 (modulo GESTION TI > Inventarios Activos)
# con la URL y la API Key ya configuradas — no requiere edicion manual.

set -u

API_URL="__API_URL__"
API_KEY="__API_KEY__"
ENDPOINT="${API_URL}/api/it-activos/upload-json"

# Re-ejecuta con sudo si no somos root y sudo está disponible, para poder leer
# el serial real via dmidecode (en /sys/class/dmi/id/product_serial suele estar
# protegido). Si el usuario cancela el password, seguimos sin privilegios.
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    exec sudo -p "[OrbitM7] Se requiere sudo para leer el número de serie del equipo — contraseña: " bash "$0" "$@"
fi

hostname_val="$(hostname 2>/dev/null || echo '')"
# En el flujo con sudo, USER/whoami pasan a ser 'root'; SUDO_USER conserva el usuario real.
system_user="${SUDO_USER:-$(whoami 2>/dev/null || echo '')}"

read_dmi() {
    local f="/sys/class/dmi/id/$1"
    [ -r "$f" ] && cat "$f" 2>/dev/null | tr -d '\n'
}

brand="$(read_dmi sys_vendor)"
model="$(read_dmi product_name)"
serial="$(read_dmi product_serial)"

if command -v dmidecode >/dev/null 2>&1; then
    [ -z "${brand:-}" ] && brand="$(dmidecode -s system-manufacturer 2>/dev/null | head -n1)"
    [ -z "${model:-}" ] && model="$(dmidecode -s system-product-name 2>/dev/null | head -n1)"
    [ -z "${serial:-}" ] && serial="$(dmidecode -s system-serial-number 2>/dev/null | head -n1)"
fi

# Nunca usar el hostname/IP como serial: si no se pudo leer el serial real de
# hardware, usar el machine-id (estable y único por instalación) como respaldo.
serial="$(echo "${serial:-}" | tr -d '[:space:]')"
if [ -z "$serial" ] || [ "$serial" = "Not Specified" ] || [ "$serial" = "ToBeFilledByO.E.M." ]; then
    serial="$(cat /etc/machine-id 2>/dev/null | cut -c1-24)"
fi
[ -z "$serial" ] && serial="SIN-SERIAL-$(date +%s)"

if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    os_name="${PRETTY_NAME:-Linux}"
elif [ "$(uname)" = "Darwin" ]; then
    os_name="macOS $(sw_vers -productVersion 2>/dev/null)"
else
    os_name="$(uname -s)"
fi
os_version="$(uname -r 2>/dev/null)"

os_license_status="No aplica (código abierto)"

office_version="No detectado"
office_license_status="No aplica"
if command -v libreoffice >/dev/null 2>&1; then
    office_version="$(libreoffice --version 2>/dev/null | head -n1)"
    office_license_status="Software libre (LibreOffice)"
fi

# Escapado JSON en bash puro (sin dependencia de python3/jq)
json_escape() {
    local s="${1:-}"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="$(printf '%s' "$s" | tr '\n' ' ')"
    printf '"%s"' "$s"
}

peripherals_json="["
first=1
if command -v lsusb >/dev/null 2>&1; then
    while IFS= read -r line; do
        name="$(echo "$line" | sed -E 's/^.*ID [0-9a-f]{4}:[0-9a-f]{4} //')"
        [ -z "$name" ] && continue
        echo "$name" | grep -qi "root hub" && continue
        if [ "$first" -eq 1 ]; then first=0; else peripherals_json+=","; fi
        peripherals_json+="$(json_escape "$name")"
    done < <(lsusb 2>/dev/null)
fi
peripherals_json+="]"

payload=$(cat <<EOF
{
  "serial_number": $(json_escape "$serial"),
  "hostname": $(json_escape "$hostname_val"),
  "system_user": $(json_escape "$system_user"),
  "brand": $(json_escape "$brand"),
  "model": $(json_escape "$model"),
  "os_name": $(json_escape "$os_name"),
  "os_version": $(json_escape "$os_version"),
  "os_license_status": $(json_escape "$os_license_status"),
  "office_version": $(json_escape "$office_version"),
  "office_license_status": $(json_escape "$office_license_status"),
  "peripherals": ${peripherals_json}
}
EOF
)

response=$(curl -s -o /tmp/orbit_inventario_resp.json -w "%{http_code}" -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "$payload")

if [ "$response" = "200" ]; then
    echo ""
    echo "✅ Inventario enviado correctamente a OrbitM7"
    echo "   Serial: $serial | Marca: ${brand:-N/D} | Modelo: ${model:-N/D}"
    echo "   Ahora ingresa a OrbitM7 y busca este serial para completar los datos del custodio."
else
    echo "❌ Error al enviar el inventario. HTTP $response"
    cat /tmp/orbit_inventario_resp.json 2>/dev/null
    exit 1
fi
