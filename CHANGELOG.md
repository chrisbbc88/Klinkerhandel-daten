# Versionen

Die Versionsnummer steht unten rechts auf jeder Seite der Testversion (Klick öffnet Einstellungen › Über das ERP).
Jede ausgelieferte `index.html` erhält eine neue Nummer (`package.json` → `version`, dann `npm run build:web`).

## v0.3.0 – 02.11.2026
- Datenblatt per KI auslesen (Claude-API) beim Produkt erfassen und im Reiter Datenblatt: Hersteller, Herstellungsart, Farben, Formate, Oberfläche, Maße, Technik, Herstellertext und Textvorschlag; jeder Wert mit Zitat aus dem Dokument und einzeln bestätigt. Ohne Schlüssel: Textsuche im PDF wie bisher.
- API-Schlüssel und Modell unter Einstellungen › Allgemein; der Schlüssel bleibt nur im Browser des jeweiligen Rechners.
- Hersteller ist keine Pflichtangabe mehr. Neu: „Im Shop zeigen“ je Hersteller (Stammdaten) und Ausnahme je Produkt; ausgeblendete Hersteller gehen nicht ins Shop-Paket und nicht in Textvorschläge. Sammelaktion und CSV-Spalte „hersteller_im_shop“.
- Referenzen anlegen und bearbeiten (Name, Objektart, Ort, Rubriken, verbauter Stein, Objekttext, Bilder, Status); Referenzen am Produkt; Referenzen im WooCommerce-Paket.

## v0.2.1 – 02.11.2026
- Versionsanzeige unten rechts (Version und Erstellungszeitpunkt).

## v0.2.0 – 02.11.2026
- Neue Oberfläche mit Seitenleiste: Dashboard, Produkte, Kontakte, Anfragen & Angebote, Einstellungen.
- JSON-Sicherung, Sicherungsordner, automatische Sicherung, Zusammenführen mit Vorschau.
- CSV-Import/-Export für Produkte und Kontakte, WooCommerce-Paket, Datenblatt-Abgleich, Schnellsuche.
