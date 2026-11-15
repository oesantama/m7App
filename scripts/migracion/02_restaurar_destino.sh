#!/usr/bin/env bash
# =============================================================================
# OrbitM7 — Paso 2: RESTAURAR EL RESPALDO EN EL SERVIDOR DESTINO (Contabo)
#
# Uso:   CONFIRMAR=SI ./02_restaurar_destino.sh /ruta/m7_respaldo_YYYYMMDD_HHMM
#
# ⚠  REEMPLAZA por completo la BD de destino (DROP SCHEMA public CASCADE).
#    Antes de ejecutar: detener el backend de destino en Coolify (Stop) para que
#    no escriba ni corra migraciones durante la restauración.
#
# Variables opcionales: PG_CONTAINER, BACKEND_CONTAINER, RESTAURAR_VOLUMENES=SI
# =============================================================================
set -euo pipefail

SRC="${1:?Indique la carpeta del respaldo}"
[ "${CONFIRMAR:-}" = "SI" ] || { echo "Esto BORRA la BD de destino. Ejecute con CONFIRMAR=SI."; exit 1; }
cd "$SRC"

echo "== 0/5 Verificando integridad (SHA256SUMS)"
sha256sum -c SHA256SUMS

detectar() {
  # Si hay más de un candidato (p. ej. Contabo: m7-prod-postgres, m7-qa-postgres) NO adivina.
  local c; c=$(docker ps --format '{{.Names}}' | grep -E "$1" | grep -vE "$2" || true)
  if [ "$(printf '%s\n' "$c" | grep -c .)" -gt 1 ]; then
    echo "Hay varios contenedores que coinciden con '$1': $(echo $c). Defina la variable explícitamente." >&2; exit 1
  fi
  printf '%s' "$c"
}
PG_CONTAINER="${PG_CONTAINER:-$(detectar 'postgres' 'backup|evolution')}"
[ -n "$PG_CONTAINER" ] || { echo "No se encontró PostgreSQL. Defina PG_CONTAINER."; exit 1; }
echo "PostgreSQL destino: $PG_CONTAINER"

echo "== 1/5 Reemplazando esquema de la BD principal"
docker exec "$PG_CONTAINER" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'

echo "== 2/5 Restaurando m7_logistica.dump"
docker exec -i "$PG_CONTAINER" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' < m7_logistica.dump
docker exec "$PG_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "ANALYZE;"' >/dev/null

if [ -f evolution.dump ]; then
  echo "== 3/5 Restaurando BD Evolution"
  docker exec "$PG_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d postgres -tAc "select 1 from pg_database where datname='"'"'evolution'"'"'" | grep -q 1 || createdb -U "$POSTGRES_USER" evolution'
  docker exec -i "$PG_CONTAINER" sh -c 'pg_restore -U "$POSTGRES_USER" -d evolution --clean --if-exists --no-owner --no-privileges' < evolution.dump || \
    echo "   ⚠  pg_restore de evolution reportó avisos; revisar si WhatsApp no conecta."
else
  echo "== 3/5 (sin BD evolution en el respaldo)"
fi

echo "== 4/5 Volúmenes (llaves JWT / sesiones WhatsApp)"
if [ "${RESTAURAR_VOLUMENES:-NO}" = "SI" ]; then
  for f in vol_*.tar.gz; do
    [ -f "$f" ] || continue
    patron="${f#vol_}"; patron="${patron%.tar.gz}"
    vol=$(docker volume ls --format '{{.Name}}' | grep -E "(^|_)${patron}$" | head -1 || true)
    if [ -z "$vol" ]; then echo "   ⚠  No existe volumen *${patron} en destino (despliegue primero en Coolify)"; continue; fi
    docker run --rm -i -v "$vol":/v alpine sh -c 'rm -rf /v/* /v/.[!.]* 2>/dev/null; tar xzf - -C /v' < "$f"
    echo "   $f -> $vol"
  done
else
  echo "   Omitido (RESTAURAR_VOLUMENES=SI para copiarlos). En el ENSAYO de pruebas NO restaurar"
  echo "   evolution_*: dejaría dos servidores usando la misma sesión de WhatsApp."
fi

echo "== 5/5 Archivos de la app"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-$(detectar 'backend' 'zzz_none')}"
if [ -f archivos_backend.tar.gz ] && [ -s archivos_backend.tar.gz ] && [ -n "$BACKEND_CONTAINER" ]; then
  if docker exec -i "$BACKEND_CONTAINER" sh -c 'mkdir -p /app && tar xzf - -C /app' < archivos_backend.tar.gz; then
    echo "   copiados a $BACKEND_CONTAINER:/app"
  else
    echo "   ⚠  No se pudieron copiar (¿backend detenido?). Arránquelo y repita solo este paso:"
    echo "      docker exec -i $BACKEND_CONTAINER sh -c 'tar xzf - -C /app' < archivos_backend.tar.gz"
  fi
else
  echo "   (sin archivos o sin contenedor backend; copiar manualmente si aplica)"
fi

echo
echo "Restauración terminada. Siguiente: arrancar el backend en Coolify y ejecutar"
echo "  ./03_verificar.sh $SRC"
