# Klinkerhandel ERP – Projektdokumentation

Stand: 02.11.2026 · Verantwortlich: Christian (BBC Digital) · Auftraggeber: Klinkerhandel Harbecke Rhede, Klaus Langenbrink

Statusbegriffe in diesem Dokument: **geplant** · **implementiert** · **lokal geprüft** · **in Staging geprüft** · **produktiv geprüft**.

---

## 1. Zielbild, Annahmen, Umfang

### Projektbriefing

| | |
|---|---|
| Projekt | Klinkerhandel ERP |
| Branche | Fachhandel für Klinker, Verblender, Riemchen, Dämm- und Nistklinker. Lieferant der Ware ist das Baustoffzentrum Harbecke; Klinkerhandel vergibt eigene Artikelnummern (HBR-Codes) und eigene Preise. |
| Bestehender Code | Produktstation (einzelne HTML-Datei, Prototyp ohne Speicherung). ERP-Repository: Neubau, dieses Projekt. |
| Nutzung | Intern, ein Unternehmen. Kein Mandantenmodell. |
| Nutzer | Klaus, Tobi, Sven, Assistenz; Christian für Betreuung und Tests. Etwa 5 Konten, selten gleichzeitig. |
| Launch-Umfang | Produktpflege, Datenblatt-Abgleich, Veröffentlichen nach WooCommerce. |
| Danach | Anfrage → Angebotsentwurf. |
| Web/Mobil | Responsive Webanwendung im Browser. Keine App, kein Offlinebetrieb. |
| Externe Systeme | WooCommerce (klinkerhandel.de, Alfahosting), Claude-API zum Auslesen der Datenblätter. Die Warenwirtschaft des Baustoffzentrums wird **nicht** angebunden. |
| Datenmengen | ca. 320 Steine, 560 Produkte, 180 Referenzen, 1.900 Bilddateien; Wachstum gering. |
| Infrastruktur | Eigener Server des Kunden möglich, Details offen (siehe Abschnitt 7). Datenregion EU. |
| Budget, Termin | offen |
| Freigaben für externe Änderungen | keine. Jede Veröffentlichung in den Live-Shop braucht eine ausdrückliche Freigabe. |

### Annahmen (reversibel, bis zur Bestätigung)

1. Die Rollen verteilen sich so: Christian = Admin, Klaus = Leitung, Tobi, Sven, Assistenz = Pflege. Wer Einkaufspreise sehen darf, entscheidet der Kunde.
2. Farben hängen am Stein (Verblender und Riemchen gleich), Formate am Produkt (sie unterscheiden sich im Bestand zwischen Verblender und Riemchen).
3. Preise werden im Shop nicht gezeigt (Katalogmodus bleibt). Sie dienen intern und später für Angebote.
4. Produkt-URLs im Shop bleiben unverändert; der Umbau von Kategorien zu Attributen erfolgt erst nach Freigabe des Zielmodells und mit Weiterleitungsplan.
5. Das ERP ist die einzige Stelle, an der Produktdaten geändert werden. Änderungen direkt im WordPress-Backend werden beim Abgleich als Abweichung gemeldet, aber nie automatisch übernommen.

### Funktionsumfang

**Notwendig für den Launch**

| # | Funktion | Abnahmekriterien |
|---|---|---|
| L1 | Erstübernahme des Shop-Bestands | Alle 741 Einträge sind zugeordnet; keine Artikelnummer doppelt; Widersprüche erscheinen als Befund und werden nicht still korrigiert; zweiter Lauf legt nichts doppelt an. **Implementiert, lokal geprüft.** |
| L2 | Anmeldung und Rollen | Anmeldung mit E-Mail und Passwort, Zwei-Faktor für Admin und Leitung; Rechte serverseitig geprüft; gesperrte Konten kommen nicht hinein; jede Änderung trägt den Benutzer im Protokoll. |
| L3 | Produkt- und Steinpflege | Liste mit Suche, Filter nach Befund, Hersteller, Art; Bearbeiten mit Konflikterkennung (wer zuletzt speichert, überschreibt nicht unbemerkt); Massenänderung mit Vorschau. |
| L4 | Arbeitsliste Befunde | Befunde je Produkt sichtbar, erledigen oder begründet ignorieren; erledigte verschwinden aus der Liste; neue Prüfung nach jeder Änderung. |
| L5 | Datenblatt hochladen und abgleichen | PDF oder Foto hochladen; gleiche Datei wird erkannt; KI liest Werte aus; Vergleich „im ERP“ ↔ „laut Datenblatt“ je Feld; jede Übernahme einzeln bestätigt und protokolliert; das Datenblatt bleibt am Stein abrufbar. |
| L6 | Preise pflegen | EK und VK je Produkt und Einheit (m², Stück, Palette), mit Gültig-ab-Datum; alte Preise bleiben erhalten; nur berechtigte Rollen sehen EK. |
| L7 | Veröffentlichen nach WooCommerce | Knopf „Veröffentlichen“ für Leitung/Admin; Vorschau der Änderungen; Übertragung über Auftragsliste mit Wiederholung; kein Doppelanlegen bei Zeitüberschreitung; Übersicht mit letztem Erfolg und Fehlern; zuerst gegen Staging geprüft. |
| L8 | Betrieb | Tägliche Datensicherung, getestete Wiederherstellung, HTTPS, Fehlerüberwachung. |

**Sinnvoll danach:** Anfrage → Angebotsentwurf (Webhook aus dem Avada-Formular, Mengen- und Preisrechnung, Status „zu prüfen“) · Referenzen als eigener Bereich im Shop · Umbau Farben/Formate zu Attributen, Hersteller zu Marken · Produkttexte von Claude mit Freigabe.

**Optional:** Bild-Upload mit automatischer Benennung und Alt-Text · Preislisten-Import aus Lieferantendateien · Auswertungen.

---

## 2. Architektur, Datenmodell, Berechtigungen

### Entscheidung

Responsive Webanwendung: **React + TypeScript** im Browser, **Node.js (TypeScript) auf dem Server**, **PostgreSQL 16**. Betrieb als Docker-Container, entweder auf dem Server des Kunden oder bei einem EU-Hoster.

| | Begründung |
|---|---|
| Eigener Server statt Supabase | 5 Nutzer, ein Unternehmen, keine Echtzeit-Funktionen nötig. Supabase brächte Row Level Security, Auth-Dienst und Storage mit, die hier mehr Betriebsaufwand als Nutzen bringen, vor allem selbst gehostet. Schlüssel für WooCommerce und Claude müssen ohnehin auf einen Server. |
| Kein WordPress-Plugin | Preise, Datenblätter und später Angebote gehören nicht in die Website-Installation. Ein Fehler im ERP darf die Website nicht beeinträchtigen und umgekehrt. |
| PostgreSQL | Transaktionen, Constraints, Versionsprüfung und ein unveränderliches Änderungsprotokoll direkt in der Datenbank. |
| Node mit TypeScript ohne Build | Node ab 22.18 führt TypeScript direkt aus. Weniger Werkzeuge, gleiche Sprache in Oberfläche und Server. |

**Grenzen:** Wir betreiben Server, Updates und Sicherungen selbst (Christian). Bei einem eigenen Server des Kunden gehören Erreichbarkeit aus dem Internet, Firewall und Stromausfall dazu.

**Alternativen:** Supabase in der EU-Region (weniger Betrieb, dafür Anbieterbindung und RLS-Pflege); WordPress-Plugin (billig, aber eng an die Website gekoppelt). Kosten der Varianten sind noch nicht geprüft und werden vor der Entscheidung über das Hosting mit aktuellen Anbieterpreisen ergänzt.

### Schichten

```
Browser (React)  ──HTTPS──>  Server (Node, TypeScript)
                              ├─ Anmeldung, Rollenprüfung
                              ├─ Fachlogik (Steine, Produkte, Befunde, Preise, Datenblätter)
                              ├─ Datenbankzugriff (src/db.ts, Transaktion mit Benutzerkontext)
                              └─ Integrationen: WooCommerce-Worker (Outbox), Claude-API
                                       │
                                  PostgreSQL 16  +  Dateiablage für Datenblätter
```

### Datenmodell (implementiert: `db/migrations/0001_grundschema.sql`, `0002_stein_format.sql`)

| Tabelle | Inhalt | Wichtige Regeln |
|---|---|---|
| `stein` | Der Klinker selbst: HBR-Code, Hersteller, Herstellungsart, Maße, technische Werte, Herstellertext | HBR-Code eindeutig, Form `HBR 00-000`; Werte nur positiv; Frost F0–F2; Versionszähler |
| `stein_farbe` | Farben je Stein, Position 0 = Hauptfarbe | nur bekannte Farben |
| `stein_format` (ab 0002) | Werte je Stein und Format: Maße, Gewicht, Druckfestigkeit, Wasseraufnahme, Frost, Bedarf, Artikelnr. Hersteller | nur Eingetragenes; leere Maße = Normmaß aus `format`; Maß-/Technikspalten in `stein` veraltet |
| `produkt` | Was im Shop steht: Verblender, Riemchen, Dämm-, Nistklinker; SKU, Woo-ID, Status, Texte | SKU eindeutig, Riemchen enden auf „ R“; je Stein höchstens ein Verblender und ein Riemchen; „freigegeben“ nur mit SKU |
| `produkt_format` | Formate je Produkt | nur bekannte Formate |
| `bild`, `produkt_bild`, `referenz_bild` | Bilddateien einmalig, Alt-Text an der Datei; Zuordnung mit Reihenfolge | Woo-Medien-ID eindeutig |
| `referenz` | Objektfotos, verknüpft mit dem Stein | Code aus dem Shop bleibt erhalten, auch wenn kein Stein passt |
| `hersteller`, `lieferant`, `farbe`, `format` | Stammdaten | Präfix je Hersteller eindeutig |
| `datenblatt`, `datenblatt_wert` | Hochgeladene Blätter und ausgelesene Werte mit Entscheidung offen/übernommen/abgelehnt | gleiche Datei (SHA-256) nur einmal |
| `preis` | EK/VK, netto, EUR, je m²/Stück/Palette, ab Datum | Historie bleibt, kein Überschreiben |
| `import_lauf`, `befund` | Übernahmen und offene Prüfpunkte | Befunde werden nie gelöscht, nur erledigt/ignoriert |
| `sync_auftrag` | Ausgang nach WooCommerce (Outbox) | Idempotenzschlüssel eindeutig |
| `aenderung` | Änderungsprotokoll: wer, wann, was alt, was neu | nur anfügen, Ändern und Löschen gesperrt |
| `benutzer` | Konten und Rolle | E-Mail eindeutig |

Geldbeträge: `numeric(12,2)` netto in EUR. Zeiten: `timestamptz` (gespeichert in UTC, angezeigt in Europe/Berlin). Gültigkeitsdaten: `date` ohne Uhrzeit.

**Gleichzeitiges Bearbeiten:** Jede Speicherung schreibt mit `WHERE id = … AND version = …`. Hat jemand anders inzwischen gespeichert, ändert sich nichts und die Oberfläche zeigt beide Stände zum Auflösen. (Lokal geprüft.)

**Änderungsprotokoll:** Datenbank-Trigger auf Stein, Produkt, Formaten, Bildern, Referenzen, Preisen, Herstellern und Benutzern. Schreiben ohne Benutzerkontext wird abgelehnt. (Lokal geprüft.) Im Betrieb bekommt die Anwendung eine eigene Datenbankrolle ohne Recht, Trigger zu entfernen.

### Berechtigungsmatrix (Vorschlag, Freigabe durch den Kunden)

| Aktion | Lesen | Pflege | Leitung | Admin |
|---|:-:|:-:|:-:|:-:|
| Produkte, Steine, Referenzen ansehen | ✓ | ✓ | ✓ | ✓ |
| Produkte bearbeiten, Datenblätter hochladen und abgleichen | | ✓ | ✓ | ✓ |
| Befunde erledigen oder ignorieren | | ✓ | ✓ | ✓ |
| Zur Prüfung geben | | ✓ | ✓ | ✓ |
| Massenänderungen | | | ✓ | ✓ |
| Verkaufspreise ansehen | ✓ | ✓ | ✓ | ✓ |
| Einkaufspreise ansehen und ändern | | | ✓ | ✓ |
| Verkaufspreise ändern | | | ✓ | ✓ |
| Nach WooCommerce veröffentlichen | | | ✓ | ✓ |
| Benutzer einladen, sperren, Rollen ändern | | | | ✓ |
| Synchronisation neu anstoßen, Fehler auflösen | | | | ✓ |

Rechte werden auf dem Server geprüft, nicht über ausgeblendete Knöpfe. Rollen ändert nur ein Admin; niemand kann sich selbst befördern.

---

### Testversion im Browser (GitHub Pages) – Stand 02.11.2026

Auf Wunsch (Test mit dem Kunden über einen GitHub-Link) gibt es zusätzlich zur Server-Version eine Testversion, die vollständig im Browser läuft. Sie dient dazu, das Produktkonzept mit Klaus, Tobi, Sven und der Assistenz zu prüfen, bevor der Server steht.

| Thema | Lösung in der Testversion | Grenze |
|---|---|---|
| Auslieferung | eine Datei `index.html` (Preact + TypeScript, mit esbuild gebaut), Shop-Stand eingebettet | — |
| Speicherung | IndexedDB im Browser, je Rechner und Browser getrennt; zweiter Tab nur lesend (Web Locks) | Browserdaten löschen = Daten weg → Sicherung |
| Sicherung | JSON-Datei; Sicherungsordner auf dem Rechner (File System Access API, Chrome/Edge), automatisch alle 15/30/60/120 Minuten, nur wenn sich etwas geändert hat; Kontrolle durch Zurücklesen; sonst Download mit Erinnerung | Firefox/Safari: nur Download |
| Austausch im Team | Import mit Vorschau. **Zusammenführen:** je Datensatz gewinnt die jüngere Änderung, Löschvermerke bleiben, gleiche HBR-Nummer/Artikelnummer/Vorgangsnummer mit unterschiedlicher ID wird nicht übernommen, sondern gemeldet. **Ersetzen:** nur mit Sicherung des alten Stands. Liegt der Sicherungsordner in einem gemeinsamen Cloud-Ordner, meldet das ERP neuere Stände der Kollegen. | kein gleichzeitiges Arbeiten an derselben Datenbank; Konflikte werden nach „jüngste Änderung gewinnt“ je Datensatz gelöst |
| Gleichzeitige Bearbeitung | Versionsnummer je Datensatz; Speichern mit veralteter Version wird abgelehnt | — |
| Nachvollziehbarkeit | Änderungsprotokoll mit Bearbeiter, Feld, alt → neu; Verlauf je Produkt | Bearbeiter wird gewählt, nicht angemeldet |
| Nummern | IDs aus Zeitstempel + Zufall; Angebotsnummer `AN-Jahr-Kürzel-lfd.` (Kürzel des Bearbeiters), damit zwei Rechner keine gleiche Nummer vergeben | — |
| WooCommerce | Paketdatei mit neuen/geänderten freigegebenen Produkten; „als eingespielt markieren“ erst nach Bestätigung | kein Veröffentlichen per Klick (API-Schlüssel gehört auf einen Server) |
| Datenblätter | Mit KI: PDF/Foto direkt an die Claude-API (strukturierte Ausgabe nach festem Schema, nur erlaubte Farben/Formate, Plausibilitätsgrenzen, Zitat je Wert), jeder Wert bestätigt. Ohne KI: PDF-Text mit pdf.js und Mustererkennung. Original bleibt im Browser des prüfenden Rechners | API-Schlüssel liegt im Browser des Rechners (nicht in Sicherungen/Repository); jeder Nutzer dieses Browsers kann ihn verwenden → eigener Schlüssel mit Ausgabenlimit. Server-Version: Schlüssel nur auf dem Server |
| Hersteller im Shop | „Im Shop zeigen“ je Hersteller, Ausnahme je Produkt; ausgeblendet = Herstellername fehlt im Shop-Paket, Paket-Feld `hersteller_anzeigen: false` (Herstellerkategorie/Marke entfernen) | Schlagwörter im Shop nennen bisher alle Hersteller bei jedem Produkt – beim Shop-Umbau entfernen |
| Referenzen | anlegen/bearbeiten, Stein-Verknüpfung, Rubriken = Unterkategorien „Referenzen …“, im Shop-Paket als Produkt der Kategorie Referenzen | Bilder werden in WordPress hochgeladen, im ERP nur verknüpft |

Module der Testversion: Dashboard (Kennzahlen, „Wo ansetzen“, Hersteller, Status, Sicherung, Änderungen), Produkte (Bestand mit Filtern und Sammelbearbeitung, Produkt erfassen mit nächster freier HBR-Nummer, Preise mit Aufschlag-Regel, Hinweise, Referenzen, Import & Export), Kontakte (Kunden, Hersteller, Lieferanten, Partner, Aktivitäten, Preisanfrage per E-Mail, CSV), Anfragen & Angebote (Statusfolge, Mengen aus Fläche + Verschnitt, Stück aus Bedarf je m², Druckansicht/PDF), Einstellungen (Bearbeiter, Firma, Angebot, Sicherung, Stammdaten mit Präfix-Zuordnung), Schnellsuche (Strg + K).

Fachregeln, die die Testversion durchsetzt: Hersteller ist optional (Empfehlung, keine Pflicht); Referenzen nur mit Stein, Bild und Rubrik freigeben; Freigabe nur ohne Pflichtlücken; Steindaten gelten für Verblender und Riemchen gemeinsam; Herstellerwechsel zieht beide Produkte mit; Produkte mit Shop-ID werden archiviert statt gelöscht; Preise werden mit Gültigkeitsdatum ergänzt, nicht überschrieben; Angebote sind ab „Gesendet“ gesperrt; Statuswechsel nur entlang der festgelegten Folge (Neu → In Bearbeitung → Angebot erstellt → Gesendet → Angenommen/Abgelehnt → Archiviert).

### Formate als Varianten eines Steins (ab v0.6.0)

Anlass: Termin mit dem Kunden am 03.11.2026 – derselbe Klinker (z. B. HBR 10-100) wird in mehreren Formaten geführt (NF, DF, 2DF …); je Format unterscheiden sich Maße, Druckfestigkeit und Wasseraufnahme.

**Entscheidung (umkehrbar):** Ein Stein bleibt ein Datensatz mit einer HBR-Nummer; Verblender und Riemchen bleiben je ein Produkt. Die Formate sind Varianten mit eigenen Werten (`Stein.format_daten` bzw. Tabelle `stein_format`). Am Produkt wird gewählt, welche Formate angeboten werden. Keine eigene HBR-Nummer je Format, weil Hersteller, Farbe, Oberfläche, Bilder, Texte und Referenzen gleich sind und sonst mehrfach gepflegt würden.

| Wert | gilt für | Herkunft, wenn leer |
|---|---|---|
| Hersteller, Herstellungsart, Farben, Oberfläche, Herstellertext | Stein (alle Formate) | – |
| Länge, Breite, Höhe | Stein + Format | Normmaß aus den Stammdaten (Formate) |
| Druckfestigkeit, Wasseraufnahme, Frost, Gewicht, Artikelnr. Hersteller | Stein + Format | – (Prüfpunkt „empfohlen“) |
| Bedarf je m² | Stein + Format | berechnet: 1 m² ÷ ((L + Stoßfuge) × (H + Lagerfuge)), Fugen 10/12 mm einstellbar |
| Riemchenstärke, Eckriemchen | Produkt (Riemchen) | – |
| VK/EK | Produkt, optional je Format | allgemeiner Preis des Produkts |
| Format im Angebot | Position | bei nur einem Format automatisch; sonst Pflicht vor dem Versand |

**Normmaße:** DF 240×115×52, NF 240×115×71, 2DF 240×115×113 (DIN-Formate); WF 210×100×50, WDF 210×100×65 (Waalformate); RF 250×120×65 (Reichsformat). Übliche, herstellerabhängige Maße: LDF 290×90×52, XLDF 365×115×52. Ohne einheitliches Maß: LF, ModF, Modul, BDF, BDF-XL, BS – Maße aus dem Datenblatt am Stein oder einmal in den Stammdaten festlegen. Quellen: [hausjournal.net – Klinkermaße](https://www.hausjournal.net/klinker-masse), [Röben – Klinkerformate und Schichtmaße](https://www.roeben.com/en/clinker-formats-and-layer-dimensions), [Röben XLDF-Produktseite](https://en.roben.pl/facade/facade-products/polish-clinker-bricks/melbourne-xldf-red-smooth), [Baunetz Wissen – Modulformat](https://www.baunetzwissen.de/drucken/modulformat-4768202). Bitte vom Kunden bestätigen lassen, insbesondere LDF/XLDF und die Bedeutung von BDF, BS und Modul im eigenen Sortiment.

**Offen beim Kunden:** Gibt es Preise je Format (dann je Format pflegen)? Sollen Formate im Shop als Varianten (variables Produkt mit Attribut „Format“) erscheinen oder weiter als Kategorie? Braucht jedes Format eine eigene Artikelnummer im Shop (z. B. „HBR 10-100 NF“)?

### Anfrage → Angebot (Testversion ab v0.4.0)

Ziel des Kunden: Angebot in 10 Minuten statt 5–6 Tagen, immer mit menschlicher Prüfung.

1. **Eingang:** manuell („Neue Anfrage“) oder „Anfrage aus E-Mail“ (Text einfügen / .eml laden → KI liest Kunde, Lieferadresse, Zeitraum, Artikel, Flächen).
2. **Kontakt:** Abgleich über E-Mail oder Telefonnummer; vorhandene Kontakte werden nur ergänzt, nie überschrieben. Datenqualität: vollständig / unvollständig / prüfen / Verdacht auf Fake.
3. **Entwurf:** Positionen mit VK je m², Verschnitt, Stückzahl aus Bedarf; Fracht nach PLZ-Zone; Hinweise zu allem, was fehlt. Status „In Bearbeitung“.
4. **Prüfung:** 6-Punkte-Prüfliste mit Name und Zeit; „versendet“ erst danach und nur mit Preisen. Änderungen an Positionen oder Lieferung setzen die Prüfung zurück.
5. **Versand:** Druck/PDF und E-Mail-Entwurf; Nachfassen nach 7 Tagen.
6. **Ergebnis:** Gewonnen → Aufgabenliste; Verloren → Grund. Kennzahlen: Abschlussquote, Ø Zeit bis Angebot, Volumen.
7. **Preisregeln (ab v0.5.0):** Staffelrabatt je Position nach m², Mindermengenzuschlag nach Gesamt-m², beide automatisch, von Hand übersteuerbar. Vier-Augen-Freigabe ab einstellbarer Summe (Standard 5.000 € netto) durch eine andere Person als den Ersteller – in der Browser-Version anhand des gewählten Bearbeiters, mit Anmeldung (Server) verbindlich.
8. **E-Mail-Vorlagen:** je Situation, mit Platzhaltern; Kopieren oder Mailprogramm. Direktversand erst mit Server (Edge Function + E-Mail-Dienst oder Microsoft 365).

### Automatischer Eingang von Website-Anfragen (geplant, braucht Server)

Im Browser kann das ERP keine E-Mails empfangen. Für „Anfrage kommt rein → Entwurf steht bereit“ ohne Kopieren:

| Weg | Ablauf | Bewertung |
|---|---|---|
| A. Webhook aus WordPress (empfohlen) | Wunschliste/Anfrageformular sendet die Daten zusätzlich zur E-Mail als JSON an einen kleinen ERP-Endpunkt (Signatur, Zeitlimit, Duplikatschutz); der Endpunkt legt den Entwurf an | strukturiert, keine KI zum Lesen nötig, zuverlässig; braucht Server-Endpunkt und eine Anpassung im WordPress (Snippet oder Formular-Webhook) |
| B. Postfach abrufen | eigenes Postfach (z. B. anfrage@…), Server liest neue Mails per IMAP, KI liest wie heute „Anfrage aus E-Mail“ | funktioniert mit jedem Formular und mit normalen Kunden-Mails; braucht Server, Postfachzugang, KI-Kosten je Mail |
| C. Weiterleitung an Automatisierungsdienst | Mail → Dienst (z. B. Make/Zapier) → ERP | schnell eingerichtet, aber zusätzlicher Dienstleister mit Kundendaten (AVV nötig) |

Voraussetzungen vom Kunden/Christian: Beispiel-E-Mails der Wunschliste (2–3 echte, ggf. geschwärzt), Name des Wunschlisten-Plugins (im Admin: YITH), Frachtsätze je Zone, VK-Preise je m², gewünschtes Antwortpostfach. Datenschutz: Anfragedaten sind personenbezogen → Hinweis in der Datenschutzerklärung, AVV mit Hosting und KI-Anbieter, Löschfristen für nicht gewonnene Anfragen festlegen.

### Option Supabase für den Mehrbenutzerbetrieb (Vorschlag 02.11.2026, nicht entschieden)

- Aufbau: Oberfläche bleibt eine statische Seite (GitHub Pages oder eigene Subdomain). Datenbank, Anmeldung, Dateien und Serverfunktionen laufen bei Supabase (PostgreSQL, Region Frankfurt). Das vorhandene SQL-Schema wird übernommen; der Datenzugriff der Oberfläche wechselt von IndexedDB auf Supabase.
- Sicherheit: Anmeldung nur per Einladung, MFA für Admin/Leitung; Row Level Security auf allen Tabellen; Einkaufspreise nur für berechtigte Rollen; Änderungsprotokoll per Trigger mit `auth.uid()`; Service-Role-Schlüssel, WooCommerce- und Claude-Schlüssel nur als Secrets in Edge Functions. Der öffentliche „anon“-Schlüssel in der Oberfläche ist vorgesehen und schützt nichts – geschützt wird durch Anmeldung und RLS.
- Kosten (Listenpreise, Stand 11/2026): Pro-Plan 25 $/Monat inkl. Micro-Instanz, 8 GB DB, 100 GB Dateien, tägliche Sicherungen 7 Tage; Free-Plan nur für Staging (Pausierung nach 7 Tagen Inaktivität, keine Sicherungen). Dazu E-Mail-Dienst 0–9 $, KI nach Verbrauch (ca. 1 Cent je Anfrage, 2–5 Cent je Datenblatt).
- E-Mail: Versand über Edge Function an einen E-Mail-Dienst per HTTPS (z. B. Brevo, EU) oder Microsoft 365 (Graph, nur freigegebenes Postfach). SMTP-Ports 25/587 sind in Edge Functions gesperrt. Eingang automatisch über Inbound-Parsing oder Webhook aus WordPress.
- Offen: Kunde als Vertragspartner/Inhaber des Supabase-Kontos, AVV unterzeichnen, Bewertung Drittlandbezug (US-Anbieter), Mailsystem des Kunden (Microsoft 365 oder Alfahosting).

---

## 3. Schnittstellen und Synchronisation

### Synchronisationsmatrix ERP → WooCommerce

| Feld | Führend | Richtung, Auslöser | Zuordnung | Konfliktregel |
|---|---|---|---|---|
| Name, Slug | ERP | ERP → Shop beim Veröffentlichen | Woo-ID, sonst SKU | Slug bestehender Produkte wird nie geändert (SEO) |
| SKU | ERP | ERP → Shop | Woo-ID | Vor dem Anlegen Suche nach SKU, um Doppelanlage nach Zeitüberschreitung zu verhindern |
| Art, Herstellungsart, Farben, Formate, Hersteller | ERP | ERP → Shop, zunächst als Kategorien (wie heute), später als Attribute/Marken | Woo-Kategorie-IDs in den Stammdaten | Unbekannte Kategorie → Auftrag stoppt mit Fehler |
| Bilder, Reihenfolge, Alt-Text | ERP | ERP → Shop | Woo-Medien-ID | Alt-Text wird an der Mediendatei gesetzt |
| Kurztext, Beschreibung, SEO | ERP | ERP → Shop | Woo-ID | SEO-Plugin im Shop noch zu klären |
| Technische Daten je Format | ERP | ERP → Shop, im Paket als `varianten` (Format, Maße, Technik, Bedarf); Darstellung im Shop noch festzulegen (Variante oder Tabelle) | Woo-ID + Formatkürzel | – |
| Status | ERP | freigegeben → veröffentlicht, archiviert → Entwurf im Shop | Woo-ID | Löschen im Shop nur mit Einzelfreigabe |
| Preise | ERP | **nie** in den Shop (Katalogmodus) | – | – |
| Neue Shop-Einträge | Shop | Shop → ERP nur über Import „nur neue“ | Woo-ID | ERP-Daten werden nie überschrieben |
| Abweichungen im Shop | ERP | regelmäßiger Abgleich, nur Bericht | Woo-ID + `date_modified` | Wurde ein Produkt im Shop seit der letzten Übertragung geändert, stoppt der Auftrag und zeigt beide Stände |

### Ablauf Veröffentlichen (geplant)

1. Leitung klickt „Veröffentlichen“. Das ERP zeigt die Änderungen gegenüber dem letzten übertragenen Stand.
2. In derselben Transaktion entsteht ein `sync_auftrag` mit Schlüssel `produkt:<id>:<version>:<aktion>`. Ein Doppelklick erzeugt keinen zweiten Auftrag.
3. Ein Worker überträgt nach WooCommerce: begrenzte Wiederholungen mit wachsendem Abstand, Zeitlimit, Rücksicht auf Drosselung. Nach Zeitüberschreitung beim Anlegen sucht er zuerst per SKU, ob das Produkt schon existiert.
4. Erfolg erst nach bestätigter Antwort des Shops; die Woo-ID wird gespeichert. Dauerhafte Fehler landen sichtbar in der Übersicht.
5. Mehr als 25 Produkte auf einmal nur mit Probelauf und zusätzlicher Bestätigung.

### Ablauf Datenblatt-Abgleich (geplant)

1. Pflege lädt PDF oder Foto am Stein hoch (max. 20 MB, PDF/JPG/PNG/WebP, Typ wird am Inhalt geprüft).
2. Der Server prüft die Prüfsumme: gleiche Datei = bekanntes Blatt.
3. Der Server schickt die Seiten an die Claude-API (Schlüssel nur auf dem Server). Inhalte aus dem Blatt gelten als Daten, nie als Anweisung.
4. Ergebnis landet in `datenblatt_wert`, jeder Wert mit Entscheidung „offen“.
5. Vergleichsansicht: Feld · im ERP · laut Datenblatt · gleich/abweichend/neu. Übernahme je Feld, mit Versionsprüfung und Protokoll.

### Bestandsdatei (Eingang heute)

Export „Bestand exportieren“ aus der Produktstation (öffentliche Store-API). Enthält keine Entwürfe und nur gekürzte Texte. Für die endgültige Übernahme wird die REST-API mit Schlüssel genutzt.

---

## 4. Einrichtung und Befehle

Siehe `README.md`. Kurz: `npm ci`, `npm test`, `npm run migrate`, `node scripts/import-bestand.ts <datei> [--probelauf|--nur-neue] [--bericht <ordner>]`.

Geheimnisse (`WOO_CONSUMER_KEY`, `WOO_CONSUMER_SECRET`, `ANTHROPIC_API_KEY`, Datenbank-Passwort) liegen nur in der Serverkonfiguration, getrennt für Staging und Produktion, nie im Repository oder im Chat.

---

## 5. Tests und Ergebnisse

Stand 02.11.2026, lokal geprüft:

| Prüfung | Ergebnis |
|---|---|
| 26 automatische Tests (`npm test`): Schema, Import, Testversion-Logik (Versionskonflikt, Sicherung prüfen, Zusammenführen in beide Richtungen, CSV mit Formelschutz, Produkt-CSV inkl. Fehlern und widersprüchlicher Steinwerte, Kontakt-CSV, Angebotsrechnung, Datenblatt-Erkennung, Shop-Paket, neuer Shop-Stand) | bestanden |
| Browser-Durchlauf der gebauten `index.html` (Chromium headless, ohne Internet): Bearbeiterwahl, Dashboard, Filter, Produkt bearbeiten + Verlauf, Preis, Produkt erfassen (mit Riemchen), Kontakt, Anfrage → Angebot → Druckansicht, Sicherung als Download, CSV-Export → Änderung → Rückimport, Sicherung einlesen und zusammenführen, Daten nach Neuladen erhalten, zweiter Tab nur lesend, Handybreite ohne seitliches Scrollen | bestanden, keine Fehler in der Konsole |
| Sicherungsordner (mit Browser-internem Ordner als Ersatz für die Ordnerauswahl): Sicherung schreiben, Stand eines Kollegen erkennen und zusammenführen, automatische Sicherung nach 60 Minuten (nicht nach 30) | bestanden |
| Datenblatt-PDF ohne KI (pdf.js 3.11.174 lokal statt cdnjs): alle 8 Werte erkannt, übernommen, als geprüft vermerkt | bestanden |
| KI-Datenblatt mit nachgestellter API-Antwort: Anfrage enthält PDF als Dokument, JSON-Schema und Browser-Header; Werte geprüft, ins Formular übernommen, Nummer aus Herstellerpräfix, Datenblatt am Stein vermerkt | bestanden (echte Claude-API nicht aufgerufen) |
| Hersteller ausblenden: betroffene Produkte im Shop-Paket ohne Herstellername; Referenz anlegen, freigeben, im Paket mit Kategorien | bestanden |
| v0.6.0: 41 automatische Tests (neu: Normmaße und Bedarf, Prüfung je Format, Umstellung alter Stände, Format-CSV, Angebot mit Format und Formatpreis, KI-Varianten, Migration 0002 auf befüllter Datenbank). Browser-Durchlauf (37 Prüfpunkte): Formatblöcke mit Normmaß und berechnetem Bedarf, abweichende Länge, Prüfwerte auf alle Formate, Riemchen sieht dieselben Werte, Verlauf je Format, Textvorschlag mit Maßen, Preis je Format, Datenblatt ohne KI mit Formaterkennung und Formatwahl, LF in Stammdaten festlegen, Angebot mit Format aus neuer Anfrage und Preiswechsel DF/NF, Format-CSV Export/Rück-Import ohne Änderung, Handybreite 390 px ohne Querscrollen | bestanden, keine Fehler in der Konsole |
| v0.5.1: Layoutprüfung aller 27 Seiten bei 1440, 820 und 390 px Breite (kein Element außerhalb des Bildschirms oder seiner Karte), dazu Menü, E-Mail-Dialog, E-Mail-Anfrage und Suche auf dem Handy | bestanden |
| v0.5.0: Seitenleiste mehrere Bereiche offen (bleibt nach Neuladen), Preisstaffel und Mindermenge im Angebot, Vier-Augen-Freigabe (Ersteller gesperrt, zweite Person gibt frei), E-Mail-Vorlagen mit Platzhaltern und Vermerk beim Kontakt, Vorlagen bearbeiten | bestanden |
| Anfrage aus E-Mail (nachgestellte KI-Antwort) → Kontakt angelegt, Entwurf mit Preisen und Fracht, Prüfliste sperrt Versand, Gewonnen erzeugt Aufgaben, Ziehen nach „Verloren“ fragt Grund ab, Kennzahlen, „Heute zu tun“, Datenqualität | bestanden |
| Nicht geprüft | echte Claude-API mit echtem Schlüssel und echten Hersteller-Datenblättern; echte Ordnerauswahl und Freigabe nach Browser-Neustart in Chrome/Edge; Betrieb auf GitHub Pages; Laden von pdf.js, Schrift und Produktbildern aus dem Internet; Einspielen des WooCommerce-Pakets |
| TypeScript-Prüfung | ohne Fehler |
| Migration auf leerer Datenbank, zweimal | bestanden, zweiter Lauf ohne Wirkung |
| Erstübernahme echter Bestand (741 Einträge) in PGlite **und** PostgreSQL 16 | identisches Ergebnis |
| Zweiter Import | bricht mit klarer Meldung ab; `--nur-neue` legt nichts an |
| Fehler mitten im Import | nichts übernommen (Transaktion) |
| Konflikt beim gleichzeitigen Speichern | spätere Speicherung mit alter Version ändert nichts |
| Änderungsprotokoll | nur geänderte Felder, mit Benutzer; Ändern/Löschen gesperrt |
| CSV-Export | Formeln werden entschärft |

**Ergebnis der Erstübernahme:** 314 Steine (236 mit Verblender und Riemchen), 289 Verblender, 267 Riemchen, 6 Nistklinker, 179 Referenzen, 1.931 Bilddateien in 3.480 Verwendungen, 2.195 Befunde. Details im Abgleichbericht.

**Bekannte Einschränkungen:** Server-Version ohne Oberfläche und Anmeldung; die Testversion hat keine Anmeldung und keine direkte Verbindung zum Shop. Die Schema-Tests laufen gegen PGlite; der Import wurde zusätzlich gegen PostgreSQL 16 geprüft.

---

## 6. Betrieb (geplant)

- Umgebungen: Entwicklung (lokal), Staging (eigene Datenbank, verbunden mit einer Staging-Kopie des Shops), Produktion. Staging darf nie den Live-Shop schreiben.
- Datensicherung: nächtlicher Datenbank-Dump plus Datenblatt-Ordner, außerhalb des Servers, 30 Tage. Ziel: höchstens 24 h Datenverlust, Wiederherstellung in unter 4 h. Wiederherstellung wird vor dem Launch einmal tatsächlich durchgeführt.
- Überwachung: Erreichbarkeit, Fehlerprotokoll ohne personenbezogene Daten, Alarm bei hängenden oder fehlgeschlagenen Sync-Aufträgen.
- Release-Rücknahme: Migrationen nur vorwärtskompatibel; ein Zurücksetzen des Codes macht bereits übertragene Shop-Änderungen nicht rückgängig.
- Betreuung: Christian. Eskalation und Wartungsfenster mit dem Kunden zu vereinbaren.

---

## 7. Offene Entscheidungen, Risiken, Launch-Checkliste

### Offen

| # | Frage | Wer |
|---|---|---|
| 1 | Server des Kunden: Betriebssystem, Standort (Büro/Rechenzentrum), aus dem Internet erreichbar, Docker möglich, wer wartet ihn, Sicherung | Kunde / IT |
| 2 | WooCommerce-API-Schlüssel und Staging-Kopie des Shops | Christian mit Alfahosting-Zugang |
| 3 | Hersteller der Präfixe 17, 18, 22, 23, 24, 25, 27 (57 Steine) | Kunde |
| 4 | Doppelte Codes HBR 12-122, 13-130, 17-121 R; ggf. 14-100/14-101 | Kunde |
| 5 | Rollen und Einkaufspreis-Sicht je Person | Kunde |
| 6 | Herstellungsart HBR 14-116 und 16-104 (Verblender und Riemchen widersprechen sich) | Kunde |
| 7 | Zielmodell im Shop (Attribute, Marken, Referenzen, Formate als Varianten?) und SEO-Plugin | Christian / Kunde |
| 8 | Budget und Termin | Christian / Kunde |
| 9 | Normmaße bestätigen (v. a. LDF, XLDF; Bedeutung BDF, BS, Modul); Preise je Format ja/nein; Artikelnummer je Format im Shop | Kunde |

### Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Doppelte Pflege in WordPress und ERP | Regel „nur im ERP ändern“, Abweichungsbericht, Konfliktstopp beim Veröffentlichen |
| Fehlerhafte Massenveröffentlichung | Probelauf, Schwellen, Staging-Test, Woo-ID-Zuordnung statt Name |
| Kategorie-Umbau kostet Sichtbarkeit | URLs bleiben, Weiterleitungsplan, Search Console vorher prüfen |
| Datenblätter falsch ausgelesen | jeder Wert einzeln bestätigt, Original bleibt abrufbar |
| Eigener Server ohne Wartung | Betriebsverantwortung klären, sonst Hosting beim EU-Anbieter |
| Schlüsselverlust | Schlüssel nur serverseitig, getrennt je Umgebung, Rotation dokumentiert |

### Launch-Checkliste

- [ ] Kernabläufe L1–L7 in Staging geprüft
- [ ] Rechte je Rolle direkt über die Schnittstelle getestet (auch verweigerte Zugriffe)
- [ ] Erstübernahme mit vollständigen Daten über die REST-API
- [ ] Wiederherstellung aus Sicherung durchgeführt
- [ ] Keine bekannten kritischen Sicherheitslücken
- [ ] Datenschutz: Auftragsverarbeitung mit Hoster und Anthropic geprüft, Verzeichnis ergänzt
- [ ] Betriebsverantwortung und Eskalation schriftlich vereinbart
