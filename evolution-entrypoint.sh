#!/bin/sh
echo "[EVO] Starting. DB: ${DATABASE_URL:0:55}..."
cd /evolution

# Replicate what db:deploy (runWithProvider.js) does internally
rm -rf ./prisma/migrations 2>/dev/null
cp -r ./prisma/postgresql-migrations ./prisma/migrations

# Delete ANY .env files that cp may have brought over from the source directory.
# Without .env files, Prisma CLI uses process.env.DATABASE_URL (from docker-compose).
find /evolution -name ".env" -type f -delete 2>/dev/null || true

echo "[EVO] Running migrations..."
npx prisma migrate deploy --schema ./prisma/postgresql-schema.prisma

echo "[EVO] Starting app..."
exec node dist/main.js
