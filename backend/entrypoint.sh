#!/bin/sh
set -e

echo "⏳ Waiting for MySQL to be ready..."
# Wait for MySQL to accept connections (max 60 seconds)
for i in $(seq 1 60); do
  if node -e "
    const net = require('net');
    const s = net.createConnection({host: 'cafeqr-db', port: 3306});
    s.on('connect', () => { s.end(); process.exit(0); });
    s.on('error', () => process.exit(1));
    setTimeout(() => process.exit(1), 2000);
  " 2>/dev/null; then
    echo "✅ MySQL is ready!"
    break
  fi
  echo "   Attempt $i/60 - MySQL not ready, retrying in 2s..."
  sleep 2
done

echo "🔄 Running Prisma migrations..."
npx prisma migrate deploy

echo "🚀 Starting server..."
exec node dist/index.js
