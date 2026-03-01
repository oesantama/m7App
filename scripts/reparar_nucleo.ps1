# ============================================================
# M7 - REPARAR NÚCLEO (LIMPIEZA TOTAL Y RECONSTRUCCIÓN)
# ============================================================
# Este script fuerza a Docker a ignorar el caché y reconstruir 
# el frontend y backend desde cero con el código actual.
# ============================================================

Write-Host "--- INICIANDO REPARACIÓN NUCLEAR M7 ---" -ForegroundColor Cyan

# 1. Detener contenedores actuales
Write-Host "[1/4] Deteniendo servicios actuales..." -ForegroundColor Yellow
docker compose down

# 2. Limpiar cache de construcción de Vite y Node (Local)
Write-Host "[2/4] Limpiando carpetas de construcción locales..." -ForegroundColor Yellow
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "dist_backend") { Remove-Item -Recurse -Force "dist_backend" }
if (Test-Path "node_modules/.vite") { Remove-Item -Recurse -Force "node_modules/.vite" }

# 3. Forzar reconstrucción de Docker SIN CACHÉ
Write-Host "[3/4] Reconstruyendo imágenes de Docker (Sin caché)..." -ForegroundColor Yellow
Write-Host "Esto puede tardar unos minutos pero asegura que el código sea el nuevo." -ForegroundColor Gray
docker compose build --no-cache

# 4. Levantar servicios
Write-Host "[4/4] Levantando el sistema OrbitM7..." -ForegroundColor Yellow
docker compose up -d

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " ✅ REPARACIÓN COMPLETADA" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "IMPORTANTE: Si sigues viendo la versión vieja, presiona CTRL + F5" -ForegroundColor Yellow
Write-Host "en tu navegador (http://localhost:3000) para limpiar el caché visual." -ForegroundColor Yellow
