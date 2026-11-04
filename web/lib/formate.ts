// Formate (NF, DF, WF …) und die Werte eines Steins je Format.
//
// Ein Stein (HBR-Code) ist derselbe Klinker in mehreren Formaten. Maße, Gewicht, Druckfestigkeit,
// Wasseraufnahme, Frost und Bedarf je m² hängen vom Format ab und werden deshalb je Format geführt.
// Gespeichert wird nur, was jemand eingetragen hat (Stein.format_daten). Fehlt ein Maß, gilt das
// Normmaß aus den Stammdaten (Daten.formate); der Bedarf je m² wird aus Länge, Höhe und Fugen berechnet.
import type { Daten, Format, FormatText, Produkt, Stein, SteinFormat } from "./modell.ts";

export type MassQuelle = "eingetragen" | "norm" | "ueblich" | "festgelegt";
export const MASS_QUELLE: Record<MassQuelle, string> = {
  eingetragen: "eingetragen", norm: "Normmaß", ueblich: "übliches Maß, herstellerabhängig", festgelegt: "in den Stammdaten festgelegt",
};

/**
 * Maße der Formate. "norm" = feste Formatbezeichnung mit einheitlichem Maß (DIN-Formate DF/NF/2DF,
 * niederländische Waalformate WF/WDF, Reichsformat). "ueblich" = verbreitetes Maß, das je Hersteller
 * abweichen kann. null = kein einheitliches Maß, Werte kommen aus dem Datenblatt oder den Stammdaten.
 */
export const FORMAT_NORM: Record<string, { mm: [number, number, number] | null; art: "norm" | "ueblich" | null }> = {
  WF: { mm: [210, 100, 50], art: "norm" },
  WDF: { mm: [210, 100, 65], art: "norm" },
  DF: { mm: [240, 115, 52], art: "norm" },
  NF: { mm: [240, 115, 71], art: "norm" },
  "2DF": { mm: [240, 115, 113], art: "norm" },
  RF: { mm: [250, 120, 65], art: "norm" },
  LDF: { mm: [290, 90, 52], art: "ueblich" },
  XLDF: { mm: [365, 115, 52], art: "ueblich" },
  ModF: { mm: null, art: null },
  Modul: { mm: null, art: null },
  LF: { mm: null, art: null },
  BDF: { mm: null, art: null },
  "BDF-XL": { mm: null, art: null },
  BS: { mm: null, art: null },
};

/** Technische Felder je Format (ohne Maße). */
export const TECHNIK_FELDER = ["gewicht_kg", "druckfestigkeit_nmm2", "wasseraufnahme_proz", "frostwiderstand"] as const;
export const FORMAT_FELD_LABEL: Record<string, string> = {
  laenge_mm: "Länge mm", breite_mm: "Breite mm", hoehe_mm: "Höhe mm", gewicht_kg: "Gewicht kg/Stk",
  druckfestigkeit_nmm2: "Druckfestigkeit N/mm²", wasseraufnahme_proz: "Wasseraufnahme %", frostwiderstand: "Frostwiderstand",
  bedarf_stk_m2: "Bedarf Stk/m²", artikelnr_hersteller: "Artikelnr. Hersteller",
};
export type FormatFeld = "laenge_mm" | "breite_mm" | "hoehe_mm" | "gewicht_kg" | "druckfestigkeit_nmm2" | "wasseraufnahme_proz" | "frostwiderstand" | "bedarf_stk_m2" | "artikelnr_hersteller";
export const FORMAT_FELDER: FormatFeld[] = ["laenge_mm", "breite_mm", "hoehe_mm", "gewicht_kg", "druckfestigkeit_nmm2", "wasseraufnahme_proz", "frostwiderstand", "bedarf_stk_m2", "artikelnr_hersteller"];

export function steinFormatLeer(format: string): SteinFormat {
  return { format, laenge_mm: null, breite_mm: null, hoehe_mm: null, gewicht_kg: null, druckfestigkeit_nmm2: null,
    wasseraufnahme_proz: null, frostwiderstand: null, bedarf_stk_m2: null, artikelnr_hersteller: "", quelle: null };
}

/** Stück je m² Ansichtsfläche: 1 m² / ((Länge + Stoßfuge) × (Höhe + Lagerfuge)), gerundet. */
export function bedarfBerechnen(laenge: number | null, hoehe: number | null, fugen: { stoss_mm: number; lager_mm: number }): number | null {
  if (!laenge || !hoehe) return null;
  return Math.round(1_000_000 / ((laenge + fugen.stoss_mm) * (hoehe + fugen.lager_mm)));
}

/** Normmaß eines Formats aus den Stammdaten, mit Herkunft. */
export function normMass(d: Pick<Daten, "formate">, kuerzel: string): { mm: [number, number, number]; art: "norm" | "ueblich" | "festgelegt" } | null {
  const f = d.formate.find((x) => x.kuerzel === kuerzel);
  if (!f?.mm) return null;
  return { mm: f.mm, art: f.mm_art === "norm" || f.mm_art === "ueblich" ? f.mm_art : "festgelegt" };
}

export interface FormatWerte {
  format: string; name: string;
  laenge_mm: number | null; breite_mm: number | null; hoehe_mm: number | null; masse_quelle: MassQuelle | null;
  gewicht_kg: number | null; druckfestigkeit_nmm2: number | null; wasseraufnahme_proz: number | null; frostwiderstand: "F0" | "F1" | "F2" | null;
  bedarf_stk_m2: number | null; bedarf_quelle: "eingetragen" | "berechnet" | null;
  artikelnr_hersteller: string;
  /** In welchen Produkten des Steins das Format angeboten wird */
  verblender: boolean; riemchen: boolean; andere: boolean;
  gespeichert: SteinFormat | null;
}

/** Werte eines Steins in einem Format: Eingetragenes vor Normmaß, Bedarf eingetragen oder berechnet. */
export function formatWerte(d: Pick<Daten, "formate" | "einstellungen">, s: Pick<Stein, "format_daten"> | null | undefined, kuerzel: string, produkte: Pick<Produkt, "art" | "formate">[] = []): FormatWerte {
  const g = s?.format_daten.find((x) => x.format === kuerzel) ?? null;
  const norm = normMass(d, kuerzel);
  // Je Maß: eingetragener Wert vor Normmaß
  const l = g?.laenge_mm ?? norm?.mm[0] ?? null;
  const b = g?.breite_mm ?? norm?.mm[1] ?? null;
  const h = g?.hoehe_mm ?? norm?.mm[2] ?? null;
  const eigen = !!(g && (g.laenge_mm || g.breite_mm || g.hoehe_mm));
  const masse_quelle: MassQuelle | null = eigen ? "eingetragen" : norm ? norm.art : null;
  const berechnet = bedarfBerechnen(l, h, d.einstellungen.fugen);
  const angeboten = (art: string) => produkte.some((p) => p.art === art && p.formate.includes(kuerzel));
  return {
    format: kuerzel, name: d.formate.find((f) => f.kuerzel === kuerzel)?.name ?? kuerzel,
    laenge_mm: l, breite_mm: b, hoehe_mm: h, masse_quelle,
    gewicht_kg: g?.gewicht_kg ?? null, druckfestigkeit_nmm2: g?.druckfestigkeit_nmm2 ?? null,
    wasseraufnahme_proz: g?.wasseraufnahme_proz ?? null, frostwiderstand: g?.frostwiderstand ?? null,
    bedarf_stk_m2: g?.bedarf_stk_m2 ?? berechnet, bedarf_quelle: g?.bedarf_stk_m2 ? "eingetragen" : berechnet ? "berechnet" : null,
    artikelnr_hersteller: g?.artikelnr_hersteller ?? "",
    verblender: angeboten("verblender"), riemchen: angeboten("riemchen"),
    andere: produkte.some((p) => p.art !== "verblender" && p.art !== "riemchen" && p.formate.includes(kuerzel)),
    gespeichert: g,
  };
}

/** Reihenfolge wie in den Stammdaten, unbekannte Kürzel hinten. */
export function formatSortierung(d: Pick<Daten, "formate">): (a: string, b: string) => number {
  const pos = new Map(d.formate.map((f, i) => [f.kuerzel, i]));
  return (a, b) => (pos.get(a) ?? 999) - (pos.get(b) ?? 999) || a.localeCompare(b);
}

/** Alle Formate eines Steins: aus seinen Produkten und aus eingetragenen Werten. */
export function steinFormate(d: Pick<Daten, "formate" | "einstellungen" | "produkte">, s: Stein, produkte?: Produkt[]): FormatWerte[] {
  const ps = produkte ?? d.produkte.filter((p) => p.stein_id === s.id && p.status !== "archiviert");
  const kuerzel = new Set<string>([...ps.flatMap((p) => p.formate), ...s.format_daten.map((x) => x.format)]);
  return [...kuerzel].sort(formatSortierung(d)).map((k) => formatWerte(d, s, k, ps));
}

/** Setzt Werte eines Formats; leere Datensätze werden entfernt. Gibt die neue Liste zurück (für aendere()). */
export function formatSetzen(s: Pick<Stein, "format_daten">, kuerzel: string, patch: Partial<SteinFormat>): SteinFormat[] {
  const liste = s.format_daten.map((x) => ({ ...x }));
  let g = liste.find((x) => x.format === kuerzel);
  if (!g) { g = steinFormatLeer(kuerzel); liste.push(g); }
  Object.assign(g, patch, { format: kuerzel });
  return liste.filter((x) => !istLeer(x));
}

export function istLeer(x: SteinFormat): boolean {
  return FORMAT_FELDER.every((k) => k === "artikelnr_hersteller" ? !x.artikelnr_hersteller : x[k] === null || x[k] === undefined);
}

/** Format anhand von Maßen erkennen (±3 mm), z. B. für Datenblätter ohne Formatangabe. */
export function formatAusMassen(d: Pick<Daten, "formate">, l: number, b: number | null, h: number, kandidaten?: string[]): string | null {
  const treffer = d.formate.filter((f) => f.mm && (!kandidaten || kandidaten.includes(f.kuerzel))
    && Math.abs(f.mm[0] - l) <= 3 && Math.abs(f.mm[2] - h) <= 3 && (b === null || Math.abs(f.mm[1] - b) <= 15));
  return treffer.length === 1 ? treffer[0].kuerzel : null;
}

/** Text „240 × 115 × 71 mm“; bei Riemchen die Riemchenstärke statt der Breite. */
export function masseText(w: Pick<FormatWerte, "laenge_mm" | "breite_mm" | "hoehe_mm">, riemchenStaerke?: number | null): string {
  if (!w.laenge_mm || !w.hoehe_mm) return "";
  const b = riemchenStaerke ?? w.breite_mm;
  return `${w.laenge_mm} × ${b ?? "?"} × ${w.hoehe_mm} mm`;
}

/** Ergänzt Formate der Stammdaten um Normmaße, die ältere Stände noch nicht hatten. Überschreibt keine eigenen Maße. */
export function formateNormalisieren(formate: Format[]): Format[] {
  for (const f of formate) {
    const n = FORMAT_NORM[f.kuerzel];
    if (f.mm_art === undefined) {
      if (!f.mm && n?.mm) { f.mm = [...n.mm]; f.mm_art = n.art; }
      else if (f.mm && n?.mm && f.mm.join() === n.mm.join()) f.mm_art = n.art;
      else f.mm_art = f.mm ? "festgelegt" : null;
    }
  }
  return formate;
}

// ---------- Texte je Format ----------

export function formatText(p: Pick<Produkt, "format_texte">, format: string): FormatText {
  return p.format_texte?.find((x) => x.format === format) ?? { format, kurztext: "", beschreibung: "" };
}

/** Setzt Kurztext/Beschreibung eines Formats; leere Einträge werden entfernt. */
export function formatTextSetzen(p: Pick<Produkt, "format_texte">, format: string, patch: Partial<Omit<FormatText, "format">>): FormatText[] {
  const liste = (p.format_texte ?? []).map((x) => ({ ...x }));
  let t = liste.find((x) => x.format === format);
  if (!t) { t = { format, kurztext: "", beschreibung: "" }; liste.push(t); }
  Object.assign(t, patch);
  return liste.filter((x) => x.kurztext.trim() || x.beschreibung.trim());
}

const woerter = (t: string) => t.toLowerCase().replace(/[^a-zäöüß0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
/** Ähnlichkeit zweier Texte (0–1) über Wortgruppen aus drei Wörtern. Siehe AEHNLICH_AB. */
export function textAehnlichkeit(a: string, b: string): number {
  const gruppen = (t: string) => { const w = woerter(t); const s = new Set<string>(); for (let i = 0; i + 2 < w.length; i++) s.add(w.slice(i, i + 3).join(" ")); if (!s.size && w.length) s.add(w.join(" ")); return s; };
  const x = gruppen(a), y = gruppen(b);
  if (!x.size || !y.size) return 0;
  let gleich = 0;
  for (const g of x) if (y.has(g)) gleich++;
  return gleich / (x.size + y.size - gleich);
}

/** Ab dieser Ähnlichkeit gilt ein Text als fast doppelt (z. B. gleiche Vorlage, nur Format und Maße getauscht). */
export const AEHNLICH_AB = 0.6;

/** Paare von Formattexten (und allgemeinem Text), die sich zu sehr ähneln. */
export function aehnlicheTexte(p: Pick<Produkt, "beschreibung" | "format_texte" | "formate">): { a: string; b: string; wert: number }[] {
  const texte = ([["allgemein", p.beschreibung], ...p.formate.map((f) => [f, formatText(p, f).beschreibung])] as [string, string][]).filter(([, t]) => t.trim().length > 40);
  const out: { a: string; b: string; wert: number }[] = [];
  for (let i = 0; i < texte.length; i++) for (let j = i + 1; j < texte.length; j++) {
    const w = textAehnlichkeit(texte[i][1], texte[j][1]);
    if (w >= AEHNLICH_AB) out.push({ a: texte[i][0], b: texte[j][0], wert: w });
  }
  return out;
}

/** Kurzer Charakter eines Formats für Textvorschläge (allgemeines Fachwissen, vom Bearbeiter zu prüfen). */
export const FORMAT_CHARAKTER: Record<string, string> = {
  WF: "Das kleine Waalformat stammt aus der niederländischen Tradition und erzeugt durch die vielen Fugen ein lebendiges, feingliedriges Fassadenbild.",
  WDF: "Das Waaldickformat ist etwas höher als das Waalformat und wirkt dadurch kräftiger, behält aber den kleinteiligen Charakter.",
  DF: "Das flache Dünnformat betont die Waagerechte und lässt die Fassade gestreckt und ruhig wirken.",
  NF: "Das Normalformat ist das klassische deutsche Ziegelformat mit ausgewogenem Verhältnis von Länge und Höhe.",
  "2DF": "Das hohe Format 2DF ergibt ein großzügiges Fugenbild und einen zügigen Baufortschritt.",
  RF: "Das Reichsformat ist ein historisches Format, das sich besonders für Sanierungen und Ergänzungen an Altbauten eignet.",
  LDF: "Das lange Dünnformat streckt die Fassade optisch und passt gut zu moderner Architektur.",
  XLDF: "Das extra lange Dünnformat betont die Horizontale besonders stark und gibt der Fassade eine sehr moderne, ruhige Wirkung.",
  LF: "Das Langformat setzt mit seiner gestreckten Form deutliche horizontale Linien.",
};
