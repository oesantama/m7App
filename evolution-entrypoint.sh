#!/bin/sh
echo "[EVO] evolution-entrypoint.sh starting"
echo "[EVO] DATABASE_URL prefix: ${DATABASE_URL:0:40}..."

if [ -n "$DATABASE_URL" ]; then
  for DIR in /evolution /evolution/prisma /app /app/prisma; do
    if [ -d "$DIR" ]; then
      if [ -f "$DIR/.env" ]; then
        grep -v "^DATABASE_URL" "$DIR/.env" > /tmp/_evo_tmp 2>/dev/null && \
          mv /tmp/_evo_tmp "$DIR/.env" || true
      fi
      echo "DATABASE_URL=$DATABASE_URL" >> "$DIR/.env"
      echo "[EVO] Set DATABASE_URL in $DIR/.env"
    fi
  done
fi

echo "[EVO] Running database migrations..."
cd /evolution && npm run db:deploy

echo "[EVO] Starting application..."
exec node dist/main.js
