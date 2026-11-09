# PollDeck

Selbst gehostete, interaktive Präsentations- und Abstimmungsplattform nach dem Vorbild von Mentimeter – **ohne Paywall, ohne Teilnehmerlimits, ohne externe Cloud-Dienste**. Gedacht für Unterricht und Nachhilfe (Klassen 6–9), Präsentationen, Umfragen in Gruppen und Quiz-Runden.

- Teilnehmer treten **ohne Account** per 6-stelligem Code, Link oder QR-Code bei.
- Oberfläche auf **Deutsch** (umschaltbar auf Englisch).
- Läuft komplett per **Docker Compose** hinter einem bestehenden **Caddy**-Reverse-Proxy.

## Funktionen

| Bereich | Funktionen |
|---|---|
| Folientypen | Multiple Choice (Balken, Torte, Donut, Punkte, Bilder pro Option), Wortwolke, offene Frage (Karten-Wand/Laufband), Skala, Ranking, 100 Punkte, Rasterfrage 2×2, Zahl schätzen, Q&A mit Upvotes, Quiz – Auswahl, Quiz – Texteingabe, Inhaltsfolie, Leaderboard |
| Präsentieren | Präsentator-Ansicht + Beamer-Ansicht (synchron per WebSocket), Pfeiltasten/Presenter-Clicker, Ergebnisse ein-/ausblenden, Abstimmung sperren, Folie zurücksetzen, Countdown, Notizen, Beitritts-Banner mit QR, großer QR-Code, fliegende Reaktionen, Vollbild |
| Lobby | Zum Start großer QR-Code und Beitrittscode, Teilnehmer erscheinen mit Name und Emoji; beim Start wandert der QR-Code animiert in die Beitrittsleiste |
| Quiz | Countdown, Punkte nach Geschwindigkeit, Tippfehler-Toleranz, automatisches Auflösen bei Countdown-Ende oder sobald alle geantwortet haben (je Folie abschaltbar), Auto-Modus (Quizfragen starten von selbst), Auflösung mit Richtig/Falsch auf dem Handy, Leaderboard mit Podium und Emojis |
| Teilnehmer | Mobile-first, keine App, Name und Emoji wählen, aktueller Punktestand im Kopfbereich, Reconnect ohne Datenverlust (Antworten werden offline zwischengespeichert), Doppelabstimmung über anonyme Geräte-ID verhindert, Survey-Modus (eigenes Tempo), Ende-Bildschirm mit eigenen Ergebnissen zum Speichern/Drucken |
| Moderation | Vorabfreigabe für offene Antworten und Q&A, Wortfilter (DE/EN, im Admin erweiterbar), Antworten löschen, Teilnehmer entfernen |
| Dashboard | Ordner, Suche, Duplizieren, Vorlagen, Teilen (Ansehen/Bearbeiten), JSON-Export/-Import, Quizfragen-Import (CSV/JSON), mehrere archivierte Sitzungen pro Präsentation, Export als CSV, XLSX und PDF-Bericht, eigene Themes |
| Admin | Benutzer anlegen/sperren/löschen/zum Admin machen, Registrierung offen/Einladung/geschlossen, Einladungslinks (optional per Mail), Instanzname, Logo, Standardsprache, Wortfilter, Upload-Limit, Impressum und Datenschutzerklärung (öffentlich unter `/impressum` und `/datenschutz`), Übersicht über aktive Sitzungen und Speicherverbrauch |
| Technik | Node.js 22, Fastify, Socket.IO (Redis-Adapter), Prisma + PostgreSQL 16, Redis 7, React + Vite + Tailwind, i18next, eigene SVG-Charts, keine externen CDNs, keine Telemetrie |

---

## Schnellstart

Voraussetzungen: Docker mit Compose-Plugin und das externe Docker-Netzwerk `reverse-proxy`, in dem Caddy hängt.

```bash
git clone https://git.nebendahl.eu/Mrcoolgamer11/Polldeck.git ~/docker/polldeck
cd ~/docker/polldeck

cp .env.example .env
# Mindestens setzen: APP_DOMAIN, SESSION_SECRET, POSTGRES_PASSWORD, SMTP_*
#   openssl rand -base64 48   → SESSION_SECRET
#   openssl rand -hex 24      → POSTGRES_PASSWORD
nano .env

# Falls das Netzwerk noch nicht existiert:
docker network create reverse-proxy

docker compose up -d --build
docker compose ps        # alle vier Container sollten "healthy" sein
```

Danach `https://poll.nebendahl.eu` öffnen. Der **erste registrierte Benutzer wird automatisch Admin** und bekommt eine Demo-Präsentation mit jedem Folientyp.

Die Datenbank-Migrationen laufen beim Start des `api`-Containers automatisch (`prisma migrate deploy`).

### Container

| Container | Aufgabe | Netzwerke |
|---|---|---|
| `polldeck-web` | Nginx: liefert das Frontend aus, leitet `/api` und `/socket.io` (inkl. WebSocket-Upgrade) an die API weiter | `polldeck_internal`, `reverse-proxy` |
| `polldeck-api` | Fastify-API + Socket.IO, läuft als Benutzer `node` | `polldeck_internal` |
| `polldeck-db` | PostgreSQL 16 | `polldeck_internal` |
| `polldeck-redis` | Redis 7 (Socket.IO-Adapter, Rate-Limiting, Live-Zähler) | `polldeck_internal` |

Es werden **keine Ports nach außen veröffentlicht**. Persistente Daten liegen unter `./data/` (`postgres`, `redis`, `uploads`).

### Demo-Daten (optional)

```bash
docker compose exec api node dist/seed.js
```

Das Seed-Skript legt – falls noch kein Admin existiert – einen Admin an (`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, Standard `admin@polldeck.local` / `polldeck-demo`) und erstellt die Demo-Präsentation „PollDeck-Demo: alle Folientypen“.

---

## Caddy-Einbindung

Das Snippet liegt in [`deploy/Caddyfile.snippet`](deploy/Caddyfile.snippet):

```caddy
poll.nebendahl.eu {
    encode zstd gzip
    reverse_proxy polldeck-web:80
}
```

In die Caddyfile übernehmen und Caddy neu laden, z. B.:

```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

WebSockets funktionieren mit Caddy ohne Zusatzkonfiguration. Nginx im `web`-Container reicht die `Upgrade`/`Connection`-Header an die API weiter.

**Client-IP:** Caddy und Nginx stehen vor der API, deshalb gilt `TRUST_PROXY=2` (Standard in `.env.example`). Die API übernimmt damit die echte Client-IP aus `X-Forwarded-For` für Rate-Limiting und Logs.

**Healthcheck für Uptime Kuma:** `https://poll.nebendahl.eu/api/health` antwortet mit `200` und `{"status":"ok","db":true,"redis":true}`, sonst mit `503`.

---

## Konfiguration

Alle Einstellungen stehen kommentiert in [`.env.example`](.env.example). Die wichtigsten:

| Variable | Bedeutung |
|---|---|
| `APP_DOMAIN` | Öffentliche Domain, wird im Beitritts-Banner und für Links verwendet |
| `APP_NAME` | Name der Instanz (auch im Admin-Bereich änderbar) |
| `SESSION_SECRET` | Langes Zufallsgeheimnis für CSRF-/OIDC-Signaturen |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Datenbankzugang |
| `REGISTRATION_MODE` | `open`, `invite` oder `closed` (Standardwert, im Admin änderbar) |
| `DEFAULT_LOCALE` | `de` oder `en` |
| `MAX_UPLOAD_MB` | Upload-Limit für Bilder (im Admin änderbar) |
| `SMTP_*` | Mailversand für Passwort-Reset und Einladungen (`mail.nebendahl.eu`) |
| `OIDC_*` | Optionales Single Sign-On, z. B. Authentik oder Nextcloud |
| `TZ` | Zeitzone für Exporte/Berichte (Standard `Europe/Berlin`) |

**OIDC einrichten (Beispiel Authentik):** Beim Provider eine OAuth2/OpenID-Anwendung anlegen, als Redirect-URI `https://poll.nebendahl.eu/api/auth/oidc/callback` eintragen, dann `OIDC_ENABLED=true`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` setzen. Mit `OIDC_ADMIN_GROUP` werden Mitglieder einer Gruppe automatisch Admin.

---

## Backup & Restore

Gesichert werden müssen die **Datenbank** und die **Uploads** (`./data/uploads`). Redis enthält nur flüchtige Live-Daten.

### Backup

```bash
cd ~/docker/polldeck
mkdir -p backups
# Datenbank-Dump (konsistent, im laufenden Betrieb)
docker compose exec -T postgres pg_dump -U polldeck -d polldeck -Fc > backups/polldeck-$(date +%F).dump
# Uploads
tar -czf backups/uploads-$(date +%F).tar.gz -C data uploads
```

Beispiel für ein tägliches Backup per Cron (`crontab -e`):

```cron
30 3 * * * cd ~/docker/polldeck && docker compose exec -T postgres pg_dump -U polldeck -d polldeck -Fc > backups/polldeck-$(date +\%F).dump && tar -czf backups/uploads-$(date +\%F).tar.gz -C data uploads && find backups -type f -mtime +30 -delete
```

Der letzte Teil löscht Sicherungen, die älter als 30 Tage sind – so steht es auch in der Datenschutzerklärung-Vorlage (`docs/rechtstexte/`).

### Restore

```bash
cd ~/docker/polldeck
docker compose stop api web
# Datenbank zurückspielen (überschreibt vorhandene Daten)
docker compose exec -T postgres pg_restore -U polldeck -d polldeck --clean --if-exists < backups/polldeck-2026-11-09.dump
# Uploads zurückspielen
tar -xzf backups/uploads-2026-11-09.tar.gz -C data
docker compose start api web
```

---

## Update

```bash
cd ~/docker/polldeck
docker compose exec -T postgres pg_dump -U polldeck -d polldeck -Fc > backups/vor-update-$(date +%F).dump   # zur Sicherheit
git pull
docker compose up -d --build
docker image prune -f
```

Neue Datenbank-Migrationen werden beim Start der API automatisch angewendet. Für Watchtower sind Labels in `docker-compose.yml` vorbereitet (auskommentiert). Da die Images lokal gebaut werden, ist `git pull && docker compose up -d --build` der empfohlene Weg.

---

## Import von Quizfragen (CSV/JSON)

Im Editor über **„Quizfragen importieren“** (Symbol mit Pfeil). Die Fragen werden am Ende der Präsentation angehängt. Beispieldateien: [`apps/web/public/beispiel-quiz.csv`](apps/web/public/beispiel-quiz.csv) und [`apps/web/public/beispiel-quiz.json`](apps/web/public/beispiel-quiz.json). Sie sind auch im Import-Dialog herunterladbar.

### CSV

- Trennzeichen `;` oder `,` (wird automatisch erkannt), UTF-8, erste Zeile ist die Kopfzeile
- Felder mit Trennzeichen in Anführungszeichen setzen: `"Was ist 7×8; ehrlich?"`

| Spalte | Pflicht | Bedeutung |
|---|---|---|
| `type` | nein | `choice` (Auswahl, Standard) oder `text` (Texteingabe) |
| `question` | ja | Fragetext |
| `answer1` … `answerN` | ja | Antwortmöglichkeiten (bei `text`: alle richtigen Antworten) |
| `correct` | bei `choice` | Nummer(n) der richtigen Antwort(en), 1-basiert, mehrere mit `\|` getrennt (z. B. `1\|3`) |
| `time` | nein | Zeit in Sekunden (5–300; Standard 20 bzw. 30) |

Deutsche Spaltennamen werden ebenfalls erkannt: `typ`, `frage`, `antwort1…`, `richtig`, `zeit`.

```csv
type;question;answer1;answer2;answer3;answer4;correct;time
choice;Was ist 7 × 8?;54;56;58;64;2;20
choice;Welche Zahlen sind Primzahlen?;2;4;7;9;1|3;30
text;Übersetze: „der Hund“;dog;the dog;;;;25
```

### JSON

Ein Array (oder ein Objekt mit `questions`-Array) mit diesen Feldern:

```json
[
  { "type": "choice", "question": "Was ist 7 × 8?", "answers": ["54", "56", "58", "64"], "correct": [2], "time": 20 },
  { "type": "text", "question": "Übersetze: „der Hund“", "answers": ["dog", "the dog"], "time": 25, "typos": true, "points": 1500 }
]
```

| Feld | Bedeutung |
|---|---|
| `type` | `choice` oder `text` |
| `question` | Fragetext |
| `answers` | Antwortmöglichkeiten bzw. richtige Antworten (`text`) |
| `correct` | Nummern der richtigen Antworten (1-basiert, nur `choice`) |
| `time` | Sekunden (optional) |
| `points` | Maximale Punkte 100–5000 (optional, Standard 1000) |
| `typos` | Tippfehler tolerieren (nur `text`, Standard `true`) |

**Punkte:** Wer sofort richtig antwortet, erhält die vollen Punkte, wer erst am Ende des Countdowns antwortet, noch die Hälfte. Falsche Antworten geben 0 Punkte.

### Präsentationen als JSON

Über das Menü einer Präsentation im Dashboard lässt sie sich als `.polldeck.json` exportieren. Mit **„Importieren“** im Dashboard wird sie wieder eingelesen, z. B. zum Teilen oder als Backup.

---

## Entwicklung

```bash
corepack enable             # oder: npm i -g pnpm
pnpm install
cp .env.example .env        # DATABASE_URL, REDIS_URL, COOKIE_SECURE=false, APP_URL=http://localhost:5173 setzen
pnpm --filter @polldeck/shared build
pnpm --filter @polldeck/api exec prisma migrate dev
pnpm dev:api                # API auf :3000
pnpm dev:web                # Frontend auf :5173 (Proxy für /api und /socket.io)
```

Struktur:

```
apps/api        Fastify-API, Socket.IO-Live-Server, Prisma-Schema und -Migrationen
apps/web        React-Frontend (Seiten, Folien-Renderer, Teilnehmer-Eingaben, Übersetzungen)
packages/shared Zod-Schemas, Folientypen, Ergebnisberechnung, Quiz-Punkte, Vorlagen, Import
deploy/         nginx.conf, Caddyfile.snippet
e2e/            Playwright-Smoke-Test
scripts/        Lasttest, i18n-Prüfung
```

### Tests

```bash
pnpm test                   # Unit-Tests (Ranking, Quiz-Punkte, Wortwolken-Normalisierung, Import …) + i18n-Prüfung
pnpm e2e                    # E2E-Smoke-Test gegen BASE_URL (Standard http://localhost:5173)
```

Der E2E-Test meldet einen Präsentator an (oder registriert einen, falls die Registrierung offen ist; sonst `E2E_EMAIL`/`E2E_PASSWORD` setzen), startet eine Sitzung, lässt drei Teilnehmer abstimmen und prüft, dass das Ergebnis erscheint. Einmalig `npx playwright install chromium` ausführen.

### Lasttest

```bash
# Sitzung starten, Code ablesen, dann z. B. 300 simulierte Teilnehmer:
node scripts/loadtest.mjs --url https://poll.nebendahl.eu --code 123456 --clients 300
```

Die Clients antworten automatisch auf die aktuelle Folie. Am Ende gibt das Skript Verbindungszeiten, Antwort-Latenz (p50/p95/max), Fehler und die Broadcast-Rate pro Client aus. Ergebnisse werden pro Folie auf maximal etwa 4 Updates pro Sekunde gedrosselt.

---

## Datenschutz

- **Automatische Löschung:** Beendete Sitzungen samt Antworten und Teilnehmern werden nach der im Admin-Bereich eingestellten Frist gelöscht (Standard 365 Tage, 0 = nie). Seit 24 Stunden inaktive Sitzungen werden automatisch beendet. Abgelaufene Logins, Passwort-Links und Einladungen sowie nicht mehr verwendete Bilder werden entfernt. Die Bereinigung läuft alle 6 Stunden und lässt sich im Admin-Bereich auch sofort starten.
- **Logs:** IP-Adressen werden in den API-Logs gekürzt gespeichert, Nginx schreibt keine Zugriffsprotokolle, Docker-Logs sind auf 3 × 10 MB pro Container begrenzt.
- **Betroffenenrechte:** Präsentatoren können im Profil alle eigenen Daten exportieren (JSON) und ihr Konto löschen. Teilnehmer können am Ende einer Sitzung ihre Antworten selbst löschen.
- **Rechtstexte:** Vorlagen für Impressum und Datenschutzerklärung liegen in `docs/rechtstexte/` und werden im Admin-Bereich eingefügt.

## Hinweise

- **Folien-Snapshot:** Beim Start einer Sitzung wird ein Snapshot der Folien gespeichert, damit archivierte Ergebnisse stabil bleiben. Änderungen im Editor gelten ab der nächsten Sitzung („Neue Sitzung“ in der Sitzungsübersicht).
- **Skalierung:** Ausgelegt für eine API-Instanz. 300+ gleichzeitige Teilnehmer pro Sitzung wurden mit dem Lasttest geprüft. Antworten werden gebündelt in die Datenbank geschrieben, Doppelabstimmungen atomar über Redis verhindert.
- **Datenschutz:** Keine Telemetrie, keine externen Schriften oder CDNs. Teilnehmer werden nur über eine zufällige, anonyme Geräte-ID wiedererkannt (Cookie + localStorage), um Doppelabstimmungen zu verhindern.
- **Sicherheit:** HTTP-only-Session-Cookies (`Secure`, `SameSite=Lax`), CSRF-Schutz (Double-Submit-Token), Content-Security-Policy, Rate-Limiting für Logins und Abstimmungen, Eingabevalidierung mit Zod in API und Frontend, Uploads nur als geprüfte PNG/JPG/GIF/WebP.
