// Laufende Prüfung der Daten. Wird bei jeder Anzeige neu berechnet, damit ein erledigter
// Punkt sofort verschwindet. Ergänzt die Hinweise aus der Übernahme (modell.ts → hinweise).
import { aktuellerPreis, type Daten, type Produkt, type Stein } from "./modell.ts";
import { steinFormate } from "./formate.ts";

export interface Pruefpunkt { regel: string; schwere: "pflicht" | "empfohlen"; text: string }

export const REGELN: Record<string, { text: string; schwere: "pflicht" | "empfohlen"; gilt: "stein" | "produkt" }> = {
  hersteller: { text: "Hersteller fehlt", schwere: "empfohlen", gilt: "stein" },
  herstellungsart: { text: "Herstellungsart fehlt", schwere: "pflicht", gilt: "stein" },
  farbe: { text: "Keine Farbe", schwere: "pflicht", gilt: "stein" },
  sku: { text: "Keine Artikelnummer", schwere: "pflicht", gilt: "produkt" },
  format: { text: "Kein Format", schwere: "pflicht", gilt: "produkt" },
  bild: { text: "Kein Bild", schwere: "pflicht", gilt: "produkt" },
  masse: { text: "Maße fehlen (Format ohne Normmaß)", schwere: "empfohlen", gilt: "stein" },
  technik: { text: "Frost, Druckfestigkeit oder Wasseraufnahme fehlen", schwere: "empfohlen", gilt: "stein" },
  datenblatt: { text: "Kein Datenblatt geprüft", schwere: "empfohlen", gilt: "stein" },
  bilder3: { text: "Weniger als 3 Bilder", schwere: "empfohlen", gilt: "produkt" },
  alt: { text: "Bilder ohne Alt-Text", schwere: "empfohlen", gilt: "produkt" },
  text: { text: "Keine Produktbeschreibung", schwere: "empfohlen", gilt: "produkt" },
  vk: { text: "Kein Verkaufspreis je m²", schwere: "empfohlen", gilt: "produkt" },
};

/**
 * Prüft den Stein. Maße und Technik werden je Format geprüft, das in einem seiner Produkte angeboten wird
 * (produkte = Produkte dieses Steins, ggf. mit ungespeichertem Entwurf).
 */
export function pruefeStein(s: Stein, d: Pick<Daten, "formate" | "einstellungen" | "produkte">, produkte?: Produkt[]): Pruefpunkt[] {
  const r: Pruefpunkt[] = [];
  const add = (k: string, zusatz = "") => r.push({ regel: k, schwere: REGELN[k].schwere, text: REGELN[k].text + zusatz });
  if (!s.hersteller_id) add("hersteller");
  if (!s.herstellungsart) add("herstellungsart");
  if (!s.farben.length) add("farbe");
  const ps = (produkte ?? d.produkte.filter((p) => p.stein_id === s.id)).filter((p) => p.status !== "archiviert");
  const angeboten = steinFormate(d, s, ps).filter((w) => w.verblender || w.riemchen || w.andere);
  const ohneMass = angeboten.filter((w) => !(w.laenge_mm && w.breite_mm && w.hoehe_mm)).map((w) => w.format);
  const ohneTechnik = angeboten.filter((w) => !(w.frostwiderstand && w.druckfestigkeit_nmm2 && w.wasseraufnahme_proz != null)).map((w) => w.format);
  if (ohneMass.length) add("masse", `: ${ohneMass.join(", ")}`);
  if (ohneTechnik.length) add("technik", `: ${ohneTechnik.join(", ")}`);
  if (!s.datenblaetter.length) add("datenblatt");
  return r;
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
export function bewerte(p: Produkt, d: Daten, idx: { steine: Map<number, Stein>; bilder: Map<number, { alt: string }>; jeStein?: Map<number, Produkt[]> }): ProduktBewertung {
  const s = p.stein_id ? idx.steine.get(p.stein_id) : undefined;
  const punkte = [...(s ? pruefeStein(s, d, idx.jeStein?.get(s.id)) : []), ...pruefeProdukt(p, d, idx.bilder)];
  const regeln = Object.entries(REGELN).filter(([k, v]) => (v.gilt === "produkt" || s) && !(p.art === "nistklinker" && (k === "format" || k === "vk")));
  const gesamt = regeln.reduce((a, [, v]) => a + (v.schwere === "pflicht" ? 2 : 1), 0);
  const fehlt = punkte.reduce((a, x) => a + (x.schwere === "pflicht" ? 2 : 1), 0);
  return { punkte, score: Math.max(0, Math.round((1 - fehlt / gesamt) * 100)) };
}
