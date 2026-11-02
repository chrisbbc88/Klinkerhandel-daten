// Zentraler Zustand der Anwendung: Daten, Speichern, Sicherung, Meldungen.
import { useEffect, useState } from "preact/hooks";
import { datenAusBestand, STANDARD_EINSTELLUNGEN, type Daten } from "../lib/modell.ts";
import { Konflikt } from "../lib/aendern.ts";
import { pruefeSicherung, sicherungsText } from "../lib/sicherung.ts";
import {
  ladeDaten, speichereDaten, ladeGeraet, speichereGeraet, ordnerStatus, inOrdnerSchreiben, sicherungenAuflisten,
  alteAutoSicherungenEntfernen, sicherungsName, herunterladen, ausOrdnerLesen,
  type Geraet, type OrdnerStatus, type SicherungsDatei,
} from "../lib/speicher.ts";
import type { Bestand } from "../../src/import/bestand.ts";

export interface Meldung { id: number; text: string; art: "ok" | "fehler" | "info" }
export interface ImportAngebot { daten: Daten; quelle: string; dateiZeit?: number }
interface Frage { text: string; titel: string; ok: string; gefahr: boolean; antwort: (ja: boolean) => void }

export const z = {
  daten: null as unknown as Daten,
  geraet: null as unknown as Geraet,
  bereit: false,
  startFehler: null as string | null,
  nurLesen: false,
  ordner: "keiner" as OrdnerStatus,
  fremde: [] as SicherungsDatei[],
  sicherungLaeuft: false,
  sicherungsFehler: null as string | null,
  speicherFehler: null as string | null,
  ungespeichert: false,
  meldungen: [] as Meldung[],
  importAngebot: null as ImportAngebot | null,
  frage: null as Frage | null,
  rev: 0,
};

const hoerer = new Set<() => void>();
export function useZ() {
  const [, setze] = useState(0);
  useEffect(() => { const f = () => setze((x) => x + 1); hoerer.add(f); return () => { hoerer.delete(f); }; }, []);
  return z;
}
export function neuZeichnen() { z.rev++; for (const f of hoerer) f(); }

let mId = 0;
export function melde(text: string, art: Meldung["art"] = "ok") {
  const m = { id: ++mId, text, art };
  z.meldungen = [...z.meldungen, m];
  neuZeichnen();
  setTimeout(() => { z.meldungen = z.meldungen.filter((x) => x !== m); neuZeichnen(); }, art === "fehler" ? 9000 : 4000);
}

export function frage(text: string, titel = "Bitte bestätigen", ok = "OK", gefahr = false): Promise<boolean> {
  return new Promise((antwort) => { z.frage = { text, titel, ok, gefahr, antwort: (ja) => { z.frage = null; neuZeichnen(); antwort(ja); } }; neuZeichnen(); });
}

export const ich = () => z.geraet?.bearbeiter ?? "Unbekannt";

// ---------- Ändern und Speichern ----------
let speicherTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Führt eine Änderung atomar aus: Schlägt sie fehl, bleibt der vorherige Stand erhalten.
 * Gibt true zurück, wenn gespeichert werden konnte.
 */
export function aendern(fn: (d: Daten, von: string) => void, erfolg?: string): boolean {
  if (z.nurLesen) { melde("Dieses Fenster ist nur zum Lesen geöffnet, weil das ERP schon in einem anderen Tab läuft.", "fehler"); return false; }
  const vorher = structuredClone(z.daten);
  try {
    fn(z.daten, ich());
  } catch (e) {
    z.daten = vorher;
    melde(e instanceof Konflikt ? e.message : `Nicht gespeichert: ${(e as Error).message}`, "fehler");
    neuZeichnen();
    return false;
  }
  z.daten.gespeichert_am = new Date().toISOString();
  z.ungespeichert = true;
  if (speicherTimer) clearTimeout(speicherTimer);
  speicherTimer = setTimeout(speichernJetzt, 300);
  if (erfolg) melde(erfolg);
  neuZeichnen();
  return true;
}

export async function speichernJetzt() {
  if (speicherTimer) { clearTimeout(speicherTimer); speicherTimer = null; }
  try {
    await speichereDaten(z.daten);
    z.ungespeichert = false; z.speicherFehler = null;
  } catch (e) {
    z.speicherFehler = `Speichern im Browser fehlgeschlagen: ${(e as Error).message}. Bitte sofort eine Sicherung herunterladen.`;
  }
  neuZeichnen();
}

export function geraetAendern(patch: Partial<Geraet>) {
  z.geraet = { ...z.geraet, ...patch };
  speichereGeraet(z.geraet).catch((e) => melde(`Einstellung nicht gespeichert: ${e.message}`, "fehler"));
  neuZeichnen();
}

/** Ersetzt den gesamten Datenstand (nach Prüfung). Vorher wird eine Sicherung des alten Stands angelegt. */
export async function datenErsetzen(neu: Daten, grund: string) {
  await sichern(false, "vor-ersetzen");
  z.daten = neu;
  z.daten.aenderungen.push({ zeit: new Date().toISOString(), von: ich(), tabelle: "system", id: 0, aktion: "aendern", felder: null, text: grund });
  z.daten.gespeichert_am = new Date().toISOString();
  await speichernJetzt();
  neuZeichnen();
}

// ---------- Sicherung ----------
export const sicherungFaellig = () => !z.geraet.letzte_sicherung || z.daten.gespeichert_am > z.geraet.letzte_sicherung;

/**
 * Schreibt eine Sicherung in den Ordner (falls freigegeben), sonst als Download.
 * auto=true: nur Ordner, nie ein unerwarteter Download.
 */
export async function sichern(auto: boolean, zusatz = ""): Promise<boolean> {
  if (z.sicherungLaeuft) return false;
  z.sicherungLaeuft = true; neuZeichnen();
  const name = sicherungsName(ich() + (zusatz ? "-" + zusatz : ""), auto);
  const text = sicherungsText(z.daten);
  try {
    z.ordner = await ordnerStatus();
    if (z.ordner === "erlaubt") await inOrdnerSchreiben(name, text);
    else if (auto) return false;
    else herunterladen(name, text);
    if (!zusatz) geraetAendern({ letzte_sicherung: new Date().toISOString(), letzte_sicherung_datei: name });
    z.sicherungsFehler = null;
    if (z.ordner === "erlaubt" && auto && z.geraet.behalten_tage) await alteAutoSicherungenEntfernen(z.geraet.behalten_tage, encodeURIComponent(ich().replace(/[_\s]+/g, "-")));
    if (!auto) melde(z.ordner === "erlaubt" ? `Gesichert: ${name}` : `Sicherung heruntergeladen: ${name}`);
    return true;
  } catch (e) {
    z.sicherungsFehler = `Sicherung fehlgeschlagen: ${(e as Error).message}`;
    if (!auto) melde(z.sicherungsFehler, "fehler");
    return false;
  } finally {
    z.sicherungLaeuft = false; neuZeichnen();
  }
}

/** Sucht im Sicherungsordner nach neueren Ständen anderer Bearbeiter. */
export async function fremdeSuchen(): Promise<SicherungsDatei[]> {
  if (z.ordner !== "erlaubt") { z.fremde = []; return []; }
  const meinName = encodeURIComponent(ich().replace(/[_\s]+/g, "-"));
  try {
    const alle = await sicherungenAuflisten();
    const jeVon = new Map<string, SicherungsDatei>();
    for (const f of alle) if (f.von && f.von !== meinName && !f.von.includes("-vor-") && f.geaendert > z.geraet.abgleich_bis && !jeVon.has(f.von)) jeVon.set(f.von, f);
    z.fremde = [...jeVon.values()];
  } catch { z.fremde = []; }
  neuZeichnen();
  return z.fremde;
}

export async function fremdeOeffnen(f: SicherungsDatei) {
  try {
    const p = pruefeSicherung(JSON.parse(await ausOrdnerLesen(f.name)));
    if (!p.ok) { melde(`${f.name}: ${p.fehler}`, "fehler"); return; }
    z.importAngebot = { daten: p.daten, quelle: `${decodeURIComponent(f.von ?? "")} · ${new Date(f.geaendert).toLocaleString("de-DE")}`, dateiZeit: f.geaendert };
    neuZeichnen();
  } catch (e) { melde(`Datei konnte nicht gelesen werden: ${(e as Error).message}`, "fehler"); }
}

export function fremdeErledigt(bis: number) {
  geraetAendern({ abgleich_bis: Math.max(z.geraet.abgleich_bis, bis) });
  fremdeSuchen();
}

async function takt() {
  if (!z.bereit || z.nurLesen) return;
  z.ordner = await ordnerStatus();
  const g = z.geraet;
  const faellig = sicherungFaellig() && (!g.letzte_sicherung || Date.now() - Date.parse(g.letzte_sicherung) >= g.intervall_min * 60000);
  if (g.auto_an && faellig && z.ordner === "erlaubt") await sichern(true);
  await fremdeSuchen();
  neuZeichnen();
}

// ---------- Start ----------
export async function starten(bestand: Bestand) {
  try {
    if ("locks" in navigator) {
      await new Promise<void>((weiter) => {
        navigator.locks.request("klinkerhandel-erp-schreiben", { ifAvailable: true }, (lock) => {
          z.nurLesen = !lock;
          weiter();
          return lock ? new Promise(() => {}) : undefined; // Sperre halten, solange der Tab offen ist
        });
      });
    }
    z.geraet = await ladeGeraet();
    let d = await ladeDaten();
    if (!d) {
      d = datenAusBestand(bestand, new Date().toISOString(), "Übernahme");
      if (!z.nurLesen) await speichereDaten(d);
    }
    d.geloescht ??= [];
    d.einstellungen = { ...structuredClone(STANDARD_EINSTELLUNGEN), ...d.einstellungen };
    z.daten = d;
    z.ordner = await ordnerStatus();
    z.bereit = true;
    (navigator.storage as any)?.persist?.().catch(() => {});
    setTimeout(takt, 3000);
    setInterval(takt, 60000);
    window.addEventListener("beforeunload", (e) => {
      if (z.ungespeichert) { speichernJetzt(); e.preventDefault(); }
    });
  } catch (e) {
    z.startFehler = (e as Error).message;
  }
  neuZeichnen();
}
