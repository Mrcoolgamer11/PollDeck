#!/bin/sh
set -e
# Bind-Mounts gehören auf dem Host oft root – Upload-Verzeichnis einmalig
# dem node-Benutzer übergeben und danach die Root-Rechte abgeben.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${UPLOAD_DIR:-/data/uploads}"
  chown -R node:node "${UPLOAD_DIR:-/data/uploads}"
  exec su-exec node "$0" "$@"
fi

echo "Führe Datenbank-Migrationen aus …"
npx --no-install prisma migrate deploy
exec "$@"
