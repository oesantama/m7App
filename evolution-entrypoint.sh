#!/bin/sh
echo "[EVO] Entrypoint starting"
if [ -n "$DATABASE_URL" ]; then
  echo "DATABASE_URL=$DATABASE_URL" >> /evolution/.env
  echo "[EVO] Set DATABASE_URL: ${DATABASE_URL:0:50}..."
fi
echo "[EVO] Running migrations..."
cd /evolution && npm run db:deploy
echo "[EVO] Starting app..."
exec node dist/main.js
