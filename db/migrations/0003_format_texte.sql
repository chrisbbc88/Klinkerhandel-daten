-- 0003: Kurztext und Beschreibung je Produkt und Format (gegen doppelte Inhalte im Shop).
-- Leer = es gilt der allgemeine Text des Produkts. Preise je Format gibt es seit 0002 (preis.format).
ALTER TABLE produkt_format ADD COLUMN kurztext text;
ALTER TABLE produkt_format ADD COLUMN beschreibung text;
