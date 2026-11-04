// Formate und technische Werte als CSV: eine Zeile je Stein und Format. Ohne Browser-Abhängigkeiten.
// Exportiert werden die geltenden Werte (auch Normmaß und berechneter Bedarf). Beim Import gilt ein Wert,
// der dem Normmaß bzw. dem berechneten Bedarf entspricht, als unverändert – so werden Normwerte nicht
// versehentlich zu „eingetragenen“ Werten.
import { csvText, csvLesen, zahlLesen, LEEREN } from "./csv.ts";
import type { Daten, SteinFormat } from "./modell.ts";
import { aendere } from "./aendern.ts";
import { formatSetzen, steinFormate, normMass, bedarfBerechnen, MASS_QUELLE, type FormatFeld } from "./formate.ts";

interface Spalte { kopf: string; label: string; feld?: FormatFeld; min?: number; max?: number }
export const FORMAT_SPALTEN: Spalte[] = [
  { kopf: "hbr_code", label: "HBR-Code" },
  { kopf: "format", label: "Format" },
  { kopf: "verblender", label: "Als Verblender" },
  { kopf: "riemchen", label: "Als Riemchen" },
  { kopf: "laenge_mm", label: "Länge mm", feld: "laenge_mm", min: 20, max: 1000 },
  { kopf: "breite_mm", label: "Breite mm", feld: "breite_mm", min: 5, max: 500 },
  { kopf: "hoehe_mm", label: "Höhe mm", feld: "hoehe_mm", min: 10, max: 500 },
  { kopf: "masse_quelle", label: "Herkunft Maße" },
  { kopf: "gewicht_kg", label: "Gewicht kg/Stk", feld: "gewicht_kg", min: 0.01, max: 100 },
  { kopf: "druckfestigkeit_nmm2", label: "Druckfestigkeit N/mm²", feld: "druckfestigkeit_nmm2", min: 1, max: 300 },
  { kopf: "wasseraufnahme_proz", label: "Wasseraufnahme %", feld: "wasseraufnahme_proz", min: 0, max: 40 },
  { kopf: "frost", label: "Frostwiderstand", feld: "frostwiderstand" },
  { kopf: "bedarf_stk_m2", label: "Bedarf Stk/m²", feld: "bedarf_stk_m2", min: 1, max: 400 },
  { kopf: "bedarf_quelle", label: "Herkunft Bedarf" },
  { kopf: "artikelnr_hersteller", label: "Artikelnr. Hersteller", feld: "artikelnr_hersteller" },
];

export function formateCsv(d: Daten, steinIds?: Set<number>): string {
  const zeilen: unknown[][] = [];
  for (const s of [...d.steine].sort((a, b) => a.hbr_code.localeCompare(b.hbr_code))) {
    if (steinIds && !steinIds.has(s.id)) continue;
    for (const w of steinFormate(d, s)) zeilen.push([
      s.hbr_code, w.format, w.verblender ? "ja" : "", w.riemchen ? "ja" : "",
      w.laenge_mm, w.breite_mm, w.hoehe_mm, w.masse_quelle ? MASS_QUELLE[w.masse_quelle] : "",
      w.gewicht_kg, w.druckfestigkeit_nmm2, w.wasseraufnahme_proz, w.frostwiderstand ?? "",
      w.bedarf_stk_m2, w.bedarf_quelle ?? "", w.artikelnr_hersteller,
    ]);
  }
  return csvText(FORMAT_SPALTEN.map((s) => s.kopf), zeilen);
}

export interface FormatImportZeile {
  nr: number; hbr_code: string; format: string; stein_id: number | null; aktion: "aendern" | "gleich" | "fehler";
  fehler: string[]; aenderungen: { feld: FormatFeld; label: string; alt: unknown; neu: unknown }[];
}
export interface FormatImportPlan { zeilen: FormatImportZeile[]; unbekannteSpalten: string[]; fehlt: string[] }

/** Liest eine Format-CSV und berechnet die Änderungen. Schreibt nichts. Legt keine Steine an. */
export function formatImportPlanen(d: Daten, text: string): FormatImportPlan {
  const roh = csvLesen(text);
  if (roh.length < 2) return { zeilen: [], unbekannteSpalten: [], fehlt: ["Die Datei enthält keine Datenzeilen."] };
  const bekannt = new Map(FORMAT_SPALTEN.flatMap((s) => [[s.kopf, s], [s.label.toLowerCase(), s]] as const));
  const spalten = roh[0].map((k) => bekannt.get(k.trim().toLowerCase()));
  const unbekannteSpalten = roh[0].filter((_, i) => !spalten[i]);
  const codeI = spalten.findIndex((s) => s?.kopf === "hbr_code"), fmtI = spalten.findIndex((s) => s?.kopf === "format");
  if (codeI < 0 || fmtI < 0) return { zeilen: [], unbekannteSpalten, fehlt: ["Spalten „hbr_code“ und „format“ werden benötigt."] };
  const steine = new Map(d.steine.map((s) => [s.hbr_code, s]));
  const formate = new Map(d.formate.map((f) => [f.kuerzel.toLowerCase(), f.kuerzel]));
  const gesehen = new Map<string, number>();
  const zeilen: FormatImportZeile[] = [];
  for (let r = 1; r < roh.length; r++) {
    const z = roh[r];
    const hbr = (z[codeI] ?? "").trim().replace(/\s+/g, " ");
    const fmtRoh = (z[fmtI] ?? "").trim();
    const format = formate.get(fmtRoh.toLowerCase()) ?? fmtRoh;
    const zeile: FormatImportZeile = { nr: r + 1, hbr_code: hbr, format, stein_id: null, aktion: "gleich", fehler: [], aenderungen: [] };
    zeilen.push(zeile);
    if (!hbr && !fmtRoh) { zeilen.pop(); continue; }
    const s = steine.get(hbr);
    if (!s) { zeile.fehler.push(`Stein „${hbr}“ nicht gefunden`); zeile.aktion = "fehler"; continue; }
    if (!formate.has(fmtRoh.toLowerCase())) { zeile.fehler.push(`Format „${fmtRoh}“ unbekannt – erst unter Einstellungen › Stammdaten anlegen`); zeile.aktion = "fehler"; continue; }
    zeile.stein_id = s.id;
    const k = `${s.id}:${format}`;
    if (gesehen.has(k)) zeile.fehler.push(`Doppelt in der Datei (auch Zeile ${gesehen.get(k)})`);
    gesehen.set(k, zeile.nr);
    // Ausgangslage: gespeicherte Werte, ergänzt um die in dieser Datei schon geplanten
    const g = s.format_daten.find((x) => x.format === format);
    const norm = normMass(d, format);
    const neuL = new Map<FormatFeld, unknown>();
    for (let i = 0; i < spalten.length; i++) {
      const sp = spalten[i];
      if (!sp?.feld) continue;
      const t = (z[i] ?? "").trim();
      if (!t) continue;
      let wert: unknown;
      if (t === LEEREN) wert = sp.feld === "artikelnr_hersteller" ? "" : null;
      else if (sp.feld === "artikelnr_hersteller") wert = t;
      else if (sp.feld === "frostwiderstand") {
        if (!/^F[012]$/i.test(t)) { zeile.fehler.push(`${sp.label} „${t}“ ungültig (F0, F1, F2)`); continue; }
        wert = t.toUpperCase();
      } else {
        const n = zahlLesen(t);
        if (n === undefined || Number.isNaN(n) || n < sp.min! || n > sp.max!) { zeile.fehler.push(`${sp.label}: „${t}“ ist keine gültige Zahl (${sp.min}–${sp.max})`); continue; }
        wert = n;
      }
      neuL.set(sp.feld, wert);
    }
    // Normmaß bzw. berechneter Bedarf gilt als unverändert, solange nichts eingetragen war
    const massIdx: Record<string, number> = { laenge_mm: 0, breite_mm: 1, hoehe_mm: 2 };
    for (const [feld, wert] of neuL) {
      const alt = g ? (g as any)[feld] ?? (feld === "artikelnr_hersteller" ? "" : null) : feld === "artikelnr_hersteller" ? "" : null;
      if (alt === null && feld in massIdx && norm && wert === norm.mm[massIdx[feld]]) continue;
      if (alt === null && feld === "bedarf_stk_m2") {
        const l = (neuL.get("laenge_mm") as number | null) ?? g?.laenge_mm ?? norm?.mm[0] ?? null;
        const h = (neuL.get("hoehe_mm") as number | null) ?? g?.hoehe_mm ?? norm?.mm[2] ?? null;
        if (wert === bedarfBerechnen(l, h, d.einstellungen.fugen)) continue;
      }
      if (JSON.stringify(alt) === JSON.stringify(wert)) continue;
      zeile.aenderungen.push({ feld, label: FORMAT_SPALTEN.find((x) => x.feld === feld)!.label, alt, neu: wert });
    }
    zeile.aktion = zeile.fehler.length ? "fehler" : zeile.aenderungen.length ? "aendern" : "gleich";
  }
  return { zeilen, unbekannteSpalten, fehlt: [] };
}

/** Übernimmt alle fehlerfreien Zeilen. Gibt die Anzahl geänderter Formate zurück. */
export function formatImportAusfuehren(d: Daten, plan: FormatImportPlan, von: string, jetzt = new Date().toISOString()): number {
  let n = 0;
  const jeStein = new Map<number, FormatImportZeile[]>();
  for (const z of plan.zeilen) if (z.aktion === "aendern" && z.stein_id) jeStein.set(z.stein_id, [...(jeStein.get(z.stein_id) ?? []), z]);
  for (const [id, zs] of jeStein) {
    const s = d.steine.find((x) => x.id === id);
    if (!s) continue;
    let liste = s.format_daten;
    for (const z of zs) {
      const patch: Partial<SteinFormat> = { quelle: "manuell" };
      for (const a of z.aenderungen) (patch as any)[a.feld] = a.neu;
      liste = formatSetzen({ format_daten: liste }, z.format, patch);
      n++;
    }
    aendere(d, "steine", s.id, { format_daten: liste }, von, undefined, jetzt);
  }
  return n;
}

