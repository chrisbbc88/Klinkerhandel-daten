// Werte aus dem Text eines Hersteller-Datenblatts erkennen (Mustererkennung, keine KI).
// Jeder Vorschlag muss vom Bearbeiter bestätigt werden. Ohne Browser-Abhängigkeiten.
import type { Stein } from "./modell.ts";

export type DatenblattFeld = "laenge_mm" | "breite_mm" | "hoehe_mm" | "druckfestigkeit_nmm2" | "wasseraufnahme_proz" | "frostwiderstand" | "gewicht_kg" | "bedarf_stk_m2";
export interface Vorschlag { feld: DatenblattFeld; label: string; wert: number | string; fundstelle: string }

export const FELD_LABEL: Record<DatenblattFeld, string> = {
  laenge_mm: "Länge mm", breite_mm: "Breite mm", hoehe_mm: "Höhe mm", druckfestigkeit_nmm2: "Druckfestigkeit N/mm²",
  wasseraufnahme_proz: "Wasseraufnahme %", frostwiderstand: "Frostwiderstand", gewicht_kg: "Gewicht kg", bedarf_stk_m2: "Bedarf Stk/m²",
};

const NUM = "(\\d{1,3}(?:[.,]\\d{1,2})?)";
const n = (s: string) => Number(s.replace(",", "."));
function stelle(text: string, i: number, len: number) {
  return text.slice(Math.max(0, i - 30), i + len + 30).replace(/\s+/g, " ").trim();
}

export function erkenneWerte(roh: string): Vorschlag[] {
  const text = roh.replace(/ /g, " ").replace(/[≥≤<>]/g, " ");
  const out: Vorschlag[] = [];
  const add = (feld: DatenblattFeld, wert: number | string, m: RegExpExecArray) => {
    if (!out.some((v) => v.feld === feld)) out.push({ feld, label: FELD_LABEL[feld], wert, fundstelle: stelle(text, m.index, m[0].length) });
  };
  let m: RegExpExecArray | null;

  m = /(\d{2,3})\s*[x×*\/]\s*(\d{2,3})\s*[x×*\/]\s*(\d{2,3})\s*(mm)?/i.exec(text);
  if (m) {
    const [l, b, h] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (l >= 150 && l <= 600 && b >= 8 && b <= 200 && h >= 30 && h <= 200) { add("laenge_mm", l, m); add("breite_mm", b, m); add("hoehe_mm", h, m); }
  }
  m = new RegExp(`(druckfestigkeit|compressive strength|druksterkte|résistance à la compression)[^\\d]{0,80}?${NUM}\\s*(n\\/mm|mpa)`, "i").exec(text);
  if (m) add("druckfestigkeit_nmm2", n(m[2]), m);
  m = new RegExp(`(wasseraufnahme|water absorption|wateropname|absorption d'eau)[^\\d]{0,80}?${NUM}\\s*(%|m\\.?-?%|gew)`, "i").exec(text);
  if (m) add("wasseraufnahme_proz", n(m[2]), m);
  m = /(frost[^\n]{0,80}?|vorst[^\n]{0,80}?|gel[^\n]{0,40}?)\bF\s?([012])\b/i.exec(text) ?? /\b(Kategorie|Klasse|class|klasse)\s*F\s?([012])\b/i.exec(text);
  if (m) add("frostwiderstand", `F${m[2]}`, m);
  m = new RegExp(`(gewicht|weight|massa|poids)[^\\d]{0,60}?${NUM}\\s*kg`, "i").exec(text);
  if (m && n(m[2]) > 0.2 && n(m[2]) < 20) add("gewicht_kg", n(m[2]), m);
  m = new RegExp(`${NUM}\\s*(st(ü|ue)ck|stk\\.?|st\\.?|stuks|pcs|pieces|steine)\\s*(\\/|pro|je|per)\\s*m\\s*(²|2)`, "i").exec(text)
    ?? new RegExp(`(bedarf|verbrauch|stuks per m|pieces per m|steine je m|steine pro m)[^\\d]{0,40}?${NUM}`, "i").exec(text);
  if (m) {
    const wert = n(m[1].match(/^\d/) ? m[1] : m[2]);
    if (wert >= 10 && wert <= 200) add("bedarf_stk_m2", wert, m);
  }
  return out;
}

export interface Abgleich extends Vorschlag { aktuell: unknown; gleich: boolean }
export function abgleichen(s: Stein, v: Vorschlag[]): Abgleich[] {
  return v.map((x) => {
    const aktuell = (s as any)[x.feld] ?? null;
    return { ...x, aktuell, gleich: aktuell !== null && String(aktuell) === String(x.wert) };
  });
}
