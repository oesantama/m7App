# ============================================================
# M7 - SYNC TOTAL LOCAL → COOLIFY (PROYECTO DOCKERIZADO)
# ============================================================
# Ejecutar en PowerShell desde la raíz del proyecto
# ============================================================

$PROJECT_DIR = "c:\Users\Admin\Documents\oscar\m7App"
$COOLIFY_SERVER = "orbitm7.m7apps.com"
$COOLIFY_SSH_USER = "root"
$BACKUP_FILE = "m7_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " M7 - SINCRONIZACIÓN TOTAL LOCAL → COOLIFY                 " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── PASO 1: COMMIT Y PUSH DEL CÓDIGO ─────────────────────────────
Write-Host "[1/3] Subiendo código (frontend + backend)..." -ForegroundColor Yellow
Set-Location $PROJECT_DIR
git add -A
git commit -m "sync: replica exacta local $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git push
Write-Host "  ✅ Código subido. Coolify hará redeploy automático." -ForegroundColor Green
Write-Host ""

# ── PASO 2: DUMP DB DESDE DOCKER LOCAL ───────────────────────────
Write-Host "[2/3] Exportando base de datos local (Docker)..." -ForegroundColor Yellow

# Encontrar el contenedor de postgres local
$PG_CONTAINER = docker ps --filter "name=postgres" --format "{{.Names}}" 2>$null
if (-not $PG_CONTAINER) {
    $PG_CONTAINER = docker ps --filter "ancestor=postgres:15-alpine" --format "{{.Names}}" 2>$null
}
if (-not $PG_CONTAINER) {
    $PG_CONTAINER = docker ps --format "{{.Names}}" 2>$null | Select-String "post" | Select-Object -First 1
}

if (-not $PG_CONTAINER) {
    Write-Host "  ⚠️  No se encontró contenedor postgres local activo." -ForegroundColor Red
    Write-Host "  Asegúrese de que el proyecto Docker esté corriendo: docker compose up -d" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Si el servidor Coolify tiene el contenedor activo, ejecute DESDE EL SERVIDOR:" -ForegroundColor Yellow
    Write-Host "  ssh $COOLIFY_SSH_USER@$COOLIFY_SERVER" -ForegroundColor Cyan
    Write-Host "  docker exec -i m7-postgres psql -U m7_admin -d m7_logistica < /path/backup.sql" -ForegroundColor Cyan
    exit 0
}

Write-Host "  Contenedor encontrado: $PG_CONTAINER" -ForegroundColor Green

# Hacer el dump dentro del contenedor
docker exec $PG_CONTAINER pg_dump -U m7_admin -d m7_logistica --no-owner --no-acl --clean --if-exists -f "/tmp/$BACKUP_FILE"
docker cp "${PG_CONTAINER}:/tmp/$BACKUP_FILE" "$PROJECT_DIR\$BACKUP_FILE"
Write-Host "  ✅ Backup generado: $BACKUP_FILE" -ForegroundColor Green
Write-Host ""

# ── PASO 3: IMPORTAR EN COOLIFY VÍA SSH ──────────────────────────
Write-Host "[3/3] Importando en Coolify..." -ForegroundColor Yellow
Write-Host ""
Write-Host "  Ejecute estos comandos UNO A UNO:" -ForegroundColor White
Write-Host ""
Write-Host "  # 1. Copiar backup al servidor" -ForegroundColor Gray
Write-Host "  scp $PROJECT_DIR\$BACKUP_FILE ${COOLIFY_SSH_USER}@${COOLIFY_SERVER}:/tmp/" -ForegroundColor Cyan
Write-Host ""
Write-Host "  # 2. Conectarse al servidor" -ForegroundColor Gray
Write-Host "  ssh ${COOLIFY_SSH_USER}@${COOLIFY_SERVER}" -ForegroundColor Cyan
Write-Host ""
Write-Host "  # 3. Copiar backup al contenedor postgres de producción" -ForegroundColor Gray
Write-Host "  docker cp /tmp/$BACKUP_FILE m7-postgres:/tmp/" -ForegroundColor Cyan
Write-Host "  (Si el nombre del contenedor es distinto use: docker ps | grep post)" -ForegroundColor Gray
Write-Host ""
Write-Host "  # 4. Restaurar la base de datos" -ForegroundColor Gray
Write-Host "  docker exec -i m7-postgres psql -U m7_admin -d m7_logistica -f /tmp/$BACKUP_FILE" -ForegroundColor Cyan
Write-Host ""
Write-Host "  # 5. Reiniciar el backend para aplicar migración" -ForegroundColor Gray
Write-Host "  docker restart m7app-backend" -ForegroundColor Cyan
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " ✅ LISTO: Coolify tendrá el código Y los datos del local   " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
