// Datenmodell der Browser-Version. Entspricht den Tabellen in db/migrations/0001_grundschema.sql,
// damit Sicherungen später ohne Umbau in die Server-Version übernommen werden können.
import { planen, FORMATE, type Bestand, type Plan } from "../../src/import/bestand.ts";

export const FORMAT_KENNUNG = "klinkerhandel-erp";
export const SCHEMA_VERSION = 1;

export type Herstellungsart = "handform" | "strangpress" | "wasserstrich";
export type ProduktArt = "verblender" | "riemchen" | "daemmklinker" | "nistklinker";
export type ProduktStatus = "entwurf" | "pruefung" | "freigegeben" | "archiviert";

export interface Basis { id: number; version: number; erstellt_am: string; geaendert_am: string; geaendert_von: string }

export interface Hersteller { id: number; name: string; hbr_praefix: string | null; woo_kategorie_id: number | null; geaendert_am?: string }
export interface Farbe { schluessel: string; woo_kategorie_id: number | null }
export interface Format { kuerzel: string; name: string; mm: [number, number, number] | null; woo_kategorie_id: number | null }

export interface DatenblattRef { dateiname: string; sha256: string; geprueft_am: string; geprueft_von: string; felder: string[] }

export interface Stein extends Basis {
  hbr_code: string;
  hersteller_id: number | null;
  hersteller_quelle: "shop" | "praefix" | "manuell" | "datenblatt" | null;
  herstellungsart: Herstellungsart | null;
  farben: string[];
  bezeichnung_hersteller: string; artikelnr_hersteller: string;
  oberflaechen: string[];
  laenge_mm: number | null; breite_mm: number | null; hoehe_mm: number | null;
  gewicht_kg: number | null; druckfestigkeit_nmm2: number | null; wasseraufnahme_proz: number | null;
  frostwiderstand: "F0" | "F1" | "F2" | null; bedarf_stk_m2: number | null;
  herstellertext: string; notiz: string;
  status: "aktiv" | "auslauf" | "archiviert";
  datenblaetter: DatenblattRef[];
}

export interface Preis {
  id: number; preisart: "ek" | "vk"; betrag: number; einheit: "m2" | "stk" | "pal";
  gueltig_ab: string; quelle: "lieferant" | "manuell"; erfasst_von: string; erfasst_am: string;
}

export interface Produkt extends Basis {
  stein_id: number | null; art: ProduktArt; sku: string | null; name: string;
  hersteller_id: number | null; woo_id: number | null; woo_slug: string;
  status: ProduktStatus; formate: string[]; bilder: number[];
  riemchen_staerke_mm: number | null; eckriemchen: boolean | null;
  kurztext: string; beschreibung: string; kurztext_shop_alt: string;
  preise: Preis[];
  zuletzt_exportiert_version: number | null;
  zuletzt_exportiert_am?: string;
}

export interface Bild { id: number; woo_media_id: number | null; datei: string; breite_px: number; alt: string; geaendert_am?: string }

export interface Referenz extends Basis {
  woo_id: number | null; woo_slug: string; name: string; objektart: string | null;
  rubriken: string[]; stein_id: number | null; hbr_code_shop: string | null; bilder: number[];
  status: "entwurf" | "freigegeben" | "archiviert";
}

export interface Hinweis {
  id: number; objekt: "produkt" | "referenz" | "stein" | "bild"; woo_id: number | null; hbr_code: string | null;
  regel: string; schwere: "pflicht" | "empfohlen" | "info"; text: string;
  status: "offen" | "erledigt" | "ignoriert"; erledigt_von: string | null; erledigt_am: string | null;
}

export type KontaktTyp = "hersteller" | "lieferant" | "kunde" | "partner";
export interface Kontakt extends Basis {
  typ: KontaktTyp; firma: string; anrede: string; vorname: string; nachname: string; funktion: string;
  email: string; telefon: string; mobil: string; strasse: string; plz: string; ort: string; land: string;
  hersteller_id: number | null; kundentyp: "" | "privat" | "bauunternehmen" | "architekt" | "haendler" | "sonstige";
  notiz: string;
  aktivitaeten?: { zeit: string; von: string; text: string }[];
}

export type VorgangStatus = "neu" | "in_bearbeitung" | "angebot_erstellt" | "gesendet" | "angenommen" | "abgelehnt" | "archiviert";
export interface Position {
  produkt_id: number | null; sku: string; bezeichnung: string;
  flaeche_m2: number; verschnitt_proz: number; bedarf_stk_m2: number | null;
  menge_m2: number; menge_stk: number | null; ep_netto_m2: number; rabatt_proz: number;
}
export interface Vorgang extends Basis {
  nummer: string; kontakt_id: number | null; status: VorgangStatus; datum: string;
  quelle: "telefon" | "email" | "website" | "vor_ort" | "sonstige";
  lieferort_plz: string; lieferort_ort: string; wunschtermin: string; betreff: string;
  positionen: Position[]; fracht_netto: number; notiz: string; angebot_am: string | null;
}

export interface Aenderung { zeit: string; von: string; tabelle: string; id: number | string; aktion: "anlegen" | "aendern" | "loeschen"; felder: Record<string, [unknown, unknown]> | null; text?: string }

export interface Einstellungen {
  firma: { name: string; strasse: string; plz: string; ort: string; telefon: string; email: string; web: string; ust_id: string };
  angebot: { mwst_proz: number; verschnitt_proz: number; gueltig_tage: number; nummer_praefix: string; fusstext: string };
  bearbeiter: string[];
}

export interface Daten {
  format: typeof FORMAT_KENNUNG; schema: number; erstellt_am: string; gespeichert_am: string;
  shop_stand: string | null;
  hersteller: Hersteller[]; farben: Farbe[]; formate: Format[];
  steine: Stein[]; produkte: Produkt[]; bilder: Bild[]; referenzen: Referenz[];
  hinweise: Hinweis[]; kontakte: Kontakt[]; vorgaenge: Vorgang[];
  aenderungen: Aenderung[];
  geloescht: { tabelle: string; id: number; zeit: string; von: string }[];
  einstellungen: Einstellungen;
  zaehler: Record<string, number>;
}

export const TABELLEN_MIT_ID = ["steine", "produkte", "bilder", "referenzen", "hinweise", "kontakte", "vorgaenge", "hersteller"] as const;
export type Tabelle = (typeof TABELLEN_MIT_ID)[number];

export const HERSTELLUNG: Record<Herstellungsart, string> = { handform: "Handform", strangpress: "Strangpress", wasserstrich: "Wasserstrich" };
export const ART: Record<ProduktArt, string> = { verblender: "Verblender", riemchen: "Riemchen", daemmklinker: "Dämmklinker", nistklinker: "Nistklinker" };
export const STATUS: Record<ProduktStatus, string> = { entwurf: "Entwurf", pruefung: "Zur Prüfung", freigegeben: "Freigegeben", archiviert: "Archiviert" };
export const VORGANG_STATUS: Record<VorgangStatus, string> = {
  neu: "Neu", in_bearbeitung: "In Bearbeitung", angebot_erstellt: "Angebot erstellt", gesendet: "Gesendet",
  angenommen: "Angenommen", abgelehnt: "Abgelehnt", archiviert: "Archiviert",
};
/** Erlaubte Statuswechsel bei Vorgängen. */
export const VORGANG_UEBERGANG: Record<VorgangStatus, VorgangStatus[]> = {
  neu: ["in_bearbeitung", "angebot_erstellt", "archiviert"],
  in_bearbeitung: ["angebot_erstellt", "archiviert"],
  angebot_erstellt: ["in_bearbeitung", "gesendet", "archiviert"],
  gesendet: ["angenommen", "abgelehnt", "in_bearbeitung", "archiviert"],
  angenommen: ["archiviert"],
  abgelehnt: ["in_bearbeitung", "archiviert"],
  archiviert: [],
};
export const OBERFLAECHEN = ["glatt", "besandet", "genarbt", "gerumpelt", "geschnitten", "geflammt"];
export const FARBWERT: Record<string, string> = {
  rot: "#a8402e", rotbunt: "linear-gradient(90deg,#8f3424,#c4693c 50%,#7a2f22)", braun: "#6e4632", bordeaux: "#6b2230",
  orange: "#c4692f", gelb: "#d4b05a", beige: "#cbb08c", creme: "#e4d9bf", "creme carbon": "linear-gradient(90deg,#e4d9bf 60%,#3b3a38 60%)",
  "weiß": "#ecebe6", "weiß carbon": "linear-gradient(90deg,#ecebe6 60%,#3b3a38 60%)", grau: "#8d8e8a", blau: "#4b5866",
  schwarz: "#2a2826", violett: "#5b4256", rose: "#c98f86",
  nuanciert: "conic-gradient(#a8402e,#cbb08c,#8d8e8a,#6e4632,#a8402e)",
};

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  firma: { name: "Klinkerhandel Harbecke Rhede", strasse: "", plz: "", ort: "Rhede", telefon: "", email: "", web: "klinkerhandel.de", ust_id: "" },
  angebot: { mwst_proz: 19, verschnitt_proz: 5, gueltig_tage: 30, nummer_praefix: "AN", fusstext: "Alle Preise netto zzgl. gesetzlicher MwSt. Lieferzeit nach Verfügbarkeit beim Werk." },
  bearbeiter: ["Klaus", "Tobi", "Sven", "Assistenz", "Christian"],
};

const leer = { bezeichnung_hersteller: "", artikelnr_hersteller: "", oberflaechen: [] as string[], laenge_mm: null, breite_mm: null, hoehe_mm: null,
  gewicht_kg: null, druckfestigkeit_nmm2: null, wasseraufnahme_proz: null, frostwiderstand: null, bedarf_stk_m2: null,
  herstellertext: "", notiz: "", status: "aktiv" as const, datenblaetter: [] as DatenblattRef[] };

/** Erstbefüllung aus einer Shop-Bestandsdatei. */
export function datenAusBestand(bestand: Bestand, jetzt = new Date().toISOString(), von = "Übernahme"): Daten {
  return datenAusPlan(planen(bestand), jetzt, von);
}

export function datenAusPlan(plan: Plan, jetzt: string, von: string): Daten {
  const basis = (id: number): Basis => ({ id, version: 1, erstellt_am: jetzt, geaendert_am: jetzt, geaendert_von: von });
  const hersteller: Hersteller[] = plan.hersteller.map((h, i) => ({ id: i + 1, name: h.name, hbr_praefix: h.hbr_praefix, woo_kategorie_id: h.woo_kategorie_id }));
  const hId = new Map(hersteller.map((h) => [h.name, h.id]));
  const bilder: Bild[] = plan.bilder.map((b, i) => ({ id: i + 1, woo_media_id: b.woo_media_id, datei: b.datei, breite_px: b.breite_px, alt: b.alt ?? "" }));
  const bId = new Map(bilder.map((b) => [b.woo_media_id, b.id]));
  const steine: Stein[] = plan.steine.map((s, i) => ({
    ...basis(i + 1), ...leer, oberflaechen: [], datenblaetter: [],
    hbr_code: s.hbr_code, hersteller_id: s.hersteller ? hId.get(s.hersteller) ?? null : null,
    hersteller_quelle: s.hersteller_quelle, herstellungsart: s.herstellungsart, farben: [...s.farben],
  }));
  const sId = new Map(steine.map((s) => [s.hbr_code, s.id]));
  const produkte: Produkt[] = plan.produkte.map((p, i) => ({
    ...basis(i + 1), stein_id: p.stein ? sId.get(p.stein) ?? null : null, art: p.art, sku: p.sku, name: p.name,
    hersteller_id: p.hersteller ? hId.get(p.hersteller) ?? null : null, woo_id: p.woo_id, woo_slug: p.woo_slug,
    status: p.sku ? "freigegeben" : "entwurf", formate: [...p.formate], bilder: p.bilder.map((b) => bId.get(b.woo_media_id)!),
    riemchen_staerke_mm: null, eckriemchen: null, kurztext: "", beschreibung: "", kurztext_shop_alt: p.kurztext_shop_alt,
    preise: [], zuletzt_exportiert_version: 1,
  }));
  const referenzen: Referenz[] = plan.referenzen.map((r, i) => ({
    ...basis(i + 1), woo_id: r.woo_id, woo_slug: r.woo_slug, name: r.name, objektart: r.objektart, rubriken: [...r.rubriken],
    stein_id: r.stein ? sId.get(r.stein) ?? null : null, hbr_code_shop: r.hbr_code_shop, bilder: r.bilder.map((b) => bId.get(b.woo_media_id)!),
    status: "freigegeben",
  }));
  // Nur Hinweise übernehmen, die sich nicht aus den Daten selbst laufend neu prüfen lassen (siehe pruefung.ts).
  const LIVE = new Set(["hersteller_fehlt", "herstellungsart_fehlt", "farbe_fehlt", "format_fehlt", "bild_fehlt", "bilder_wenige",
    "alt_fehlt", "beschreibung_fehlt", "hersteller_aus_praefix", "herstellungsart_aus_name"]);
  const hinweise: Hinweis[] = plan.befunde.filter((b) => !LIVE.has(b.regel)).map((b, i) => ({
    id: i + 1, ...b, status: "offen", erledigt_von: null, erledigt_am: null,
  }));
  const kontakte: Kontakt[] = [
    ...hersteller.map((h, i) => kontaktLeer(i + 1, "hersteller", h.name, jetzt, von, h.id)),
    kontaktLeer(hersteller.length + 1, "lieferant", "Baustoffzentrum Harbecke", jetzt, von, null),
  ];
  return {
    format: FORMAT_KENNUNG, schema: SCHEMA_VERSION, erstellt_am: jetzt, gespeichert_am: jetzt, shop_stand: plan.stand,
    hersteller, farben: plan.farben.map((f) => ({ ...f })), formate: FORMATE.map((f) => ({ ...f, woo_kategorie_id: plan.formate.find((x) => x.kuerzel === f.kuerzel)?.woo_kategorie_id ?? null })),
    steine, produkte, bilder, referenzen, hinweise, kontakte, vorgaenge: [],
    aenderungen: [{ zeit: jetzt, von, tabelle: "system", id: 0, aktion: "anlegen", felder: null, text: `Erstübernahme aus Shop-Stand ${plan.stand ?? "unbekannt"}` }],
    geloescht: [],
    einstellungen: structuredClone(STANDARD_EINSTELLUNGEN),
    zaehler: {
      steine: steine.length, produkte: produkte.length, bilder: bilder.length, referenzen: referenzen.length,
      hinweise: hinweise.length, kontakte: kontakte.length, vorgaenge: 0, hersteller: hersteller.length, preise: 0, angebotsnummer: 0,
    },
  };
}

export function kontaktLeer(id: number, typ: KontaktTyp, firma: string, jetzt: string, von: string, hersteller_id: number | null = null): Kontakt {
  return { id, version: 1, erstellt_am: jetzt, geaendert_am: jetzt, geaendert_von: von, typ, firma, anrede: "", vorname: "", nachname: "",
    funktion: "", email: "", telefon: "", mobil: "", strasse: "", plz: "", ort: "", land: "Deutschland", hersteller_id, kundentyp: "", notiz: "" };
}

export function steinLeer(id: number, hbr_code: string, jetzt: string, von: string): Stein {
  return { id, version: 1, erstellt_am: jetzt, geaendert_am: jetzt, geaendert_von: von, ...leer, oberflaechen: [], datenblaetter: [],
    hbr_code, hersteller_id: null, hersteller_quelle: null, herstellungsart: null, farben: [] };
}

/** Aktueller Preis einer Art und Einheit zum Stichtag (jüngstes gueltig_ab ≤ Stichtag). */
export function aktuellerPreis(p: Produkt, preisart: "ek" | "vk", einheit: "m2" | "stk" | "pal" = "m2", stichtag = heute()): Preis | null {
  let best: Preis | null = null;
  for (const x of p.preise)
    if (x.preisart === preisart && x.einheit === einheit && x.gueltig_ab <= stichtag && (!best || x.gueltig_ab > best.gueltig_ab)) best = x;
  return best;
}
export function heute(d = new Date()): string {
  const z = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
  return z; // YYYY-MM-DD in deutscher Zeit
}

export const HBR = /^HBR [0-9]{2}-[0-9]{3}$/;
export function skuFuer(code: string, art: ProduktArt): string { return art === "riemchen" ? `${code} R` : code; }
export function produktName(code: string, art: ProduktArt, h: Herstellungsart | null): string {
  const a = h ? HERSTELLUNG[h] : "";
  if (art === "riemchen") return `Riemchen / Verblender – ${code} R – ${a} Klinkerriemchen`.replace("–  K", "– K");
  if (art === "daemmklinker") return `Dämmklinker – ${code} – ${a}`.trim();
  return `Klinker / Verblender – ${code} – ${a} Klinkerstein`.replace("–  K", "– K");
}
/** Nächste freie HBR-Nummer für ein Präfix. */
export function naechsterCode(d: Daten, praefix: string): string {
  let max = 99;
  for (const s of d.steine) if (s.hbr_code.slice(4, 6) === praefix) max = Math.max(max, Number(s.hbr_code.slice(7)));
  for (const p of d.produkte) { const m = p.name.match(/HBR (\d{2})-(\d{3})/); if (m && m[1] === praefix) max = Math.max(max, Number(m[2])); }
  return `HBR ${praefix}-${String(max + 1).padStart(3, "0")}`;
}
