// Formate als CSV: eine Zeile je Stein und Format mit Maßen, Technik, Preisen und Texten. Ohne Browser-Abhängigkeiten.
// Exportiert werden die geltenden Werte (auch Normmaß und berechneter Bedarf). Beim Import gilt ein Wert,
// der dem Normmaß bzw. dem berechneten Bedarf entspricht, als unverändert – so werden Normwerte nicht
// versehentlich zu „eingetragenen“ Werten.
// Preise und Texte gehören zum Produkt (Verblender bzw. Riemchen). Ein Formatpreis wird nur exportiert, wenn
// es ihn gibt; bei Produkten mit nur einem Format ist es der allgemeine Preis.
import { csvText, csvLesen, zahlLesen, LEEREN } from "./csv.ts";
import { aktuellerPreis, heute, type Daten, type Preis, type Produkt, type SteinFormat } from "./modell.ts";
import { aendere, neueId } from "./aendern.ts";
import { formatSetzen, steinFormate, normMass, bedarfBerechnen, formatText, formatTextSetzen, MASS_QUELLE, type FormatFeld } from "./formate.ts";

type ProduktArt2 = "verblender" | "riemchen";
type Ziel = "stein" | ProduktArt2;
interface Spalte {
  kopf: string; label: string; feld?: FormatFeld; min?: number; max?: number;
  /** Preis- oder Textspalte eines Produkts */
  produkt?: { art: ProduktArt2; feld: "vk" | "ek" | "kurztext" | "beschreibung" };
}
const ART_LABEL: Record<ProduktArt2, string> = { verblender: "Verblender", riemchen: "Riemchen" };
const produktSpalten = (art: ProduktArt2): Spalte[] => [
  { kopf: `vk_${art}_m2`, label: `VK ${ART_LABEL[art]} €/m²`, produkt: { art, feld: "vk" }, min: 0.01, max: 100000 },
  { kopf: `ek_${art}_m2`, label: `EK ${ART_LABEL[art]} €/m²`, produkt: { art, feld: "ek" }, min: 0.01, max: 100000 },
  { kopf: `kurztext_${art}`, label: `Kurztext ${ART_LABEL[art]}`, produkt: { art, feld: "kurztext" } },
  { kopf: `beschreibung_${art}`, label: `Beschreibung ${ART_LABEL[art]}`, produkt: { art, feld: "beschreibung" } },
];
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
  ...produktSpalten("verblender"),
  ...produktSpalten("riemchen"),
  { kopf: "preis_gueltig_ab", label: "Preis gültig ab" },
];

/** Produkt einer Art zum Stein, das dieses Format führt. */
function produktFuer(d: Daten, steinId: number, art: ProduktArt2, format: string): Produkt | undefined {
  return d.produkte.find((p) => p.stein_id === steinId && p.art === art && p.status !== "archiviert" && p.formate.includes(format));
}
/** Preis dieses Formats: eigener Formatpreis; bei Produkten mit nur einem Format der allgemeine Preis. */
export function formatPreis(p: Produkt, art: "ek" | "vk", format: string, stichtag = heute()): Preis | null {
  if (p.formate.length <= 1) return aktuellerPreis(p, art, "m2", stichtag);
  const x = aktuellerPreis(p, art, "m2", stichtag, format);
  return x?.format === format ? x : null;
}

export function formateCsv(d: Daten, steinIds?: Set<number>): string {
  const zeilen: unknown[][] = [];
  for (const s of [...d.steine].sort((a, b) => a.hbr_code.localeCompare(b.hbr_code))) {
    if (steinIds && !steinIds.has(s.id)) continue;
    for (const w of steinFormate(d, s)) {
      const prod = (art: ProduktArt2) => {
        const p = produktFuer(d, s.id, art, w.format);
        if (!p) return ["", "", "", ""];
        const t = formatText(p, w.format);
        return [formatPreis(p, "vk", w.format)?.betrag ?? "", formatPreis(p, "ek", w.format)?.betrag ?? "", t.kurztext, t.beschreibung];
      };
      zeilen.push([
        s.hbr_code, w.format, w.verblender ? "ja" : "", w.riemchen ? "ja" : "",
        w.laenge_mm, w.breite_mm, w.hoehe_mm, w.masse_quelle ? MASS_QUELLE[w.masse_quelle] : "",
        w.gewicht_kg, w.druckfestigkeit_nmm2, w.wasseraufnahme_proz, w.frostwiderstand ?? "",
        w.bedarf_stk_m2, w.bedarf_quelle ?? "", w.artikelnr_hersteller,
        ...prod("verblender"), ...prod("riemchen"), "",
      ]);
    }
  }
  return csvText(FORMAT_SPALTEN.map((s) => s.kopf), zeilen);
}

export interface FormatAenderung { feld: string; label: string; alt: unknown; neu: unknown; ziel: Ziel; produkt_id?: number }
export interface FormatImportZeile {
  nr: number; hbr_code: string; format: string; stein_id: number | null; aktion: "aendern" | "gleich" | "fehler";
  fehler: string[]; aenderungen: FormatAenderung[]; gueltig_ab: string;
}
export interface FormatImportPlan { zeilen: FormatImportZeile[]; unbekannteSpalten: string[]; fehlt: string[] }

/** Liest eine Format-CSV und berechnet die Änderungen. Schreibt nichts. Legt keine Steine oder Produkte an. */
export function formatImportPlanen(d: Daten, text: string): FormatImportPlan {
  const roh = csvLesen(text);
  if (roh.length < 2) return { zeilen: [], unbekannteSpalten: [], fehlt: ["Die Datei enthält keine Datenzeilen."] };
  const bekannt = new Map(FORMAT_SPALTEN.flatMap((s) => [[s.kopf, s], [s.label.toLowerCase(), s]] as const));
  const spalten = roh[0].map((k) => bekannt.get(k.trim().toLowerCase()));
  const unbekannteSpalten = roh[0].filter((_, i) => !spalten[i]);
  const codeI = spalten.findIndex((s) => s?.kopf === "hbr_code"), fmtI = spalten.findIndex((s) => s?.kopf === "format");
  const abI = spalten.findIndex((s) => s?.kopf === "preis_gueltig_ab");
  if (codeI < 0 || fmtI < 0) return { zeilen: [], unbekannteSpalten, fehlt: ["Spalten „hbr_code“ und „format“ werden benötigt."] };
  const steine = new Map(d.steine.map((s) => [s.hbr_code, s]));
  const formate = new Map(d.formate.map((f) => [f.kuerzel.toLowerCase(), f.kuerzel]));
  const gesehen = new Map<string, number>();
  const zeilen: FormatImportZeile[] = [];
  for (let r = 1; r < roh.length; r++) {
    const z = roh[r];
    const hbr = (z[codeI] ?? "").trim().replace(/\s+/g, " ");
    const fmtRoh = (z[fmtI] ?? "").trim();
    if (!hbr && !fmtRoh) continue;
    const format = formate.get(fmtRoh.toLowerCase()) ?? fmtRoh;
    const datumRoh = abI >= 0 ? (z[abI] ?? "").trim() : "";
    const datum = !datumRoh ? heute() : /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(datumRoh) ? datumRoh.split(".").reverse().map((x) => x.padStart(2, "0")).join("-") : datumRoh;
    const zeile: FormatImportZeile = { nr: r + 1, hbr_code: hbr, format, stein_id: null, aktion: "gleich", fehler: [], aenderungen: [], gueltig_ab: datum };
    zeilen.push(zeile);
    const s = steine.get(hbr);
    if (!s) { zeile.fehler.push(`Stein „${hbr}“ nicht gefunden`); zeile.aktion = "fehler"; continue; }
    if (!formate.has(fmtRoh.toLowerCase())) { zeile.fehler.push(`Format „${fmtRoh}“ unbekannt – erst unter Einstellungen › Stammdaten anlegen`); zeile.aktion = "fehler"; continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) zeile.fehler.push(`Preisdatum „${datumRoh}“ ungültig (TT.MM.JJJJ)`);
    zeile.stein_id = s.id;
    const k = `${s.id}:${format}`;
    if (gesehen.has(k)) zeile.fehler.push(`Doppelt in der Datei (auch Zeile ${gesehen.get(k)})`);
    gesehen.set(k, zeile.nr);
    const g = s.format_daten.find((x) => x.format === format);
    const norm = normMass(d, format);
    const neuL = new Map<FormatFeld, unknown>();
    for (let i = 0; i < spalten.length; i++) {
      const sp = spalten[i];
      if (!sp?.feld && !sp?.produkt) continue;
      const t = (z[i] ?? "").trim();
      if (!t) continue;
      // Preise und Texte des Produkts
      if (sp.produkt) {
        const p = produktFuer(d, s.id, sp.produkt.art, format);
        if (!p) { zeile.fehler.push(`${sp.label}: kein ${ART_LABEL[sp.produkt.art]} zu ${hbr} im Format ${format}`); continue; }
        const textFeld = sp.produkt.feld === "kurztext" || sp.produkt.feld === "beschreibung";
        if (textFeld) {
          const alt = formatText(p, format)[sp.produkt.feld as "kurztext" | "beschreibung"];
          const neu = t === LEEREN ? "" : t;
          if (alt !== neu) zeile.aenderungen.push({ feld: sp.produkt.feld, label: sp.label, alt, neu, ziel: sp.produkt.art, produkt_id: p.id });
        } else {
          if (t === LEEREN) { zeile.fehler.push(`${sp.label}: Preise können nicht geleert werden – neuen Preis eintragen`); continue; }
          const n = zahlLesen(t);
          if (n === undefined || Number.isNaN(n) || n < sp.min! || n > sp.max!) { zeile.fehler.push(`${sp.label}: „${t}“ ist kein gültiger Preis`); continue; }
          const alt = /^\d{4}-\d{2}-\d{2}$/.test(datum) ? formatPreis(p, sp.produkt.feld as "ek" | "vk", format, datum)?.betrag ?? null : null;
          if (alt !== n) zeile.aenderungen.push({ feld: sp.produkt.feld, label: sp.label, alt, neu: n, ziel: sp.produkt.art, produkt_id: p.id });
        }
        continue;
      }
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
      neuL.set(sp.feld!, wert);
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
      zeile.aenderungen.push({ feld, label: FORMAT_SPALTEN.find((x) => x.feld === feld)!.label, alt, neu: wert, ziel: "stein" });
    }
    zeile.aktion = zeile.fehler.length ? "fehler" : zeile.aenderungen.length ? "aendern" : "gleich";
  }
  return { zeilen, unbekannteSpalten, fehlt: [] };
}

/** Übernimmt alle fehlerfreien Zeilen. Gibt die Anzahl geänderter Zeilen (Stein und Format) zurück. */
export function formatImportAusfuehren(d: Daten, plan: FormatImportPlan, von: string, jetzt = new Date().toISOString()): number {
  let n = 0;
  const steinListe = new Map<number, SteinFormat[]>();
  const produktPatch = new Map<number, { preise: Preis[]; format_texte: Produkt["format_texte"] }>();
  for (const z of plan.zeilen) {
    if (z.aktion !== "aendern" || !z.stein_id) continue;
    n++;
    const s = d.steine.find((x) => x.id === z.stein_id)!;
    const steinAend = z.aenderungen.filter((a) => a.ziel === "stein");
    if (steinAend.length) {
      const patch: Partial<SteinFormat> = { quelle: "manuell" };
      for (const a of steinAend) (patch as any)[a.feld] = a.neu;
      steinListe.set(s.id, formatSetzen({ format_daten: steinListe.get(s.id) ?? s.format_daten }, z.format, patch));
    }
    for (const a of z.aenderungen.filter((x) => x.ziel !== "stein" && x.produkt_id)) {
      const p = d.produkte.find((x) => x.id === a.produkt_id)!;
      const pp = produktPatch.get(p.id) ?? { preise: [...p.preise], format_texte: p.format_texte ?? [] };
      if (a.feld === "vk" || a.feld === "ek") {
        pp.preise.push({ id: neueId(), preisart: a.feld, betrag: Math.round((a.neu as number) * 100) / 100, einheit: "m2", gueltig_ab: z.gueltig_ab,
          quelle: a.feld === "ek" ? "lieferant" : "manuell", erfasst_von: von, erfasst_am: jetzt, ...(p.formate.length > 1 ? { format: z.format } : {}) });
      } else pp.format_texte = formatTextSetzen({ format_texte: pp.format_texte }, z.format, { [a.feld]: a.neu as string });
      produktPatch.set(p.id, pp);
    }
  }
  for (const [id, liste] of steinListe) aendere(d, "steine", id, { format_daten: liste }, von, undefined, jetzt);
  for (const [id, pp] of produktPatch) aendere(d, "produkte", id, pp, von, undefined, jetzt);
  return n;
}
