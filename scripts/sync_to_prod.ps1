# Script para sincronizar DB Local con Producción (Coolify)
# Genera un dump de la DB local y lo prepara en el archivo de seed de Docker.

$DB_NAME = "m7_logistica"
$DB_USER = "m7_admin"
$INIT_FILE = "database/seed/init.sql"

Write-Host "--- Iniciando exportación de base de datos local ---" -ForegroundColor Cyan

# Asegurar que el directorio existe
if (!(Test-Path "database/seed")) {
    New-Item -ItemType Directory -Force -Path "database/seed"
}

# Cabecera de limpieza
$Header = @"
-- M7 INITIALIZATION SEED (AUTO-GENERATED)
-- Limpieza total del esquema antes de restaurar
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
GRANT ALL ON SCHEMA public TO `$DB_USER;
"@

Set-Content -Path $INIT_FILE -Value $Header

# Ejecutar pg_dump
Write-Host "Generando volcado de datos..."
try {
    # Usamos -O (no owner) y -x (no privileges) para facilitar la restauración en el contenedor
    pg_dump -U $DB_USER -d $DB_NAME -O -x >> $INIT_FILE
    Write-Host "Exportación completada exitosamente en $INIT_FILE" -ForegroundColor Green
}
catch {
    Write-Host "Error al ejecutar pg_dump. Asegúrate de que PostgreSQL esté en tu PATH." -ForegroundColor Red
}

Write-Host "`nPara aplicar los cambios en Coolify:" -ForegroundColor Yellow
Write-Host "1. Haz git add $INIT_FILE"
Write-Host "2. Haz git commit -m 'Update DB seed from local'"
Write-Host "3. Haz git push"
