#!/usr/bin/env bash
# PollDeck – tägliche Sicherung von Datenbank und Uploads.
# Sicherungen älter als KEEP_DAYS (Standard 30) werden gelöscht – passend zur
# Datenschutzerklärung (docs/rechtstexte/datenschutz.txt, Abschnitt 11).
#
#   ./scripts/backup.sh                 # manuell
#   30 3 * * * /pfad/zu/polldeck/scripts/backup.sh >> /pfad/zu/polldeck/backups/backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
KEEP_DAYS="${KEEP_DAYS:-30}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
STAMP="$(date +%F_%H%M)"

# Sicherungen enthalten personenbezogene Daten → nur für den Besitzer lesbar.
umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# POSTGRES_USER / POSTGRES_DB aus .env übernehmen (Standard: polldeck).
PGUSER="$(grep -E '^POSTGRES_USER=' .env 2>/dev/null | cut -d= -f2- || true)"
PGDB="$(grep -E '^POSTGRES_DB=' .env 2>/dev/null | cut -d= -f2- || true)"
PGUSER="${PGUSER:-polldeck}"
PGDB="${PGDB:-polldeck}"

echo "[$(date -Is)] Starte Sicherung …"

# Erst in eine temporäre Datei schreiben, damit kein halber Dump liegen bleibt.
TMP="$BACKUP_DIR/.polldeck-$STAMP.dump.tmp"
trap 'rm -f "$TMP"' EXIT
docker compose exec -T postgres pg_dump -U "$PGUSER" -d "$PGDB" -Fc > "$TMP"
mv "$TMP" "$BACKUP_DIR/polldeck-$STAMP.dump"

if [ -d data/uploads ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C data uploads
fi

# Alte Sicherungen löschen.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'polldeck-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -print -delete

echo "[$(date -Is)] Fertig: $(ls -1 "$BACKUP_DIR" | grep -cE '\.(dump|tar\.gz)$') Sicherungsdateien vorhanden."
