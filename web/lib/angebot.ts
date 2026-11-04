// Angebotsberechnung und Nummernvergabe. Ohne Browser-Abhängigkeiten.
import { aktuellerPreis, type Daten, type Position, type Produkt, type Vorgang } from "./modell.ts";
import { formatWerte } from "./formate.ts";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Menge aus Fläche und Verschnitt; Stück aufgerundet. */
export function positionRechnen(p: Position): Position {
  const menge_m2 = r2(p.flaeche_m2 * (1 + p.verschnitt_proz / 100));
  const menge_stk = p.bedarf_stk_m2 ? Math.ceil(menge_m2 * p.bedarf_stk_m2) : null;
  return { ...p, menge_m2, menge_stk };
}

export function positionNetto(p: Position): number {
  return r2(p.menge_m2 * p.ep_netto_m2 * (1 - p.rabatt_proz / 100));
}

export function summen(v: Pick<Vorgang, "positionen" | "fracht_netto"> & { mindermenge_netto?: number }, mwst_proz: number) {
  const waren = r2(v.positionen.reduce((a, p) => a + positionNetto(p), 0));
  const netto = r2(waren + (v.fracht_netto || 0) + (v.mindermenge_netto || 0));
  const mwst = r2(netto * mwst_proz / 100);
  return { waren, netto, mwst, brutto: r2(netto + mwst) };
}

/**
 * Position aus einem Produkt. format: gewünschtes Format; wird nur übernommen, wenn das Produkt es führt.
 * Ohne passendes Format und mit nur einem Format am Produkt wird dieses genommen, sonst bleibt es offen.
 */
export function positionAusProdukt(p: Produkt, d: Daten, flaeche_m2: number, format?: string | null): Position {
  const f = format && p.formate.includes(format) ? format : p.formate.length === 1 ? p.formate[0] : "";
  const basis: Position = {
    produkt_id: p.id, sku: p.sku ?? "", bezeichnung: p.name, format: f, flaeche_m2, verschnitt_proz: d.einstellungen.angebot.verschnitt_proz,
    bedarf_stk_m2: null, menge_m2: 0, menge_stk: null, ep_netto_m2: 0, rabatt_proz: 0,
  };
  return positionFormat(basis, p, d, f, true);
}

/**
 * Setzt das Format einer Position: Bedarf je m² aus dem Format, Preis je Format.
 * Der Preis wird nur ersetzt, wenn er bisher dem hinterlegten Preis entsprach (also nicht von Hand geändert war).
 */
export function positionFormat(pos: Position, p: Produkt, d: Daten, format: string, preisImmer = false): Position {
  const s = p.stein_id ? d.steine.find((x) => x.id === p.stein_id) : undefined;
  const bedarf = format ? formatWerte(d, s, format).bedarf_stk_m2 : null;
  const altPreis = aktuellerPreis(p, "vk", "m2", undefined, pos.format || null)?.betrag ?? 0;
  const neuPreis = aktuellerPreis(p, "vk", "m2", undefined, format || null)?.betrag ?? 0;
  const ep = preisImmer || pos.ep_netto_m2 === altPreis ? neuPreis : pos.ep_netto_m2;
  return positionRechnen({ ...pos, format, bedarf_stk_m2: bedarf, ep_netto_m2: ep });
}

/** Kürzel aus dem Bearbeiternamen (zwei Buchstaben), damit zwei Rechner keine gleiche Nummer vergeben. */
export function kuerzel(name: string): string {
  const k = name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  return k.padEnd(2, "X");
}

export function naechsteNummer(d: Daten, bearbeiter: string, jahr = new Date().getFullYear()): string {
  const vor = `${d.einstellungen.angebot.nummer_praefix}-${jahr}-${kuerzel(bearbeiter)}`;
  let max = 0;
  for (const v of d.vorgaenge) if (v.nummer.startsWith(vor + "-")) max = Math.max(max, Number(v.nummer.slice(vor.length + 1)) || 0);
  return `${vor}-${String(max + 1).padStart(3, "0")}`;
}

export const euro = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
export const zahl = (n: number | null | undefined, stellen = 2) => (n == null ? "–" : n.toLocaleString("de-DE", { maximumFractionDigits: stellen }));
