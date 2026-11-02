// Produkte als CSV: Export für Excel und Import mit Vorschau. Ohne Browser-Abhängigkeiten.
import { csvText, csvLesen, zahlLesen, zahlText, LEEREN } from "./csv.ts";
import {
  aktuellerPreis, heute, produktName, steinLeer, skuFuer, HERSTELLUNG, ART, STATUS, OBERFLAECHEN,
  type Daten, type Produkt, type Stein, type Preis, type ProduktArt,
} from "./modell.ts";
import { aendere, lege_an, neueId } from "./aendern.ts";
import { bewerte } from "./pruefung.ts";

type Ziel = "produkt" | "stein" | "preis" | "info";
type Lesen = { wert: unknown } | { fehler: string };
interface Spalte {
  kopf: string; label: string; ziel: Ziel; feld?: string;
  get: (p: Produkt, s: Stein | undefined, d: Daten) => unknown;
  lesen?: (t: string, d: Daten) => Lesen;
}

const txt = (t: string): Lesen => ({ wert: t });
const zahl = (min: number, max: number) => (t: string): Lesen => {
  const n = zahlLesen(t);
  if (n === undefined) return { wert: null };
  if (Number.isNaN(n) || n < min || n > max) return { fehler: `„${t}“ ist keine gültige Zahl (${min}–${max})` };
  return { wert: n };
};
const auswahl = (werte: Record<string, string>, name: string) => (t: string): Lesen => {
  const k = Object.entries(werte).find(([k, v]) => k === t.toLowerCase() || v.toLowerCase() === t.toLowerCase());
  return k ? { wert: k[0] } : { fehler: `${name} „${t}“ unbekannt (erlaubt: ${Object.values(werte).join(", ")})` };
};
const liste = (erlaubt: (d: Daten) => string[], name: string) => (t: string, d: Daten): Lesen => {
  const ok = erlaubt(d);
  const teile = t.split(/[,|]/).map((x) => x.trim()).filter(Boolean);
  const map = new Map(ok.map((x) => [x.toLowerCase(), x]));
  const falsch = teile.filter((x) => !map.has(x.toLowerCase()));
  if (falsch.length) return { fehler: `${name} unbekannt: ${falsch.join(", ")}` };
  return { wert: teile.map((x) => map.get(x.toLowerCase())!) };
};

export const SPALTEN: Spalte[] = [
  { kopf: "sku", label: "Artikelnummer", ziel: "info", get: (p) => p.sku ?? "" },
  { kopf: "art", label: "Art", ziel: "info", get: (p) => ART[p.art] },
  { kopf: "name", label: "Name", ziel: "produkt", feld: "name", get: (p) => p.name, lesen: (t) => (t.trim() ? txt(t.trim()) : { fehler: "Name darf nicht leer sein" }) },
  { kopf: "status", label: "Status", ziel: "produkt", feld: "status", get: (p) => STATUS[p.status], lesen: auswahl(STATUS, "Status") },
  { kopf: "hersteller", label: "Hersteller", ziel: "stein", feld: "hersteller_id", get: (_p, s, d) => d.hersteller.find((h) => h.id === s?.hersteller_id)?.name ?? "",
    lesen: (t, d) => { const h = d.hersteller.find((h) => h.name.toLowerCase() === t.trim().toLowerCase()); return h ? { wert: h.id } : { fehler: `Hersteller „${t}“ unbekannt – erst unter Einstellungen › Stammdaten anlegen` }; } },
  { kopf: "herstellungsart", label: "Herstellungsart", ziel: "stein", feld: "herstellungsart", get: (_p, s) => (s?.herstellungsart ? HERSTELLUNG[s.herstellungsart] : ""), lesen: auswahl(HERSTELLUNG, "Herstellungsart") },
  { kopf: "farben", label: "Farben", ziel: "stein", feld: "farben", get: (_p, s) => s?.farben.join(", ") ?? "", lesen: liste((d) => d.farben.map((f) => f.schluessel), "Farbe") },
  { kopf: "formate", label: "Formate", ziel: "produkt", feld: "formate", get: (p) => p.formate.join(", "), lesen: liste((d) => d.formate.map((f) => f.kuerzel), "Format") },
  { kopf: "oberflaechen", label: "Oberflächen", ziel: "stein", feld: "oberflaechen", get: (_p, s) => s?.oberflaechen.join(", ") ?? "", lesen: liste(() => OBERFLAECHEN, "Oberfläche") },
  { kopf: "laenge_mm", label: "Länge mm", ziel: "stein", feld: "laenge_mm", get: (_p, s) => s?.laenge_mm, lesen: zahl(1, 2000) },
  { kopf: "breite_mm", label: "Breite mm", ziel: "stein", feld: "breite_mm", get: (_p, s) => s?.breite_mm, lesen: zahl(1, 1000) },
  { kopf: "hoehe_mm", label: "Höhe mm", ziel: "stein", feld: "hoehe_mm", get: (_p, s) => s?.hoehe_mm, lesen: zahl(1, 1000) },
  { kopf: "gewicht_kg", label: "Gewicht kg", ziel: "stein", feld: "gewicht_kg", get: (_p, s) => s?.gewicht_kg, lesen: zahl(0.01, 100) },
  { kopf: "druckfestigkeit_nmm2", label: "Druckfestigkeit N/mm²", ziel: "stein", feld: "druckfestigkeit_nmm2", get: (_p, s) => s?.druckfestigkeit_nmm2, lesen: zahl(1, 300) },
  { kopf: "wasseraufnahme_proz", label: "Wasseraufnahme %", ziel: "stein", feld: "wasseraufnahme_proz", get: (_p, s) => s?.wasseraufnahme_proz, lesen: zahl(0, 40) },
  { kopf: "frost", label: "Frostwiderstand", ziel: "stein", feld: "frostwiderstand", get: (_p, s) => s?.frostwiderstand ?? "",
    lesen: (t) => (/^F[012]$/i.test(t.trim()) ? { wert: t.trim().toUpperCase() } : { fehler: `Frostwiderstand „${t}“ ungültig (F0, F1, F2)` }) },
  { kopf: "bedarf_stk_m2", label: "Bedarf Stk/m²", ziel: "stein", feld: "bedarf_stk_m2", get: (_p, s) => s?.bedarf_stk_m2, lesen: zahl(1, 400) },
  { kopf: "riemchen_staerke_mm", label: "Riemchenstärke mm", ziel: "produkt", feld: "riemchen_staerke_mm", get: (p) => p.riemchen_staerke_mm, lesen: zahl(5, 60) },
  { kopf: "eckriemchen", label: "Eckriemchen", ziel: "produkt", feld: "eckriemchen", get: (p) => (p.eckriemchen == null ? "" : p.eckriemchen ? "ja" : "nein"),
    lesen: (t) => (/^(ja|j|1|x)$/i.test(t.trim()) ? { wert: true } : /^(nein|n|0)$/i.test(t.trim()) ? { wert: false } : { fehler: `Eckriemchen „${t}“: bitte ja oder nein` }) },
  { kopf: "ek_m2", label: "EK €/m²", ziel: "preis", feld: "ek", get: (p) => aktuellerPreis(p, "ek")?.betrag, lesen: zahl(0.01, 100000) },
  { kopf: "vk_m2", label: "VK €/m²", ziel: "preis", feld: "vk", get: (p) => aktuellerPreis(p, "vk")?.betrag, lesen: zahl(0.01, 100000) },
  { kopf: "preis_gueltig_ab", label: "Preis gültig ab", ziel: "info", get: () => "" },
  { kopf: "bezeichnung_hersteller", label: "Bezeichnung Hersteller", ziel: "stein", feld: "bezeichnung_hersteller", get: (_p, s) => s?.bezeichnung_hersteller ?? "", lesen: txt },
  { kopf: "artikelnr_hersteller", label: "Artikelnr. Hersteller", ziel: "stein", feld: "artikelnr_hersteller", get: (_p, s) => s?.artikelnr_hersteller ?? "", lesen: txt },
  { kopf: "kurztext", label: "Kurztext", ziel: "produkt", feld: "kurztext", get: (p) => p.kurztext, lesen: txt },
  { kopf: "beschreibung", label: "Beschreibung", ziel: "produkt", feld: "beschreibung", get: (p) => p.beschreibung, lesen: txt },
  { kopf: "woo_id", label: "WooCommerce-ID", ziel: "info", get: (p) => p.woo_id ?? "" },
  { kopf: "bilder", label: "Bilder", ziel: "info", get: (p) => p.bilder.length },
  { kopf: "vollstaendigkeit", label: "Vollständigkeit %", ziel: "info", get: () => "" },
  { kopf: "erp_id", label: "ERP-ID", ziel: "info", get: (p) => p.id },
];

/** Export der übergebenen Produkte. Nur-Info-Spalten werden beim Import ignoriert. */
export function produkteCsv(d: Daten, produkte: Produkt[]): string {
  const steine = new Map(d.steine.map((s) => [s.id, s]));
  const idx = { steine, bilder: new Map(d.bilder.map((b) => [b.id, b])) };
  return csvText(SPALTEN.map((s) => s.kopf), produkte.map((p) => {
    const s = p.stein_id ? steine.get(p.stein_id) : undefined;
    return SPALTEN.map((c) => (c.kopf === "vollstaendigkeit" ? bewerte(p, d, idx).score : c.get(p, s, d)));
  }));
}

export interface FeldAenderung { spalte: string; label: string; alt: unknown; neu: unknown; ziel: Ziel }
export interface ImportZeile {
  nr: number; sku: string; produkt_id: number | null; aktion: "neu" | "aendern" | "gleich" | "fehler";
  fehler: string[]; aenderungen: FeldAenderung[]; hinweis?: string; gueltig_ab?: string;
  neu?: { art: ProduktArt; hbr_code: string };
}
export interface ImportPlan { zeilen: ImportZeile[]; unbekannteSpalten: string[]; fehlt: string[]; gueltig_ab: string }

const SKU_RE = /^HBR [0-9]{2}-[0-9]{3}( R)?$/;
const gleich = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Liest eine CSV und berechnet, was sich ändern würde. Schreibt nichts. */
export function produktImportPlanen(d: Daten, text: string, optionen: { neueAnlegen: boolean } = { neueAnlegen: true }): ImportPlan {
  const roh = csvLesen(text);
  if (roh.length < 2) return { zeilen: [], unbekannteSpalten: [], fehlt: ["Die Datei enthält keine Datenzeilen."], gueltig_ab: heute() };
  const kopf = roh[0].map((k) => k.trim().toLowerCase());
  const bekannt = new Map(SPALTEN.flatMap((s) => [[s.kopf, s], [s.label.toLowerCase(), s]] as const));
  const spalten = kopf.map((k) => bekannt.get(k));
  const unbekannteSpalten = roh[0].filter((_, i) => !spalten[i]);
  const skuI = spalten.findIndex((s) => s?.kopf === "sku");
  const idI = spalten.findIndex((s) => s?.kopf === "erp_id");
  const artI = spalten.findIndex((s) => s?.kopf === "art");
  const abI = spalten.findIndex((s) => s?.kopf === "preis_gueltig_ab");
  if (skuI < 0 && idI < 0) return { zeilen: [], unbekannteSpalten, fehlt: ["Spalte „sku“ (Artikelnummer) oder „erp_id“ fehlt."], gueltig_ab: heute() };

  const nachSku = new Map(d.produkte.filter((p) => p.sku).map((p) => [p.sku!, p]));
  const nachId = new Map(d.produkte.map((p) => [p.id, p]));
  const steine = new Map(d.steine.map((s) => [s.id, s]));
  const steinNachCode = new Map(d.steine.map((s) => [s.hbr_code, s]));
  const steinWerte = new Map<string, { wert: unknown; nr: number }>(); // Konflikte zwischen Zeilen desselben Steins
  const gesehen = new Map<string, number>();
  const zeilen: ImportZeile[] = [];

  for (let r = 1; r < roh.length; r++) {
    const z = roh[r];
    const nr = r + 1;
    const sku = (skuI >= 0 ? z[skuI] ?? "" : "").trim().replace(/\s+/g, " ");
    const zeile: ImportZeile = { nr, sku, produkt_id: null, aktion: "gleich", fehler: [], aenderungen: [] };
    zeilen.push(zeile);
    const idText = idI >= 0 ? (z[idI] ?? "").trim() : "";
    let p = idText ? nachId.get(Number(idText)) : undefined;
    if (idText && !p) { zeile.fehler.push(`ERP-ID ${idText} nicht gefunden`); }
    if (!p && sku) p = nachSku.get(sku);
    if (p && sku && p.sku && p.sku !== sku) zeile.fehler.push(`ERP-ID ${p.id} gehört zu ${p.sku}, nicht zu ${sku}`);
    const schluessel = p ? `id:${p.id}` : `sku:${sku}`;
    if (gesehen.has(schluessel)) zeile.fehler.push(`Doppelt in der Datei (auch Zeile ${gesehen.get(schluessel)})`);
    gesehen.set(schluessel, nr);

    let stein: Stein | undefined;
    if (p) {
      zeile.produkt_id = p.id;
      stein = p.stein_id ? steine.get(p.stein_id) : undefined;
    } else {
      if (!sku) { zeile.fehler.push("Keine Artikelnummer"); }
      else if (!SKU_RE.test(sku)) zeile.fehler.push(`Artikelnummer „${sku}“ hat nicht das Format „HBR 12-345“ bzw. „HBR 12-345 R“`);
      else if (!optionen.neueAnlegen) zeile.fehler.push("Unbekannte Artikelnummer – neue Produkte anlegen ist ausgeschaltet");
      else {
        const artText = artI >= 0 ? (z[artI] ?? "").trim().toLowerCase() : "";
        const art: ProduktArt = sku.endsWith(" R") ? "riemchen" : artText.startsWith("dämm") || artText.startsWith("daemm") ? "daemmklinker" : "verblender";
        if (art === "riemchen" && artText && !artText.startsWith("riemchen")) zeile.fehler.push("Artikelnummer endet auf „R“, Art ist aber nicht Riemchen");
        zeile.neu = { art, hbr_code: sku.replace(/ R$/, "") };
        stein = steinNachCode.get(zeile.neu.hbr_code);
        zeile.hinweis = stein ? `Neues ${ART[art]} zum vorhandenen Stein ${stein.hbr_code}` : `Neuer Stein ${zeile.neu.hbr_code} und neues ${ART[art]}`;
      }
    }
    const datum = abI >= 0 && (z[abI] ?? "").trim() ? (z[abI] ?? "").trim() : heute();
    const datumIso = /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(datum) ? datum.split(".").reverse().map((x) => x.padStart(2, "0")).join("-") : datum;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datumIso)) zeile.fehler.push(`Preisdatum „${datum}“ ungültig (TT.MM.JJJJ)`);

    for (let i = 0; i < spalten.length; i++) {
      const sp = spalten[i];
      if (!sp || !sp.lesen) continue;
      const t = (z[i] ?? "").trim();
      if (!t) continue; // leer = unverändert
      let neu: unknown;
      if (t === LEEREN) {
        if (sp.kopf === "name") { zeile.fehler.push("Name kann nicht geleert werden"); continue; }
        if (sp.ziel === "preis") { zeile.fehler.push("Preise können nicht geleert werden – neuen Preis eintragen"); continue; }
        if (sp.kopf === "status") { zeile.fehler.push("Status kann nicht geleert werden"); continue; }
        neu = ["farben", "formate", "oberflaechen"].includes(sp.feld!) ? []
          : ["kurztext", "beschreibung", "bezeichnung_hersteller", "artikelnr_hersteller"].includes(sp.feld!) ? "" : null;
      } else {
        const l = sp.lesen(t, d);
        if ("fehler" in l) { zeile.fehler.push(`${sp.label}: ${l.fehler}`); continue; }
        neu = l.wert;
      }
      if (sp.kopf === "riemchen_staerke_mm" || sp.kopf === "eckriemchen") {
        const art = p?.art ?? zeile.neu?.art;
        if (art !== "riemchen" && neu !== null) { zeile.fehler.push(`${sp.label} gilt nur für Riemchen`); continue; }
      }
      let alt: unknown;
      if (sp.ziel === "preis") {
        const ap = p ? aktuellerPreis(p, sp.feld as "ek" | "vk", "m2", datumIso) : null;
        alt = ap?.betrag ?? null;
      } else if (sp.ziel === "stein") alt = stein ? (stein as any)[sp.feld!] : null;
      else alt = p ? (p as any)[sp.feld!] : null;
      if (gleich(alt, neu)) continue;
      if (sp.ziel === "stein") {
        const k = `${stein?.id ?? zeile.neu?.hbr_code}:${sp.feld}`;
        const vorher = steinWerte.get(k);
        if (vorher && !gleich(vorher.wert, neu)) { zeile.fehler.push(`${sp.label} widerspricht Zeile ${vorher.nr} (gleicher Stein, Verblender und Riemchen teilen diese Werte)`); continue; }
        steinWerte.set(k, { wert: neu, nr });
      }
      zeile.aenderungen.push({ spalte: sp.kopf, label: sp.label, alt, neu, ziel: sp.ziel });
    }
    zeile.gueltig_ab = datumIso;
    zeile.aktion = zeile.fehler.length ? "fehler" : zeile.neu ? "neu" : zeile.aenderungen.length ? "aendern" : "gleich";
  }
  return { zeilen, unbekannteSpalten, fehlt: [], gueltig_ab: heute() };
}

/** Übernimmt alle fehlerfreien Zeilen eines Plans. Gibt die Anzahl geänderter bzw. neuer Produkte zurück. */
export function produktImportAusfuehren(d: Daten, plan: ImportPlan, von: string, jetzt = new Date().toISOString()): { geaendert: number; neu: number } {
  let geaendert = 0, neu = 0;
  for (const z of plan.zeilen) {
    if (z.aktion !== "aendern" && z.aktion !== "neu") continue;
    let p: Produkt | undefined = z.produkt_id ? d.produkte.find((x) => x.id === z.produkt_id) : undefined;
    if (!p && z.neu) {
      let s = d.steine.find((x) => x.hbr_code === z.neu!.hbr_code);
      if (!s) s = lege_an(d, "steine", steinLeer(neueId(), z.neu.hbr_code, jetzt, von), von, jetzt);
      const praefix = z.neu.hbr_code.slice(4, 6);
      const h = d.hersteller.find((x) => x.hbr_praefix === praefix);
      if (h && !s.hersteller_id) aendere(d, "steine", s.id, { hersteller_id: h.id, hersteller_quelle: "praefix" } as any, von, undefined, jetzt);
      p = lege_an(d, "produkte", {
        id: neueId(), version: 1, erstellt_am: jetzt, geaendert_am: jetzt, geaendert_von: von,
        stein_id: s.id, art: z.neu.art, sku: skuFuer(z.neu.hbr_code, z.neu.art), name: produktName(z.neu.hbr_code, z.neu.art, s.herstellungsart),
        hersteller_id: s.hersteller_id, woo_id: null, woo_slug: "", status: "entwurf", formate: [], bilder: [],
        riemchen_staerke_mm: null, eckriemchen: null, kurztext: "", beschreibung: "", kurztext_shop_alt: "", preise: [], zuletzt_exportiert_version: null,
      } satisfies Produkt, von, jetzt);
      neu++;
    } else geaendert++;
    if (!p) continue;
    const pp = p;
    const prod: Record<string, unknown> = {}, st: Record<string, unknown> = {};
    const preise: Preis[] = [];
    for (const a of z.aenderungen) {
      const sp = SPALTEN.find((s) => s.kopf === a.spalte)!;
      if (a.ziel === "produkt") prod[sp.feld!] = a.neu;
      else if (a.ziel === "stein") st[sp.feld!] = a.neu;
      else if (a.ziel === "preis") preise.push({ id: neueId(), preisart: sp.feld as "ek" | "vk", betrag: a.neu as number, einheit: "m2", gueltig_ab: z.gueltig_ab ?? heute(), quelle: "manuell", erfasst_von: von, erfasst_am: jetzt });
    }
    if (st.hersteller_id !== undefined) { st.hersteller_quelle = "manuell"; prod.hersteller_id = st.hersteller_id; }
    if (preise.length) prod.preise = [...pp.preise, ...preise];
    if (Object.keys(prod).length) aendere(d, "produkte", pp.id, prod as Partial<Produkt>, von, undefined, jetzt);
    if (Object.keys(st).length && pp.stein_id) {
      aendere(d, "steine", pp.stein_id, st as Partial<Stein>, von, undefined, jetzt);
      if (st.hersteller_id !== undefined) // Hersteller am Geschwisterprodukt mitziehen
        for (const g of d.produkte) if (g.stein_id === pp.stein_id && g.id !== pp.id) aendere(d, "produkte", g.id, { hersteller_id: st.hersteller_id } as Partial<Produkt>, von, undefined, jetzt);
    }
  }
  return { geaendert, neu };
}

export function wertText(v: unknown, d: Daten, spalte: string): string {
  if (v === null || v === undefined || v === "") return "–";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "–";
  if (spalte === "hersteller") return d.hersteller.find((h) => h.id === v)?.name ?? String(v);
  if (spalte === "herstellungsart") return HERSTELLUNG[v as keyof typeof HERSTELLUNG] ?? String(v);
  if (spalte === "status") return STATUS[v as keyof typeof STATUS] ?? String(v);
  if (typeof v === "boolean") return v ? "ja" : "nein";
  if (typeof v === "number") return zahlText(v);
  const s = String(v);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}
