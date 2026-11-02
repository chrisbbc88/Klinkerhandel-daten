# Klinkerhandel ERP – Produktpflege

ERP für Klinkerhandel Harbecke Rhede. Erster Baustein: Produktdaten pflegen, mit Hersteller-Datenblättern abgleichen und nach WooCommerce veröffentlichen. Das ERP ist führend für alle Produktdaten; der Shop zeigt sie nur an.

Ausführliche Projektdokumentation: [`docs/ERP-Dokumentation.md`](docs/ERP-Dokumentation.md)

## Stand

| Baustein | Status |
|---|---|
| Datenbankschema (Steine, Produkte, Bilder, Referenzen, Datenblätter, Preise, Benutzer, Änderungsprotokoll, Sync-Aufträge) | implementiert, lokal geprüft (PGlite und PostgreSQL 16) |
| Erstübernahme des Shop-Bestands mit Abgleichbericht | implementiert, lokal geprüft |
| Anmeldung, Rollen, Oberfläche | geplant |
| Datenblatt hochladen, auslesen, abgleichen | geplant (Tabellen vorhanden) |
| Veröffentlichen nach WooCommerce | geplant (Outbox-Tabelle vorhanden) |

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
scripts/              Kommandozeilen-Werkzeuge
test/                 automatische Tests (node:test)
data/                 Bestandsdatei aus dem Shop (Stand 02.11.2026)
```
