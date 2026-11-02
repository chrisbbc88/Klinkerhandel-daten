# Klinkerhandel ERP – Produktpflege

ERP für Klinkerhandel Harbecke Rhede. Erster Baustein: Produktdaten pflegen, mit Hersteller-Datenblättern abgleichen und nach WooCommerce veröffentlichen. Das ERP ist führend für alle Produktdaten; der Shop zeigt sie nur an.

Ausführliche Projektdokumentation: [`docs/ERP-Dokumentation.md`](docs/ERP-Dokumentation.md)

## Zwei Ausprägungen, ein Datenmodell

1. **Testversion im Browser** (`index.html`, für GitHub Pages): läuft ohne Server, Daten liegen im Browser des jeweiligen Rechners. Austausch zwischen Kollegen über JSON-Sicherungen mit Zusammenführen. Zum Testen des Produktkonzepts mit dem Kunden.
2. **Server-Version** (`src/`, `db/`): PostgreSQL, Anmeldung, Veröffentlichen nach WooCommerce. Übernimmt Sicherungen der Testversion.

### Testversion bauen und veröffentlichen

```bash
npm ci
npm test                 # Logik-Tests (Node, ohne Browser)
npm run build:web        # erzeugt index.html (eine Datei, Shop-Stand eingebettet)
```

`index.html` ins Repository legen und GitHub Pages auf den Hauptzweig/Wurzelordner stellen. Die Seite lädt zur Laufzeit nur die Schrift (Google Fonts), Produktbilder von klinkerhandel.de und beim Datenblatt-Abgleich pdf.js von cdnjs.

**Nie ins Repository:** Sicherungsdateien (`klinkerhandel-erp_*.json`), CSV-Exporte, Shop-Pakete. Sie enthalten Einkaufspreise und Kundendaten; ein GitHub-Pages-Repository ist in der Regel öffentlich. Die `.gitignore` schließt diese Muster aus.

**Hinweis zur Adresse:** Alle GitHub-Pages-Seiten eines Kontos teilen sich eine Browser-Herkunft (`name.github.io`). Andere Werkzeuge auf demselben Konto könnten technisch auf die gespeicherten ERP-Daten zugreifen. Eine eigene Adresse (z. B. `erp.klinkerhandel.de` per CNAME) trennt das sauber.

## Stand

| Baustein | Status |
|---|---|
| Datenbankschema (Steine, Produkte, Bilder, Referenzen, Datenblätter, Preise, Benutzer, Änderungsprotokoll, Sync-Aufträge) | implementiert, lokal geprüft (PGlite und PostgreSQL 16) |
| Erstübernahme des Shop-Bestands mit Abgleichbericht | implementiert, lokal geprüft |
| Testversion im Browser: Dashboard, Produkte (Bestand, Erfassen, Preise, Hinweise, Referenzen, Import & Export), Kontakte, Anfragen & Angebote, Einstellungen | implementiert, lokal im Browser geprüft (Chromium headless) |
| JSON-Sicherung, Sicherungsordner, automatische Sicherung, Zusammenführen | implementiert, lokal geprüft; Ordnerfreigabe nach Browser-Neustart nur in echtem Chrome/Edge prüfbar |
| CSV-Import/-Export Produkte und Kontakte mit Vorschau | implementiert, lokal geprüft |
| Datenblatt-Abgleich (PDF-Text, Mustererkennung) | implementiert, lokal geprüft |
| WooCommerce-Paket (Datei) | implementiert, lokal geprüft; Einspielen im Shop noch nicht erprobt |
| Anmeldung, Rollen (Server) | geplant |
| Veröffentlichen per Klick nach WooCommerce | geplant (Outbox-Tabelle vorhanden) |

## Voraussetzungen

- Node.js ab 22.18 (führt TypeScript direkt aus, kein Build-Schritt)
- PostgreSQL 16 für den Betrieb; für Tests und Probeläufe reicht das mitgelieferte PGlite

## Befehle

```bash
npm ci                     # Abhängigkeiten laut package-lock.json
npm test                   # alle Tests (nutzen PGlite, keine Datenbank nötig)
npm run typecheck          # TypeScript-Prüfung

# Probelauf: zeigt die Befunde, schreibt nichts
node scripts/import-bestand.ts data/bestand-2026-11-02.json --probelauf

# Lokale Datenbank in einem Ordner (PGlite), mit Bericht
node scripts/import-bestand.ts data/bestand-2026-11-02.json --pglite ./lokal-db --bericht ./berichte

# Echter PostgreSQL-Server
export DATABASE_URL=postgresql://user@host:5432/erp
npm run migrate
node scripts/import-bestand.ts data/bestand-2026-11-02.json --bericht ./berichte
```

Die Erstübernahme bricht ab, wenn bereits Produkte im ERP sind. Mit `--nur-neue` werden nur Shop-Einträge übernommen, die das ERP noch nicht kennt; vorhandene ERP-Daten werden nie überschrieben.

## Umgebungsvariablen

| Name | Zweck |
|---|---|
| `DATABASE_URL` | Verbindung zu PostgreSQL |
| `WOO_URL`, `WOO_CONSUMER_KEY`, `WOO_CONSUMER_SECRET` | später: WooCommerce-Schnittstelle (nur auf dem Server, nie im Browser oder im Repository) |
| `ANTHROPIC_API_KEY` | später: Datenblätter auslesen (nur auf dem Server) |

## Aufbau

```
db/migrations/        SQL-Migrationen, laufen in Dateinamen-Reihenfolge, jede komplett oder gar nicht
src/db.ts             Datenbankzugriff (PGlite für Tests, pg für Betrieb), Transaktionen mit Benutzerkontext
src/import/bestand.ts Abbildung Shop-Bestand → ERP-Modell, erzeugt Befunde statt still zu korrigieren
src/import/schreiben.ts  schreibt den Plan in einer Transaktion
src/import/bericht.ts Abgleichbericht (Markdown) und Arbeitsliste (CSV, Excel-sicher)
web/lib/              Logik der Testversion (ohne Browser testbar): Modell, Prüfung, Ändern mit Versionsprüfung,
                      Sicherung/Zusammenführen, CSV, Angebot, Datenblatt-Erkennung, Shop-Paket
web/app/              Oberfläche (Preact + TypeScript), Speicherung in IndexedDB
scripts/build-web.ts  baut index.html
scripts/              Kommandozeilen-Werkzeuge
test/                 automatische Tests (node:test)
data/                 Bestandsdatei aus dem Shop (Stand 02.11.2026)
```
