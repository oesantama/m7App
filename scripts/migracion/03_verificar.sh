#!/usr/bin/env bash
# =============================================================================
# OrbitM7 — Paso 3: VERIFICAR que el destino tiene exactamente los mismos datos
#
# Uso:  ./03_verificar.sh /ruta/m7_respaldo_YYYYMMDD_HHMM [https://url-del-destino]
# Compara el conteo de filas de cada tabla del respaldo contra la BD de destino.
# Salida con código 0 solo si no falta ninguna fila en ninguna tabla.
# =============================================================================
set -euo pipefail

SRC="${1:?Indique la carpeta del respaldo}"
URL="${2:-}"
PG_CONTAINER="${PG_CONTAINER:?Defina PG_CONTAINER (ej. m7-prod-postgres o m7-qa-postgres)}"

docker exec -i "$PG_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -F "	"' > /tmp/m7_conteos_destino.tsv <<'SQL'
SELECT table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY 1;
SQL

# Las tablas de log/sesión pueden crecer en destino apenas arranca el backend: solo se marca
# error si el destino tiene MENOS filas o le falta la tabla.
awk -F'\t' '
  NR==FNR { dest[$1]=$2; next }
  {
    total++
    if (!($1 in dest))          { print "FALTA TABLA  " $1;                          err++; next }
    if (dest[$1]+0 < $2+0)      { printf "FALTAN FILAS %-45s origen=%s destino=%s\n", $1, $2, dest[$1]; err++; next }
    if (dest[$1]+0 > $2+0)      { printf "más filas    %-45s origen=%s destino=%s (actividad posterior)\n", $1, $2, dest[$1] }
  }
  END { printf "\n%d tablas comparadas, %d con faltantes.\n", total, err; exit (err>0 || total==0) }
' /tmp/m7_conteos_destino.tsv "$SRC/conteos.tsv" && OK=1 || OK=0

if [ -n "$URL" ]; then
  echo
  echo "== Salud del destino ($URL)"
  curl -fsS "$URL/health" && echo
  curl -fsS "$URL/api/maintenance-status" && echo
fi

[ "$OK" = 1 ] && echo "✅ Datos completos." || { echo "❌ Hay diferencias: NO cambiar el DNS todavía."; exit 1; }
