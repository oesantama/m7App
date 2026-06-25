#!/bin/sh
echo "[EVO] evolution-entrypoint.sh starting"
echo "[EVO] DATABASE_URL prefix: ${DATABASE_URL:0:40}..."

if [ -n "$DATABASE_URL" ]; then
  # Patch root .env: remove old DATABASE_URL and write ours
  if [ -f /evolution/.env ]; then
    grep -v "^DATABASE_URL" /evolution/.env > /tmp/_evo_root 2>/dev/null && \
      mv /tmp/_evo_root /evolution/.env || true
  fi
  echo "DATABASE_URL=$DATABASE_URL" >> /evolution/.env
  echo "[EVO] Set DATABASE_URL in /evolution/.env"

  # IMPORTANT: Prisma 6 throws a conflict error if DATABASE_URL appears in BOTH
  # /evolution/.env AND /evolution/prisma/.env. Remove it from prisma/.env if present.
  if [ -f /evolution/prisma/.env ]; then
    grep -v "^DATABASE_URL" /evolution/prisma/.env > /tmp/_evo_prisma 2>/dev/null && \
      mv /tmp/_evo_prisma /evolution/prisma/.env
    echo "[EVO] Removed DATABASE_URL from /evolution/prisma/.env (prevents conflict)"
  fi
fi

echo "[EVO] Running database migrations..."
cd /evolution && npm run db:deploy

echo "[EVO] Starting application..."
exec node dist/main.js
