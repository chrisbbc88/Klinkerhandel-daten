// Aus den Daten berechnete Verzeichnisse und Kennzahlen, je Datenstand einmal berechnet.
import { z } from "./store.ts";
import { bewerte, type ProduktBewertung } from "../lib/pruefung.ts";
import { exportKandidaten } from "../lib/woo.ts";
import type { Bild, Hersteller, Kontakt, Produkt, Stein } from "../lib/modell.ts";

export interface Abgeleitet {
  rev: number; daten: unknown;
  steine: Map<number, Stein>; bilder: Map<number, Bild>; hersteller: Map<number, Hersteller>; produkte: Map<number, Produkt>; kontakte: Map<number, Kontakt>;
  bewertung: Map<number, ProduktBewertung>;
  geschwister: Map<number, Produkt[]>; // stein_id → Produkte
  hinweiseOffen: number; exportOffen: number; vorgaengeOffen: number;
}
let cache: Abgeleitet | null = null;

export function ab(): Abgeleitet {
  if (cache && cache.rev === z.rev && cache.daten === z.daten) return cache;
  const d = z.daten;
  const steine = new Map(d.steine.map((s) => [s.id, s]));
  const bilder = new Map(d.bilder.map((b) => [b.id, b]));
  const bewertung = new Map<number, ProduktBewertung>();
  const geschwister = new Map<number, Produkt[]>();
  for (const p of d.produkte) {
    bewertung.set(p.id, bewerte(p, d, { steine, bilder }));
    if (p.stein_id) { const l = geschwister.get(p.stein_id) ?? []; l.push(p); geschwister.set(p.stein_id, l); }
  }
  cache = {
    rev: z.rev, daten: z.daten, steine, bilder, bewertung, geschwister,
    hersteller: new Map(d.hersteller.map((h) => [h.id, h])),
    produkte: new Map(d.produkte.map((p) => [p.id, p])),
    kontakte: new Map(d.kontakte.map((k) => [k.id, k])),
    hinweiseOffen: d.hinweise.filter((h) => h.status === "offen" && h.schwere !== "info").length,
    exportOffen: exportKandidaten(d).offen.length,
    vorgaengeOffen: d.vorgaenge.filter((v) => !["angenommen", "abgelehnt", "archiviert"].includes(v.status)).length,
  };
  return cache;
}

export const steinVon = (p: Produkt) => (p.stein_id ? ab().steine.get(p.stein_id) : undefined);
export const herstellerName = (id: number | null | undefined) => (id ? ab().hersteller.get(id)?.name ?? "" : "");
export const kontaktName = (k: Kontakt | undefined) => (k ? k.firma || [k.vorname, k.nachname].filter(Boolean).join(" ") || k.email || "(ohne Namen)" : "–");

const TABELLE_LABEL: Record<string, string> = { produkte: "Produkt", steine: "Stein", kontakte: "Kontakt", vorgaenge: "Vorgang", bilder: "Bild", referenzen: "Referenz", hinweise: "Hinweis", hersteller: "Hersteller", system: "System", einstellungen: "Einstellungen" };
const FELD_LABEL: Record<string, string> = {
  hersteller_id: "Hersteller", herstellungsart: "Herstellungsart", farben: "Farben", formate: "Formate", oberflaechen: "Oberflächen", laenge_mm: "Länge", breite_mm: "Breite", hoehe_mm: "Höhe",
  gewicht_kg: "Gewicht", druckfestigkeit_nmm2: "Druckfestigkeit", wasseraufnahme_proz: "Wasseraufnahme", frostwiderstand: "Frost", bedarf_stk_m2: "Bedarf/m²", preise: "Preise",
  beschreibung: "Beschreibung", kurztext: "Kurztext", status: "Status", name: "Name", sku: "Artikelnummer", bilder: "Bilder", alt: "Alt-Text", datenblaetter: "Datenblatt",
  riemchen_staerke_mm: "Riemchenstärke", eckriemchen: "Eckriemchen", positionen: "Positionen", hersteller_quelle: "Herstellerquelle", aktivitaeten: "Aktivitäten", stein_id: "Stein",
};
export const feldLabel = (f: string) => FELD_LABEL[f] ?? f;

export function datensatzName(tabelle: string, id: number | string): string {
  const a = ab();
  const n = Number(id);
  if (tabelle === "produkte") return a.produkte.get(n)?.sku ?? a.produkte.get(n)?.name ?? "";
  if (tabelle === "steine") return a.steine.get(n)?.hbr_code ?? "";
  if (tabelle === "kontakte") return kontaktName(a.kontakte.get(n));
  if (tabelle === "vorgaenge") return z.daten.vorgaenge.find((v) => v.id === n)?.nummer ?? "";
  if (tabelle === "hersteller") return a.hersteller.get(n)?.name ?? "";
  return "";
}

export function aenderungZeile(e: import("../lib/modell.ts").Aenderung): { titel: string; text: string; link: string | null } {
  const name = e.text && e.aktion !== "aendern" ? e.text : datensatzName(e.tabelle, e.id);
  const titel = `${TABELLE_LABEL[e.tabelle] ?? e.tabelle}${name && e.aktion !== "loeschen" ? " " + name : ""}`;
  let text = e.aktion === "anlegen" ? "angelegt" : e.aktion === "loeschen" ? "gelöscht" : e.felder ? Object.keys(e.felder).map(feldLabel).join(", ") : e.text ?? "geändert";
  if (e.tabelle === "system") return { titel: "System", text: (e.text ?? "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, (x) => new Date(x).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })), link: null };
  const link = e.aktion === "loeschen" ? null : e.tabelle === "produkte" && e.id ? `produkte/${e.id}` : e.tabelle === "kontakte" ? `kontakte/k/${e.id}` : e.tabelle === "vorgaenge" ? `angebote/${e.id}`
    : e.tabelle === "steine" ? (() => { const p = ab().geschwister.get(Number(e.id))?.[0]; return p ? `produkte/${p.id}` : null; })() : null;
  return { titel, text, link };
}
