# ============================================================
# M7 - REPARAR NUCLEO (LIMPIEZA TOTAL Y RECONSTRUCCION)
# ============================================================
# Este script fuerza a Docker a ignorar el cache y reconstruir 
# el frontend y backend desde cero con el codigo actual.
# ============================================================

Write-Host "--- INICIANDO REPARACION NUCLEAR M7 ---" -ForegroundColor Cyan

# 1. Detener contenedores actuales
Write-Host "[1/4] Deteniendo servicios actuales..." -ForegroundColor Yellow
docker compose down

# 2. Limpiar carpetas de construccion
Write-Host "[2/4] Limpiando carpetas de construccion locales..." -ForegroundColor Yellow
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "dist_backend") { Remove-Item -Recurse -Force "dist_backend" }
if (Test-Path "node_modules/.vite") { Remove-Item -Recurse -Force "node_modules/.vite" }

# 3. Reconstruccion Docker
Write-Host "[3/4] Reconstruyendo imagenes de Docker (No-Cache)..." -ForegroundColor Yellow
docker compose build --no-cache

# 4. Levantar servicios
Write-Host "[4/4] Levantando el sistema OrbitM7..." -ForegroundColor Yellow
docker compose up -d

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " [OK] REPARACION COMPLETADA" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "IMPORTANTE: Presione CTRL + F5 en su navegador para limpiar cache." -ForegroundColor Yellow
