#!/usr/bin/env bash
# =============================================================================
# OrbitM7 — Paso 1: RESPALDO COMPLETO EN EL SERVIDOR ORIGEN (DigitalOcean)
#
# Ejecutar en el host de DigitalOcean (SSH), con el backend YA en MAINTENANCE_MODE=true
# (para el respaldo final) o en caliente (para el ensayo en pruebas).
#
# Genera en ./m7_respaldo_<fecha>/ :
#   m7_logistica.dump        pg_dump -Fc de la BD principal
#   evolution.dump           pg_dump -Fc de la BD de Evolution (WhatsApp), si existe
#   vol_<nombre>.tar.gz      volúmenes Docker: llaves JWT (m7_keys) y sesiones de Evolution
#   archivos_backend.tar.gz  archivos generados por la app dentro del contenedor backend
#   conteos.tsv              filas exactas por tabla (para verificar después)
#   SHA256SUMS               sumas de verificación de todo lo anterior
#
# Variables opcionales (si la autodetección no encuentra el contenedor correcto):
#   PG_CONTAINER, BACKEND_CONTAINER
# =============================================================================
set -euo pipefail

DEST="${1:-./m7_respaldo_$(date +%Y%m%d_%H%M)}"
mkdir -p "$DEST"
cd "$DEST"

detectar() {
  # Si hay más de un candidato (p. ej. Contabo: m7-prod-postgres, m7-qa-postgres) NO adivina.
  local c; c=$(docker ps --format '{{.Names}}' | grep -E "$1" | grep -vE "$2" || true)
  if [ "$(printf '%s\n' "$c" | grep -c .)" -gt 1 ]; then
    echo "Hay varios contenedores que coinciden con '$1': $(echo $c). Defina la variable explícitamente." >&2; exit 1
  fi
  printf '%s' "$c"
}
PG_CONTAINER="${PG_CONTAINER:-$(detectar 'postgres' 'backup|evolution')}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-$(detectar 'backend' 'zzz_none')}"
[ -n "$PG_CONTAINER" ] || { echo "No se encontró el contenedor de PostgreSQL. Defina PG_CONTAINER."; exit 1; }
echo "PostgreSQL: $PG_CONTAINER | Backend: ${BACKEND_CONTAINER:-<no encontrado>}"

if [ -n "$BACKEND_CONTAINER" ]; then
  MANT=$(docker exec "$BACKEND_CONTAINER" sh -c 'echo ${MAINTENANCE_MODE:-false}')
  echo "MAINTENANCE_MODE en backend: $MANT"
  [ "$MANT" = "true" ] || echo "⚠  El backend NO está en mantenimiento: sirve para ensayo, NO para el respaldo final."
fi

echo "== 1/5 Volcado BD principal"
docker exec "$PG_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-privileges' > m7_logistica.dump

echo "== 2/5 Volcado BD Evolution (si existe)"
if docker exec "$PG_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d postgres -tAc "select 1 from pg_database where datname='"'"'evolution'"'"'"' | grep -q 1; then
  docker exec "$PG_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d evolution -Fc --no-owner --no-privileges' > evolution.dump
else
  echo "   (no hay BD evolution)"
fi

echo "== 3/5 Conteo exacto de filas por tabla"
docker exec -i "$PG_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -F "	"' > conteos.tsv <<'SQL'
SELECT table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY 1;
SQL
echo "   $(wc -l < conteos.tsv) tablas contadas"

echo "== 4/5 Volúmenes Docker (llaves JWT y sesiones WhatsApp)"
for patron in m7_keys evolution_instances evolution_store; do
  vol=$(docker volume ls --format '{{.Name}}' | grep -E "(^|_)${patron//_/[-_]}$" | head -1 || true)
  if [ -n "$vol" ]; then
    docker run --rm -v "$vol":/v:ro alpine tar czf - -C /v . > "vol_${patron}.tar.gz"
    echo "   $vol -> vol_${patron}.tar.gz"
  else
    echo "   (no existe volumen *${patron})"
  fi
done

echo "== 5/5 Archivos generados por la app (PDF, BASC, noticias, manuales...)"
if [ -n "$BACKEND_CONTAINER" ]; then
  docker exec "$BACKEND_CONTAINER" sh -c '
    cd /app && set -- ; for d in backend/docs public/uploads backend/uploads; do [ -d "$d" ] && set -- "$@" "$d"; done
    [ $# -gt 0 ] && tar czf - "$@" || true' > archivos_backend.tar.gz
  echo "   $(du -h archivos_backend.tar.gz | cut -f1) en archivos_backend.tar.gz"
fi

sha256sum ./* > SHA256SUMS
echo
echo "Respaldo listo en: $(pwd)"
ls -lh
echo
echo "Copiar al servidor nuevo, por ejemplo:"
echo "  rsync -avP $(pwd)/ usuario@IP_CONTABO:/root/$(basename "$(pwd)")/"
