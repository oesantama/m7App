#!/bin/bash

# ==============================================================================
# Script de Limpieza Automática de Backups en Google Drive (m7_backups)
# Ejecutado por Cron diariamente a las 12:30 AM (00:30)
# Remote rclone: cumplidos_m7:m7_backups
# ==============================================================================

LOG_FILE="/tmp/limpieza_backups_drive.log"

echo "--------------------------------------------------" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔄 Iniciando limpieza de backups en Google Drive (cumplidos_m7:m7_backups)..." >> "$LOG_FILE"

# Eliminar en Google Drive archivos con más de 2 días de antigüedad (48 horas)
/usr/bin/rclone delete --min-age 2d cumplidos_m7:m7_backups --include "m7_logistica_*.sql.gz" -v >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Limpieza en Google Drive completada con éxito." >> "$LOG_FILE"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Error durante la limpieza en Google Drive." >> "$LOG_FILE"
fi
