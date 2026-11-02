// Speicherung im Browser (IndexedDB) und Sicherungsordner auf dem Rechner (File System Access API).
// Nur im Browser lauffähig.
import type { Daten } from "./modell.ts";

const DB_NAME = "klinkerhandel-erp";
let dbVersprechen: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbVersprechen) dbVersprechen = new Promise((ok, fehler) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("kv"); r.result.createObjectStore("dateien"); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error ?? new Error("Browser-Speicher nicht verfügbar"));
    r.onblocked = () => fehler(new Error("Browser-Speicher ist durch einen anderen Tab blockiert"));
  });
  return dbVersprechen;
}

async function tx<T>(store: string, modus: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, fehler) => {
    const t = d.transaction(store, modus);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => ok(r.result);
    t.onerror = () => fehler(t.error ?? r.error);
    t.onabort = () => fehler(t.error ?? new Error("Speichern abgebrochen (Speicher voll?)"));
  });
}

export const kvLesen = <T>(k: string) => tx<T | undefined>("kv", "readonly", (s) => s.get(k));
export const kvSchreiben = (k: string, v: unknown) => tx("kv", "readwrite", (s) => s.put(v, k));
export const dateiLesen = (sha: string) => tx<Blob | undefined>("dateien", "readonly", (s) => s.get(sha));
export const dateiSchreiben = (sha: string, b: Blob) => tx("dateien", "readwrite", (s) => s.put(b, sha));

export const ladeDaten = () => kvLesen<Daten>("daten");
export const speichereDaten = (d: Daten) => kvSchreiben("daten", d);

/** Einstellungen, die nur für diesen Rechner/Browser gelten. */
export interface Geraet {
  bearbeiter: string | null;
  auto_an: boolean; intervall_min: number; behalten_tage: number;
  letzte_sicherung: string | null; letzte_sicherung_datei: string | null;
  abgleich_bis: number; // Zeitstempel (ms) der jüngsten fremden Sicherung, die schon zusammengeführt oder verworfen wurde
  letzte_erinnerung: string | null;
}
export const GERAET_STANDARD: Geraet = {
  bearbeiter: null, auto_an: true, intervall_min: 60, behalten_tage: 0,
  letzte_sicherung: null, letzte_sicherung_datei: null, abgleich_bis: 0, letzte_erinnerung: null,
};
export async function ladeGeraet(): Promise<Geraet> { return { ...GERAET_STANDARD, ...((await kvLesen<Geraet>("geraet")) ?? {}) }; }
export const speichereGeraet = (g: Geraet) => kvSchreiben("geraet", g);

// ---------- Sicherungsordner ----------
type Ordner = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
  values(): AsyncIterable<FileSystemHandle>;
};
export type OrdnerStatus = "nicht_unterstuetzt" | "keiner" | "erlaubt" | "freigeben";

export const ordnerUnterstuetzt = () => typeof (window as any).showDirectoryPicker === "function";

let ordnerCache: Ordner | undefined | null = null; // null = noch nicht geladen
export async function ordner(): Promise<Ordner | undefined> {
  if (ordnerCache === null) ordnerCache = await kvLesen<Ordner>("ordner");
  return ordnerCache;
}

export async function ordnerStatus(): Promise<OrdnerStatus> {
  if (!ordnerUnterstuetzt()) return "nicht_unterstuetzt";
  const h = await ordner();
  if (!h) return "keiner";
  try { return (await h.queryPermission({ mode: "readwrite" })) === "granted" ? "erlaubt" : "freigeben"; }
  catch { return "freigeben"; }
}

/** Muss aus einem Klick heraus aufgerufen werden. */
export async function ordnerWaehlen(): Promise<string> {
  const h: Ordner = await (window as any).showDirectoryPicker({ id: "klinkerhandel-sicherung", mode: "readwrite", startIn: "documents" });
  await kvSchreiben("ordner", h);
  ordnerCache = h;
  return h.name;
}

/** Muss aus einem Klick heraus aufgerufen werden. */
export async function ordnerFreigeben(): Promise<boolean> {
  const h = await ordner();
  if (!h) return false;
  return (await h.requestPermission({ mode: "readwrite" })) === "granted";
}

export async function ordnerVergessen() { await kvSchreiben("ordner", undefined); ordnerCache = undefined; }

export async function inOrdnerSchreiben(name: string, text: string): Promise<void> {
  const h = await ordner();
  if (!h) throw new Error("Kein Sicherungsordner gewählt");
  const f = await h.getFileHandle(name, { create: true });
  const w = await (f as any).createWritable();
  try { await w.write(new Blob([text], { type: "application/json" })); await w.close(); }
  catch (e) { try { await w.abort(); } catch { /* bereits geschlossen */ } throw e; }
  // Kontrolle: Datei zurücklesen, damit „gesichert“ nur angezeigt wird, wenn die Datei wirklich vollständig ist
  const kontrolle = await (await f.getFile()).text();
  if (kontrolle.length !== text.length) throw new Error("Die Sicherungsdatei wurde nicht vollständig geschrieben");
}

export interface SicherungsDatei { name: string; geaendert: number; groesse: number; von: string | null; auto: boolean }
const DATEI_RE = /^klinkerhandel-erp_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})(?:_([^_]+?))?(_auto)?\.json$/;

export async function sicherungenAuflisten(): Promise<SicherungsDatei[]> {
  const h = await ordner();
  if (!h) return [];
  const out: SicherungsDatei[] = [];
  for await (const e of h.values()) {
    if (e.kind !== "file") continue;
    const m = DATEI_RE.exec(e.name);
    if (!m) continue;
    const f = await (e as FileSystemFileHandle).getFile();
    out.push({ name: e.name, geaendert: f.lastModified, groesse: f.size, von: m[3] ?? null, auto: !!m[4] });
  }
  return out.sort((a, b) => b.geaendert - a.geaendert);
}

export async function ausOrdnerLesen(name: string): Promise<string> {
  const h = await ordner();
  if (!h) throw new Error("Kein Sicherungsordner gewählt");
  return (await (await h.getFileHandle(name)).getFile()).text();
}

/** Löscht nur eigene automatische Sicherungen, die älter als `tage` sind. Nur wenn ausdrücklich eingestellt. */
export async function alteAutoSicherungenEntfernen(tage: number, bearbeiter: string): Promise<number> {
  if (!tage) return 0;
  const h = await ordner();
  if (!h) return 0;
  const grenze = Date.now() - tage * 86400000;
  let n = 0;
  for (const f of await sicherungenAuflisten()) {
    if (f.auto && f.von === bearbeiter && f.geaendert < grenze) { await h.removeEntry(f.name); n++; }
  }
  return n;
}

export function sicherungsName(bearbeiter: string, auto: boolean, jetzt = new Date()): string {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(jetzt).replace(" ", "_").replace(":", "-");
  const wer = encodeURIComponent(bearbeiter.replace(/[_\s]+/g, "-"));
  return `klinkerhandel-erp_${f}_${wer}${auto ? "_auto" : ""}.json`;
}

export function herunterladen(name: string, inhalt: string | Blob, typ = "application/json") {
  const b = typeof inhalt === "string" ? new Blob([inhalt], { type: typ }) : inhalt;
  const url = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function dateiWaehlen(accept: string): Promise<File | null> {
  return new Promise((ok) => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = accept;
    i.onchange = () => ok(i.files?.[0] ?? null);
    i.addEventListener("cancel", () => ok(null));
    i.click();
  });
}

export async function sha256(b: Blob): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await b.arrayBuffer());
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ---------- KI-Schlüssel (nur dieser Browser, nie in Sicherungen) ----------
export const kiSchluesselLesen = () => kvLesen<string>("ki_schluessel");
export const kiSchluesselSpeichern = (s: string | undefined) => kvSchreiben("ki_schluessel", s);
