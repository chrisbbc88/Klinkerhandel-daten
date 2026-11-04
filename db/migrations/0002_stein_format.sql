-- 0002: Werte je Format (NF, DF, WF …) statt einmal je Stein.
-- Ein Stein (HBR-Code) gibt es in mehreren Formaten; Maße, Druckfestigkeit, Wasseraufnahme, Frost,
-- Gewicht und Bedarf je m² hängen vom Format ab. Gespeichert wird nur Eingetragenes; fehlende Maße
-- gelten aus format (Normmaß), der Bedarf wird aus Länge, Höhe und Fugen berechnet.
-- Nicht destruktiv: die alten Spalten in stein bleiben vorerst erhalten (nicht mehr beschrieben).

ALTER TABLE format ADD COLUMN mm_art text CHECK (mm_art IN ('norm','ueblich','festgelegt'));
UPDATE format SET mm_art = 'norm'    WHERE kuerzel IN ('WF','WDF','DF','NF','2DF','RF') AND laenge_mm IS NOT NULL;
UPDATE format SET laenge_mm = 290, breite_mm = 90,  hoehe_mm = 52, mm_art = 'ueblich' WHERE kuerzel = 'LDF'  AND laenge_mm IS NULL;
UPDATE format SET laenge_mm = 365, breite_mm = 115, hoehe_mm = 52, mm_art = 'ueblich' WHERE kuerzel = 'XLDF' AND laenge_mm IS NULL;
UPDATE format SET mm_art = 'festgelegt' WHERE mm_art IS NULL AND laenge_mm IS NOT NULL;

CREATE TABLE einstellung (
  schluessel text PRIMARY KEY,
  wert       jsonb NOT NULL
);
INSERT INTO einstellung (schluessel, wert) VALUES ('fugen', '{"stoss_mm": 10, "lager_mm": 12}');

CREATE TABLE stein_format (
  stein_id               bigint NOT NULL REFERENCES stein(id) ON DELETE CASCADE,
  format                 text   NOT NULL REFERENCES format(kuerzel),
  laenge_mm              numeric(6,1) CHECK (laenge_mm > 0),
  breite_mm              numeric(6,1) CHECK (breite_mm > 0),
  hoehe_mm               numeric(6,1) CHECK (hoehe_mm > 0),
  gewicht_kg             numeric(6,2) CHECK (gewicht_kg > 0),
  druckfestigkeit_nmm2   numeric(6,1) CHECK (druckfestigkeit_nmm2 > 0),
  wasseraufnahme_proz    numeric(5,2) CHECK (wasseraufnahme_proz >= 0 AND wasseraufnahme_proz <= 100),
  frostwiderstand        text CHECK (frostwiderstand IN ('F0','F1','F2')),
  bedarf_stk_m2          numeric(6,1) CHECK (bedarf_stk_m2 > 0),
  artikelnr_hersteller   text,
  quelle                 text CHECK (quelle IN ('manuell','datenblatt','alt')),
  PRIMARY KEY (stein_id, format)
);

-- Vorhandene Steinwerte übernehmen: Format über die Maße erkannt, sonst einziges Format des Steins,
-- sonst an alle Formate des Steins mit quelle = 'alt' (Prüfung je Format nötig).
WITH werte AS (
  SELECT * FROM stein
   WHERE COALESCE(laenge_mm, breite_mm, hoehe_mm, gewicht_kg, druckfestigkeit_nmm2, wasseraufnahme_proz, bedarf_stk_m2) IS NOT NULL
      OR frostwiderstand IS NOT NULL
), formate AS (
  SELECT DISTINCT p.stein_id, pf.format FROM produkt p JOIN produkt_format pf ON pf.produkt_id = p.id
), treffer AS (
  SELECT w.id AS stein_id, f.format
    FROM werte w JOIN formate f ON f.stein_id = w.id JOIN format fo ON fo.kuerzel = f.format
   WHERE w.laenge_mm IS NOT NULL AND w.hoehe_mm IS NOT NULL
     AND abs(fo.laenge_mm - w.laenge_mm) <= 3 AND abs(fo.hoehe_mm - w.hoehe_mm) <= 3
), eindeutig AS (
  SELECT stein_id, min(format) AS format FROM treffer GROUP BY stein_id HAVING count(*) = 1
), ziel AS (
  SELECT e.stein_id, e.format, 'manuell' AS quelle FROM eindeutig e
  UNION ALL
  SELECT f.stein_id, f.format, CASE WHEN count(*) OVER (PARTITION BY f.stein_id) = 1 THEN 'manuell' ELSE 'alt' END
    FROM formate f JOIN werte w ON w.id = f.stein_id
   WHERE NOT EXISTS (SELECT 1 FROM eindeutig e WHERE e.stein_id = f.stein_id)
)
INSERT INTO stein_format (stein_id, format, laenge_mm, breite_mm, hoehe_mm, gewicht_kg, druckfestigkeit_nmm2,
                          wasseraufnahme_proz, frostwiderstand, bedarf_stk_m2, artikelnr_hersteller, quelle)
SELECT z.stein_id, z.format, w.laenge_mm, w.breite_mm, w.hoehe_mm, w.gewicht_kg, w.druckfestigkeit_nmm2,
       w.wasseraufnahme_proz, w.frostwiderstand, w.bedarf_stk_m2, NULL, z.quelle
  FROM ziel z JOIN werte w ON w.id = z.stein_id;

COMMENT ON COLUMN stein.laenge_mm IS 'veraltet seit 0002 – Werte je Format in stein_format';
COMMENT ON COLUMN stein.bedarf_stk_m2 IS 'veraltet seit 0002 – Werte je Format in stein_format';

CREATE TRIGGER stein_format_protokoll AFTER INSERT OR UPDATE OR DELETE ON stein_format FOR EACH ROW EXECUTE FUNCTION protokollieren();

-- Preise optional je Format (leer = gilt für alle Formate des Produkts)
ALTER TABLE preis ADD COLUMN format text REFERENCES format(kuerzel);
ALTER TABLE preis DROP CONSTRAINT preis_produkt_id_preisart_einheit_gueltig_ab_key;
CREATE UNIQUE INDEX preis_eindeutig_idx ON preis (produkt_id, preisart, einheit, gueltig_ab, COALESCE(format, ''));
