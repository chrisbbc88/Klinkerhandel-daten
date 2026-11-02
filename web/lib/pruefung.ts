// Laufende Prüfung der Daten. Wird bei jeder Anzeige neu berechnet, damit ein erledigter
// Punkt sofort verschwindet. Ergänzt die Hinweise aus der Übernahme (modell.ts → hinweise).
import { aktuellerPreis, type Daten, type Produkt, type Stein } from "./modell.ts";

export interface Pruefpunkt { regel: string; schwere: "pflicht" | "empfohlen"; text: string }

export const REGELN: Record<string, { text: string; schwere: "pflicht" | "empfohlen"; gilt: "stein" | "produkt" }> = {
  hersteller: { text: "Hersteller fehlt", schwere: "empfohlen", gilt: "stein" },
  herstellungsart: { text: "Herstellungsart fehlt", schwere: "pflicht", gilt: "stein" },
  farbe: { text: "Keine Farbe", schwere: "pflicht", gilt: "stein" },
  sku: { text: "Keine Artikelnummer", schwere: "pflicht", gilt: "produkt" },
  format: { text: "Kein Format", schwere: "pflicht", gilt: "produkt" },
  bild: { text: "Kein Bild", schwere: "pflicht", gilt: "produkt" },
  masse: { text: "Maße fehlen", schwere: "empfohlen", gilt: "stein" },
  technik: { text: "Frost, Druckfestigkeit oder Wasseraufnahme fehlen", schwere: "empfohlen", gilt: "stein" },
  bedarf: { text: "Bedarf je m² fehlt", schwere: "empfohlen", gilt: "stein" },
  datenblatt: { text: "Kein Datenblatt geprüft", schwere: "empfohlen", gilt: "stein" },
  bilder3: { text: "Weniger als 3 Bilder", schwere: "empfohlen", gilt: "produkt" },
  alt: { text: "Bilder ohne Alt-Text", schwere: "empfohlen", gilt: "produkt" },
  text: { text: "Keine Produktbeschreibung", schwere: "empfohlen", gilt: "produkt" },
  vk: { text: "Kein Verkaufspreis je m²", schwere: "empfohlen", gilt: "produkt" },
};

export function pruefeStein(s: Stein): Pruefpunkt[] {
  const r: string[] = [];
  if (!s.hersteller_id) r.push("hersteller");
  if (!s.herstellungsart) r.push("herstellungsart");
  if (!s.farben.length) r.push("farbe");
  if (!(s.laenge_mm && s.breite_mm && s.hoehe_mm)) r.push("masse");
  if (!(s.frostwiderstand && s.druckfestigkeit_nmm2 && s.wasseraufnahme_proz != null)) r.push("technik");
  if (!s.bedarf_stk_m2) r.push("bedarf");
  if (!s.datenblaetter.length) r.push("datenblatt");
  return r.map((k) => ({ regel: k, schwere: REGELN[k].schwere, text: REGELN[k].text }));
}

export function pruefeProdukt(p: Produkt, d: Pick<Daten, "bilder" | "steine">, bildIndex?: Map<number, { alt: string }>): Pruefpunkt[] {
  if (p.status === "archiviert") return [];
  const r: string[] = [];
  if (!p.sku) r.push("sku");
  if (p.art !== "nistklinker" && !p.formate.length) r.push("format");
  if (!p.bilder.length) r.push("bild");
  else if (p.bilder.length < 3) r.push("bilder3");
  const idx = bildIndex ?? new Map(d.bilder.map((b) => [b.id, b]));
  if (p.bilder.some((id) => !idx.get(id)?.alt)) r.push("alt");
  if (!p.beschreibung.trim()) r.push("text");
  if (p.art !== "nistklinker" && !aktuellerPreis(p, "vk", "m2")) r.push("vk");
  return r.map((k) => ({ regel: k, schwere: REGELN[k].schwere, text: REGELN[k].text }));
}

export interface ProduktBewertung { punkte: Pruefpunkt[]; score: number }

/** Bewertung eines Produkts inklusive seines Steins: Pflicht zählt doppelt. */
export function bewerte(p: Produkt, d: Daten, idx: { steine: Map<number, Stein>; bilder: Map<number, { alt: string }> }): ProduktBewertung {
  const s = p.stein_id ? idx.steine.get(p.stein_id) : undefined;
  const punkte = [...(s ? pruefeStein(s) : []), ...pruefeProdukt(p, d, idx.bilder)];
  const regeln = Object.entries(REGELN).filter(([k, v]) => (v.gilt === "produkt" || s) && !(p.art === "nistklinker" && (k === "format" || k === "vk")));
  const gesamt = regeln.reduce((a, [, v]) => a + (v.schwere === "pflicht" ? 2 : 1), 0);
  const fehlt = punkte.reduce((a, x) => a + (x.schwere === "pflicht" ? 2 : 1), 0);
  return { punkte, score: Math.max(0, Math.round((1 - fehlt / gesamt) * 100)) };
}
