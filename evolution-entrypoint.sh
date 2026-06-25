#!/bin/sh
echo "[EVO] Entrypoint starting. DB: ${DATABASE_URL:0:55}..."
echo "[EVO] Running migrations..."
cd /evolution && npm run db:deploy
echo "[EVO] Starting app..."
exec node dist/main.js
