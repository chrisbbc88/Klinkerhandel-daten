// Kontakte als CSV (z. B. Kundenliste aus Outlook oder Excel übernehmen).
import { csvText, csvLesen, LEEREN } from "./csv.ts";
import { kontaktLeer, type Daten, type Kontakt, type KontaktTyp } from "./modell.ts";
import { aendere, lege_an, neueId } from "./aendern.ts";

const FELDER = ["typ", "firma", "anrede", "vorname", "nachname", "funktion", "email", "telefon", "mobil", "strasse", "plz", "ort", "land", "kundentyp", "notiz"] as const;
type Feld = (typeof FELDER)[number];
const TYPEN: Record<string, KontaktTyp> = { hersteller: "hersteller", lieferant: "lieferant", kunde: "kunde", partner: "partner" };
const KUNDENTYP = ["", "privat", "bauunternehmen", "architekt", "haendler", "sonstige"];
const ALIAS: Record<string, Feld> = { "e-mail": "email", mail: "email", unternehmen: "firma", name: "nachname", "straße": "strasse", postleitzahl: "plz", stadt: "ort", telefonnummer: "telefon", handy: "mobil", bemerkung: "notiz" };

export function kontakteCsv(liste: Kontakt[]): string {
  return csvText([...FELDER, "erp_id"], liste.map((k) => [...FELDER.map((f) => k[f]), k.id]));
}

export interface KontaktZeile { nr: number; aktion: "neu" | "aendern" | "gleich" | "fehler"; kontakt_id: number | null; name: string; fehler: string[]; felder: Partial<Record<Feld, string>> }

export function kontaktImportPlanen(d: Daten, text: string, standardTyp: KontaktTyp): { zeilen: KontaktZeile[]; fehlt: string[] } {
  const roh = csvLesen(text);
  if (roh.length < 2) return { zeilen: [], fehlt: ["Die Datei enthält keine Datenzeilen."] };
  const kopf = roh[0].map((k) => { const t = k.trim().toLowerCase(); return (FELDER as readonly string[]).includes(t) ? (t as Feld) : t === "erp_id" ? "erp_id" : ALIAS[t] ?? null; });
  if (!kopf.includes("firma") && !kopf.includes("nachname") && !kopf.includes("email")) return { zeilen: [], fehlt: ["Es fehlt mindestens eine der Spalten firma, nachname oder email."] };
  const schl = (firma: string, email: string, nachname: string) => `${firma.trim().toLowerCase()}|${(email || nachname).trim().toLowerCase()}`;
  const vorhanden = new Map(d.kontakte.map((k) => [schl(k.firma, k.email, k.nachname), k]));
  const zeilen: KontaktZeile[] = [];
  for (let r = 1; r < roh.length; r++) {
    const werte: Partial<Record<Feld, string>> = {};
    let erpId = "";
    kopf.forEach((k, i) => { const v = (roh[r][i] ?? "").trim(); if (!k || !v) return; if (k === "erp_id") erpId = v; else werte[k] = v; });
    const z: KontaktZeile = { nr: r + 1, aktion: "gleich", kontakt_id: null, name: werte.firma || [werte.vorname, werte.nachname].filter(Boolean).join(" ") || werte.email || "", fehler: [], felder: {} };
    zeilen.push(z);
    if (werte.typ && !TYPEN[werte.typ.toLowerCase()]) z.fehler.push(`Typ „${werte.typ}“ unbekannt (hersteller, lieferant, kunde, partner)`);
    if (werte.kundentyp && !KUNDENTYP.includes(werte.kundentyp.toLowerCase())) z.fehler.push(`Kundentyp „${werte.kundentyp}“ unbekannt`);
    if (werte.email && werte.email !== LEEREN && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(werte.email)) z.fehler.push(`E-Mail „${werte.email}“ ungültig`);
    if (!z.name) z.fehler.push("Weder Firma noch Name noch E-Mail");
    const k = erpId ? d.kontakte.find((x) => String(x.id) === erpId) : vorhanden.get(schl(werte.firma ?? "", werte.email ?? "", werte.nachname ?? ""));
    if (erpId && !k) z.fehler.push(`ERP-ID ${erpId} nicht gefunden`);
    for (const [f, v] of Object.entries(werte) as [Feld, string][]) {
      const neu = v === LEEREN ? "" : f === "typ" ? TYPEN[v.toLowerCase()] ?? v : f === "kundentyp" ? v.toLowerCase() : v;
      if (!k || k[f] !== neu) z.felder[f] = neu;
    }
    if (k) z.kontakt_id = k.id;
    if (!werte.typ && !k) z.felder.typ = standardTyp;
    z.aktion = z.fehler.length ? "fehler" : !k ? "neu" : Object.keys(z.felder).length ? "aendern" : "gleich";
  }
  return { zeilen, fehlt: [] };
}

export function kontaktImportAusfuehren(d: Daten, zeilen: KontaktZeile[], von: string, jetzt = new Date().toISOString()): number {
  let n = 0;
  for (const z of zeilen) {
    if (z.aktion === "neu") {
      const k = kontaktLeer(neueId(), (z.felder.typ as KontaktTyp) ?? "kunde", "", jetzt, von);
      Object.assign(k, z.felder);
      lege_an(d, "kontakte", k, von, jetzt); n++;
    } else if (z.aktion === "aendern" && z.kontakt_id) { aendere(d, "kontakte", z.kontakt_id, z.felder as Partial<Kontakt>, von, undefined, jetzt); n++; }
  }
  return n;
}
