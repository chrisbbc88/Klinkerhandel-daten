# Versionen

Die Versionsnummer steht unten rechts auf jeder Seite der Testversion (Klick öffnet Einstellungen › Über das ERP).
Jede ausgelieferte `index.html` erhält eine neue Nummer (`package.json` → `version`, dann `npm run build:web`).

## v0.7.0 – 04.11.2026
- **Preise je Format übersichtlich:** Im Produkt (Reiter Preise und Daten) eine Tabelle „Aktuelle Preise je Format“ mit EK, VK und Aufschlag je Format; „allg.“ zeigt, wo noch der allgemeine Preis gilt. Ein Klick auf „Preis für DF“ stellt das Formular auf dieses Format.
- **Preispflege (Produkte › Preise)** jetzt mit einer Zeile je Produkt und Format, Filter nach Format, Aufschlagsregel und Sammelspeichern je Format.
- **Produkt erfassen:** optional abweichender VK je Format.
- **Kurztext und Beschreibung je Format** (Karte „Texte je Format“ am Produkt): eigener Text je Variante, Vorschlag aus den Stammdaten mit Maßen, Bedarf und Prüfwerten des Formats, optional KI-Entwurf für alle Formate (eigener Claude-Schlüssel, Text wird erst nach Prüfung gespeichert).
- **Schutz vor doppelten Inhalten:** Ähnlichkeit zu den anderen Formattexten und zum allgemeinen Text wird angezeigt; ab 60 % Warnung und Prüfpunkt „Texte zu ähnlich“. Neuer Prüfpunkt „Text je Format fehlt“ bei Produkten mit mehreren Formaten; „Kein Verkaufspreis“ nennt Formate ohne Preis.
- **CSV „Formate, Preise und Texte“:** zusätzlich VK/EK, Kurztext und Beschreibung für Verblender und Riemchen je Format, neue Preise mit „preis_gueltig_ab“.
- Shop-Paket: Kurztext und Beschreibung je Variante (Preise gehen weiterhin nicht in den Shop).
- Server-Version: Migration `0003_format_texte.sql` (Kurztext und Beschreibung in `produkt_format`).

## v0.6.0 – 03.11.2026
- **Formate als Varianten eines Steins:** Maße, Druckfestigkeit, Wasseraufnahme, Frost, Gewicht, Bedarf je m² und Hersteller-Artikelnummer werden je Format (NF, DF, WF …) geführt statt einmal je Stein. Verblender und Riemchen teilen sich diese Werte; welche Formate ein Produkt anbietet, wird weiterhin am Produkt gewählt.
- **Normmaße automatisch:** DF 240×115×52, NF 240×115×71, 2DF 240×115×113, WF 210×100×50, WDF 210×100×65, RF 250×120×65 als Normmaß; LDF 290×90×52 und XLDF 365×115×52 als übliche (herstellerabhängige) Maße. Leere Maßfelder zeigen das Normmaß; eingetragen wird nur, was laut Datenblatt abweicht. Formate ohne einheitliches Maß (LF, ModF, Modul, BDF, BDF-XL, BS) können in den Stammdaten festgelegt werden; neue Formate lassen sich anlegen.
- **Bedarf je m² berechnet** aus Länge, Höhe und Fugen (Standard Stoßfuge 10 mm, Lagerfuge 12 mm, einstellbar unter Stammdaten): NF 48, DF 63, WF 73, WDF 59, 2DF 32 Stück. Ein eingetragener Wert hat Vorrang.
- Prüfung je angebotenem Format („Frost, Druckfestigkeit oder Wasseraufnahme fehlen: NF, DF“); Knopf „Prüfwerte auf alle Formate übertragen“.
- Datenblatt (KI): liest Werte je Format aus; Format über Bezeichnung oder Maße erkannt; Normmaße gelten als „stimmt“ und werden nicht doppelt gespeichert. Ohne KI: Format aus den Maßen erkannt oder auswählbar.
- Preise optional je Format (z. B. DF teurer als NF); ohne Formatpreis gilt der allgemeine Preis.
- Angebote: Format je Position (bestimmt Stückzahl und Preis), schon bei der neuen Anfrage wählbar und aus E-Mail-Anfragen übernommen; Versand erst, wenn bei Produkten mit mehreren Formaten eins gewählt ist. Druckansicht und E-Mail-Vorlagen nennen das Format mit Maßen.
- Neue CSV „Formate und Technik“ (eine Zeile je Stein und Format) unter Import & Export; die Technikspalten der Produkt-CSV entfallen dafür.
- Shop-Paket Version 3: je Produkt `varianten` mit Maßen und Technik je Format (Grundlage für Varianten im Shop).
- Ältere Sicherungen werden beim Einlesen automatisch umgestellt: Steinwerte gehen an das Format, zu dem die Maße passen, oder an das einzige Format; sonst an alle Formate mit dem Vermerk „aus alten Steindaten – prüfen“.
- Server-Version: Migration `0002_stein_format.sql` (neue Tabelle `stein_format`, Preise je Format, Fugen-Einstellung; alte Spalten bleiben erhalten).

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
