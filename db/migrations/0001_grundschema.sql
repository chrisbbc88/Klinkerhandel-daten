-- 0001_grundschema.sql
-- Grundschema der Produktpflege für Klinkerhandel Harbecke Rhede.
-- Ein Auftraggeber, kein Mandantenmodell. Das ERP ist führend für alle Produktdaten,
-- WooCommerce zeigt sie nur an (siehe docs/ERP-Dokumentation.md, Synchronisationsmatrix).

-- ---------------------------------------------------------------------------
-- Benutzer und Rollen
-- ---------------------------------------------------------------------------
CREATE TABLE benutzer (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL,
  name          text NOT NULL,
  rolle         text NOT NULL CHECK (rolle IN ('admin','leitung','pflege','lesen','system')),
  aktiv         boolean NOT NULL DEFAULT true,
  erstellt_am   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX benutzer_email_uq ON benutzer (lower(email));

-- Systembenutzer für Importe und Hintergrundaufträge. Kann sich nicht anmelden.
INSERT INTO benutzer (email, name, rolle) VALUES ('system@erp.local', 'System', 'system');

-- ---------------------------------------------------------------------------
-- Stammdaten: Hersteller, Lieferant, Farben, Formate
-- ---------------------------------------------------------------------------
CREATE TABLE hersteller (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             text NOT NULL UNIQUE,
  hbr_praefix      char(2) UNIQUE CHECK (hbr_praefix ~ '^[0-9]{2}$'),
  woo_kategorie_id bigint UNIQUE,
  woo_marke_id     bigint UNIQUE,
  aktiv            boolean NOT NULL DEFAULT true
);

CREATE TABLE lieferant (
  id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  text NOT NULL UNIQUE
);
INSERT INTO lieferant (name) VALUES ('Baustoffzentrum Harbecke');

CREATE TABLE farbe (
  schluessel       text PRIMARY KEY,           -- z. B. 'rot', 'weiß carbon'
  woo_kategorie_id bigint UNIQUE,
  sortierung       int NOT NULL DEFAULT 0
);

CREATE TABLE format (
  kuerzel          text PRIMARY KEY,           -- z. B. 'WDF', 'NF', 'BDF-XL'
  name             text NOT NULL,
  laenge_mm        numeric(6,1),
  breite_mm        numeric(6,1),
  hoehe_mm         numeric(6,1),
  woo_kategorie_id bigint UNIQUE
);

-- ---------------------------------------------------------------------------
-- Stein: der eigentliche Klinker. Verblender und Riemchen desselben Steins
-- hängen an genau einem Stein (gleicher HBR-Code).
-- ---------------------------------------------------------------------------
CREATE TABLE stein (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hbr_code               text NOT NULL UNIQUE CHECK (hbr_code ~ '^HBR [0-9]{2}-[0-9]{3}$'),
  hersteller_id          bigint REFERENCES hersteller(id),
  hersteller_quelle      text CHECK (hersteller_quelle IN ('shop','praefix','manuell','datenblatt')),
  herstellungsart        text CHECK (herstellungsart IN ('handform','strangpress','wasserstrich')),
  bezeichnung_hersteller text,
  artikelnr_hersteller   text,
  oberflaechen           text[] NOT NULL DEFAULT '{}',
  laenge_mm              numeric(6,1) CHECK (laenge_mm > 0),
  breite_mm              numeric(6,1) CHECK (breite_mm > 0),
  hoehe_mm               numeric(6,1) CHECK (hoehe_mm > 0),
  gewicht_kg             numeric(6,2) CHECK (gewicht_kg > 0),
  druckfestigkeit_nmm2   numeric(6,1) CHECK (druckfestigkeit_nmm2 > 0),
  wasseraufnahme_proz    numeric(5,2) CHECK (wasseraufnahme_proz >= 0 AND wasseraufnahme_proz <= 100),
  frostwiderstand        text CHECK (frostwiderstand IN ('F0','F1','F2')),
  bedarf_stk_m2          numeric(6,1) CHECK (bedarf_stk_m2 > 0),
  herstellertext         text,
  notiz                  text,
  status                 text NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','auslauf','archiviert')),
  version                int NOT NULL DEFAULT 1,
  erstellt_am            timestamptz NOT NULL DEFAULT now(),
  geaendert_am           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stein_hersteller_idx ON stein (hersteller_id);

CREATE TABLE stein_farbe (
  stein_id   bigint NOT NULL REFERENCES stein(id) ON DELETE CASCADE,
  farbe      text   NOT NULL REFERENCES farbe(schluessel),
  position   int    NOT NULL DEFAULT 0,   -- 0 = Hauptfarbe
  PRIMARY KEY (stein_id, farbe)
);

-- ---------------------------------------------------------------------------
-- Produkt: das, was im Shop erscheint (Verblender, Riemchen, Dämmklinker, Nistklinker).
-- ---------------------------------------------------------------------------
CREATE TABLE produkt (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stein_id            bigint REFERENCES stein(id),
  art                 text NOT NULL CHECK (art IN ('verblender','riemchen','daemmklinker','nistklinker')),
  sku                 text UNIQUE,
  name                text NOT NULL,
  hersteller_id       bigint REFERENCES hersteller(id),   -- nur für Produkte ohne Stein (Nistklinker)
  woo_id              bigint UNIQUE,
  woo_slug            text,
  status              text NOT NULL DEFAULT 'entwurf'
                      CHECK (status IN ('entwurf','pruefung','freigegeben','archiviert')),
  riemchen_staerke_mm numeric(4,1) CHECK (riemchen_staerke_mm > 0),
  eckriemchen         boolean,
  kurztext            text,
  beschreibung        text,
  seo_titel           text,
  seo_meta            text,
  kurztext_shop_alt   text,                               -- Kurztext aus dem Shop vor der Übernahme, nur zum Abgleich
  version             int NOT NULL DEFAULT 1,
  erstellt_am         timestamptz NOT NULL DEFAULT now(),
  geaendert_am        timestamptz NOT NULL DEFAULT now(),
  -- Je Stein höchstens ein Verblender und ein Riemchen.
  CONSTRAINT produkt_stein_art_uq UNIQUE (stein_id, art),
  -- Freigegebene Produkte brauchen eine Artikelnummer.
  CONSTRAINT produkt_freigabe_sku CHECK (status <> 'freigegeben' OR sku IS NOT NULL),
  -- Riemchen-SKU endet auf " R", Verblender-SKU nicht.
  CONSTRAINT produkt_sku_form CHECK (
    sku IS NULL
    OR (art = 'riemchen'   AND sku ~ '^HBR [0-9]{2}-[0-9]{3} R$')
    OR (art = 'verblender' AND sku ~ '^HBR [0-9]{2}-[0-9]{3}$')
    OR art IN ('daemmklinker','nistklinker')
  )
);
CREATE INDEX produkt_stein_idx ON produkt (stein_id);
CREATE INDEX produkt_status_idx ON produkt (status);

CREATE TABLE produkt_format (
  produkt_id bigint NOT NULL REFERENCES produkt(id) ON DELETE CASCADE,
  format     text   NOT NULL REFERENCES format(kuerzel),
  PRIMARY KEY (produkt_id, format)
);

-- ---------------------------------------------------------------------------
-- Bilder: eine Datei kann an mehreren Produkten und Referenzen hängen.
-- Der Alt-Text gehört zur Datei (wie in WordPress).
-- ---------------------------------------------------------------------------
CREATE TABLE bild (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  woo_media_id  bigint UNIQUE,
  datei         text NOT NULL,
  breite_px     int CHECK (breite_px >= 0),
  alt           text,
  erstellt_am   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE produkt_bild (
  produkt_id bigint NOT NULL REFERENCES produkt(id) ON DELETE CASCADE,
  bild_id    bigint NOT NULL REFERENCES bild(id),
  position   int    NOT NULL,
  rolle      text CHECK (rolle IN ('freisteller','wand','detail','referenz')),
  PRIMARY KEY (produkt_id, bild_id),
  UNIQUE (produkt_id, position)
);

-- ---------------------------------------------------------------------------
-- Referenzen (Objektfotos), im Shop bisher als Produkte angelegt.
-- ---------------------------------------------------------------------------
CREATE TABLE referenz (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  woo_id        bigint UNIQUE,
  woo_slug      text,
  name          text NOT NULL,
  objektart     text,                         -- Einfamilienhaus, Mehrfamilienhaus, Geschäftshaus …
  rubriken      text[] NOT NULL DEFAULT '{}', -- Shop-Unterkategorien (EFH + DHH, Modern …)
  stein_id      bigint REFERENCES stein(id),
  hbr_code_shop text,                         -- Code laut Shop-Name, auch wenn kein Stein existiert
  text          text,
  status        text NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf','freigegeben','archiviert')),
  version       int NOT NULL DEFAULT 1,
  erstellt_am   timestamptz NOT NULL DEFAULT now(),
  geaendert_am  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referenz_stein_idx ON referenz (stein_id);

CREATE TABLE referenz_bild (
  referenz_id bigint NOT NULL REFERENCES referenz(id) ON DELETE CASCADE,
  bild_id     bigint NOT NULL REFERENCES bild(id),
  position    int    NOT NULL,
  PRIMARY KEY (referenz_id, bild_id),
  UNIQUE (referenz_id, position)
);

-- ---------------------------------------------------------------------------
-- Datenblätter und ausgelesene Werte (für den Abgleich mit den Stammdaten).
-- ---------------------------------------------------------------------------
CREATE TABLE datenblatt (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stein_id         bigint REFERENCES stein(id),
  hersteller_id    bigint REFERENCES hersteller(id),
  dateiname        text NOT NULL,
  sha256           char(64) NOT NULL UNIQUE,   -- dieselbe Datei wird nur einmal gespeichert
  speicherpfad     text NOT NULL,
  groesse_bytes    bigint NOT NULL CHECK (groesse_bytes > 0),
  mime             text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png','image/webp')),
  status           text NOT NULL DEFAULT 'neu' CHECK (status IN ('neu','ausgelesen','geprueft','verworfen')),
  hochgeladen_von  bigint NOT NULL REFERENCES benutzer(id),
  hochgeladen_am   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE datenblatt_wert (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  datenblatt_id  bigint NOT NULL REFERENCES datenblatt(id) ON DELETE CASCADE,
  feld           text   NOT NULL,              -- z. B. 'laenge_mm', 'farben', 'frostwiderstand'
  wert           jsonb  NOT NULL,              -- normalisierter Wert
  roh            text,                         -- Originaltext aus dem Blatt
  entscheidung   text NOT NULL DEFAULT 'offen' CHECK (entscheidung IN ('offen','uebernommen','abgelehnt')),
  entschieden_von bigint REFERENCES benutzer(id),
  entschieden_am timestamptz,
  UNIQUE (datenblatt_id, feld)
);

-- ---------------------------------------------------------------------------
-- Preise. Werden nicht im Shop gezeigt (Katalogmodus), nur intern und später für Angebote.
-- Historie bleibt erhalten: neue Preise bekommen ein neues gueltig_ab.
-- ---------------------------------------------------------------------------
CREATE TABLE preis (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  produkt_id    bigint NOT NULL REFERENCES produkt(id),
  preisart      text NOT NULL CHECK (preisart IN ('ek','vk')),     -- Einkauf bei Harbecke / Verkauf
  betrag        numeric(12,2) NOT NULL CHECK (betrag >= 0),       -- netto
  waehrung      char(3) NOT NULL DEFAULT 'EUR',
  einheit       text NOT NULL CHECK (einheit IN ('m2','stk','pal')),
  gueltig_ab    date NOT NULL,
  quelle        text NOT NULL CHECK (quelle IN ('lieferant','manuell')),
  lieferant_id  bigint REFERENCES lieferant(id),
  erfasst_von   bigint NOT NULL REFERENCES benutzer(id),
  erfasst_am    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produkt_id, preisart, einheit, gueltig_ab)
);

-- ---------------------------------------------------------------------------
-- Übernahme und Prüfpunkte: Jeder Import schreibt seine Befunde, nichts wird stillschweigend korrigiert.
-- ---------------------------------------------------------------------------
CREATE TABLE import_lauf (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quelle       text NOT NULL,
  stand        timestamptz,
  modus        text NOT NULL CHECK (modus IN ('erstuebernahme','nur_neue','probelauf')),
  gestartet_am timestamptz NOT NULL DEFAULT now(),
  beendet_am   timestamptz,
  ergebnis     jsonb
);

CREATE TABLE befund (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_lauf_id bigint REFERENCES import_lauf(id),
  objekt        text NOT NULL CHECK (objekt IN ('produkt','referenz','stein','bild')),
  woo_id        bigint,
  hbr_code      text,
  regel         text NOT NULL,
  schwere       text NOT NULL CHECK (schwere IN ('pflicht','empfohlen','info')),
  text          text NOT NULL,
  status        text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','erledigt','ignoriert')),
  erstellt_am   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX befund_offen_idx ON befund (regel) WHERE status = 'offen';

-- ---------------------------------------------------------------------------
-- Ausgang nach WooCommerce (Outbox). Wird in derselben Transaktion wie die Änderung geschrieben.
-- ---------------------------------------------------------------------------
CREATE TABLE sync_auftrag (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ziel                 text NOT NULL DEFAULT 'woocommerce' CHECK (ziel IN ('woocommerce')),
  objekt               text NOT NULL CHECK (objekt IN ('produkt','referenz','bild')),
  objekt_id            bigint NOT NULL,
  objekt_version       int NOT NULL,
  aktion               text NOT NULL CHECK (aktion IN ('anlegen','aktualisieren','archivieren')),
  idempotenz_schluessel text NOT NULL UNIQUE,  -- objekt:id:version:aktion
  status               text NOT NULL DEFAULT 'offen'
                       CHECK (status IN ('offen','laeuft','erfolgreich','fehler','aufgegeben')),
  versuche             int NOT NULL DEFAULT 0,
  naechster_versuch    timestamptz NOT NULL DEFAULT now(),
  letzter_fehler       text,
  ausgeloest_von       bigint NOT NULL REFERENCES benutzer(id),
  erstellt_am          timestamptz NOT NULL DEFAULT now(),
  erledigt_am          timestamptz
);
CREATE INDEX sync_auftrag_faellig_idx ON sync_auftrag (naechster_versuch) WHERE status IN ('offen','fehler');

-- ---------------------------------------------------------------------------
-- Änderungsprotokoll. Nur anfügen; Ändern und Löschen sind gesperrt.
-- Die Anwendung setzt je Transaktion: SET LOCAL app.benutzer_id = '<id>'.
-- ---------------------------------------------------------------------------
CREATE TABLE aenderung (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zeit         timestamptz NOT NULL DEFAULT now(),
  benutzer_id  bigint REFERENCES benutzer(id),
  tabelle      text NOT NULL,
  datensatz    text NOT NULL,
  aktion       text NOT NULL CHECK (aktion IN ('INSERT','UPDATE','DELETE')),
  alt          jsonb,
  neu          jsonb
);
CREATE INDEX aenderung_datensatz_idx ON aenderung (tabelle, datensatz);

CREATE FUNCTION aenderung_sperren() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Das Änderungsprotokoll kann nicht verändert werden';
END $$;
CREATE TRIGGER aenderung_nur_anfuegen BEFORE UPDATE OR DELETE ON aenderung
  FOR EACH ROW EXECUTE FUNCTION aenderung_sperren();

CREATE FUNCTION protokollieren() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  b   text := current_setting('app.benutzer_id', true);
  o   jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END;
  n   jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END;
  alt jsonb := o;
  neu jsonb := n;
BEGIN
  IF b IS NULL OR b = '' THEN
    RAISE EXCEPTION 'Schreibzugriff ohne Benutzerkontext (app.benutzer_id fehlt)';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- nur geänderte Felder protokollieren (ohne Versionszähler und Zeitstempel)
    SELECT jsonb_object_agg(k, o -> k), jsonb_object_agg(k, n -> k) INTO alt, neu
      FROM jsonb_object_keys(n) k
     WHERE o -> k IS DISTINCT FROM n -> k AND k NOT IN ('version','geaendert_am');
    IF neu IS NULL THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO aenderung (benutzer_id, tabelle, datensatz, aktion, alt, neu)
  VALUES (b::bigint, TG_TABLE_NAME,
          COALESCE(COALESCE(n, o) ->> 'id', COALESCE(n, o)::text),
          TG_OP, alt, neu);
  RETURN NULL;
END $$;

-- Versionszähler für die Konflikterkennung beim gleichzeitigen Bearbeiten.
-- Die Anwendung schreibt nur mit "WHERE id = $1 AND version = $erwartet".
CREATE FUNCTION version_hochzaehlen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.geaendert_am := now();
  RETURN NEW;
END $$;

CREATE TRIGGER stein_version    BEFORE UPDATE ON stein    FOR EACH ROW EXECUTE FUNCTION version_hochzaehlen();
CREATE TRIGGER produkt_version  BEFORE UPDATE ON produkt  FOR EACH ROW EXECUTE FUNCTION version_hochzaehlen();
CREATE TRIGGER referenz_version BEFORE UPDATE ON referenz FOR EACH ROW EXECUTE FUNCTION version_hochzaehlen();

CREATE TRIGGER stein_protokoll        AFTER INSERT OR UPDATE OR DELETE ON stein        FOR EACH ROW EXECUTE FUNCTION protokollieren();
CREATE TRIGGER stein_farbe_protokoll  AFTER INSERT OR UPDATE OR DELETE ON stein_farbe  FOR EACH ROW EXECUTE FUNCTION protokollieren();
CREATE TRIGGER produkt_protokoll      AFTER INSERT OR UPDATE OR DELETE ON produkt      FOR EACH ROW EXECUTE FUNCTION protokollieren();
CREATE TRIGGER produkt_format_protokoll AFTER INSERT OR UPDATE OR DELETE ON produkt_format FOR EACH ROW EXECUTE FUNCTION protokollieren();
CREATE TRIGGER produkt_bild_protokoll AFTER INSERT OR UPDATE OR DELETE ON produkt_bild FOR EACH ROW EXECUTE FUNCTION protokollieren();
CREATE TRIGGER bild_protokoll         AFTER INSERT OR UPDATE OR DELETE ON bild         FOR EACH ROW EXECUTE FUNCTION protokollieren();
CREATE TRIGGER referenz_protokoll     AFTER INSERT OR UPDATE OR DELETE ON referenz     FOR EACH ROW EXECUTE FUNCTION protokollieren();
CREATE TRIGGER preis_protokoll        AFTER INSERT OR UPDATE OR DELETE ON preis        FOR EACH ROW EXECUTE FUNCTION protokollieren();
CREATE TRIGGER benutzer_protokoll     AFTER INSERT OR UPDATE OR DELETE ON benutzer     FOR EACH ROW EXECUTE FUNCTION protokollieren();
CREATE TRIGGER hersteller_protokoll   AFTER INSERT OR UPDATE OR DELETE ON hersteller   FOR EACH ROW EXECUTE FUNCTION protokollieren();
