# Versionen

Die Versionsnummer steht unten rechts auf jeder Seite der Testversion (Klick öffnet Einstellungen › Über das ERP).
Jede ausgelieferte `index.html` erhält eine neue Nummer (`package.json` → `version`, dann `npm run build:web`).

## v0.5.1 – 02.11.2026
- Platzhalter-Liste der E-Mail-Vorlagen bricht sauber um und bleibt in der Karte; Vorlagen-Seite ordnet sich bei schmalen Fenstern neu an.
- Mobilansicht überarbeitet (alle Seiten bei 390 px geprüft): keine Seite läuft mehr seitlich aus dem Bildschirm; Reiter brechen um; Pipeline-Spalten untereinander; Tabellen scrollen innerhalb ihrer Karte; im Bestand und in der Kontaktliste nur die wichtigsten Spalten; Positionen im Angebot seitlich scrollbar mit lesbarer Artikelspalte; Vorlagenauswahl im E-Mail-Dialog als Auswahlliste; Angebotsdruck auf dem Handy lesbar; Versionsanzeige und Meldungen platzsparend.
- Feste Spaltenaufteilungen durch flexible ersetzt (auch für Tablets).

## v0.5.0 – 02.11.2026
- E-Mail-Vorlagen je Situation (Eingangsbestätigung, Rückfrage fehlende Angaben, Angebot, Nachfassen, Auftragsbestätigung, Liefertermin, Bestellung beim Lieferanten, Rückfrage nach Absage) mit Platzhaltern; im Vorgang „E-Mail schreiben“: passende Vorlage vorausgewählt, Text änderbar, kopieren oder im Mailprogramm öffnen, Vermerk beim Kontakt. Vorlagen unter Einstellungen bearbeiten.
- Preisstaffel (Rabatt je Position nach m²) und Mindermengenzuschlag, automatisch angewendet; Handrabatt und Handzuschlag haben Vorrang.
- Vier-Augen-Freigabe ab einstellbarer Summe (Standard 5.000 € netto): Versand erst nach Freigabe durch eine andere Person als den Ersteller.
- Seitenleiste: Bereiche einzeln auf- und zuklappen, mehrere gleichzeitig offen; Zustand wird gemerkt.

## v0.4.0 – 02.11.2026
- Kunden überall als „Vorname Nachname · Firma · Lieferort“ (fehlende Teile als –); neue Anfrage mit Anrede, Vor-/Nachname, Adresse, Firma optional.
- Pipeline-Ansicht mit Spalten Neu, In Bearbeitung, Zur Prüfung, Versendet, Gewonnen, Verloren; Karten per Ziehen verschieben; Kennzahlen: offenes Volumen, Gewonnen, Abschlussquote, Ø Zeit bis Angebot, Nachfassen nach 7 Tagen.
- „Angenommen/Abgelehnt“ heißen jetzt Gewonnen/Verloren; Verlustgrund wird abgefragt und ausgewertet.
- Prüfliste vor dem Versand (6 Punkte, wer/wann); „versendet“ erst nach vollständiger Prüfung und mit Preisen; Änderungen an Positionen/Lieferung setzen die Prüfung zurück.
- Nach Gewinn automatisch Aufgaben (Auftragsbestätigung, Bestellung beim Lieferanten, Liefertermin, Zahlung, Rechnung).
- Anfrage aus E-Mail/Wunschliste: Text einfügen oder .eml laden, KI liest Kunde, Lieferadresse, Zeitraum, Artikel und Flächen; Kontakt wird erkannt oder angelegt; Angebotsentwurf mit Preisen und Fracht.
- Datenqualität je Kunde: vollständig / unvollständig / prüfen / Verdacht auf Fake (Wegwerf-Mail, Testeingaben, unplausible PLZ/Telefon).
- Fracht nach PLZ-Zonen (Einstellungen › Allgemein, Beispielwerte bitte ersetzen).
- Dashboard: „Heute zu tun“.

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
