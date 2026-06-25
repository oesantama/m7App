#!/bin/sh
set -e

# Patch DATABASE_URL in Evolution's internal .env files before Prisma runs migrations.
# This is needed because Prisma CLI reads the .env file directly and overrides process.env.
if [ -n "$DATABASE_URL" ]; then
  for f in /evolution/.env /evolution/prisma/.env; do
    if [ -f "$f" ]; then
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL|g" "$f"
      echo "[EVOLUTION] Patched DATABASE_URL in $f"
    fi
  done
fi

exec npm start
