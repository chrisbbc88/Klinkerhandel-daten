// Alle Schreibzugriffe laufen hierüber: Versionsprüfung, Protokoll, Zeitstempel.
import type { Daten, Tabelle, Aenderung } from "./modell.ts";

type Zeile<K extends Tabelle> = Daten[K][number];

export class Konflikt extends Error {
  aktuell: unknown;
  constructor(text: string, aktuell: unknown) { super(text); this.aktuell = aktuell; this.name = "Konflikt"; }
}

const MAX_PROTOKOLL = 20000;

/** Eindeutige ID, die auch auf zwei Rechnern parallel nicht doppelt vergeben wird. */
export function neueId(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

export function protokolliere(d: Daten, e: Aenderung) {
  d.aenderungen.push(e);
  if (d.aenderungen.length > MAX_PROTOKOLL) d.aenderungen.splice(0, d.aenderungen.length - MAX_PROTOKOLL);
}

const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Ändert einen Datensatz. erwarteteVersion = Version, die der Bearbeiter geladen hatte.
 * Wurde der Datensatz inzwischen geändert, wird nichts geschrieben (Konflikt).
 * Gibt die tatsächlich geänderten Felder zurück.
 */
export function aendere<K extends Tabelle>(
  d: Daten, tabelle: K, id: number, patch: Partial<Zeile<K>>, von: string, erwarteteVersion?: number, jetzt = new Date().toISOString(),
): string[] {
  type T = { id: number; version?: number; geaendert_am?: string; geaendert_von?: string };
  const liste = d[tabelle] as unknown as T[];
  const obj = liste.find((x) => x.id === id);
  if (!obj) throw new Error(`${tabelle} ${id} nicht gefunden`);
  if (erwarteteVersion !== undefined && obj.version !== undefined && obj.version !== erwarteteVersion)
    throw new Konflikt("Der Datensatz wurde inzwischen geändert. Bitte neu laden und erneut speichern.", structuredClone(obj));
  const felder: Record<string, [unknown, unknown]> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (["id", "version", "erstellt_am", "geaendert_am", "geaendert_von"].includes(k)) continue;
    const alt = (obj as any)[k];
    if (!gleich(alt, v)) { felder[k] = [alt, v]; (obj as any)[k] = structuredClone(v); }
  }
  const keys = Object.keys(felder);
  if (!keys.length) return [];
  if (obj.version !== undefined) obj.version++;
  obj.geaendert_am = jetzt;
  if ("geaendert_von" in obj) obj.geaendert_von = von;
  protokolliere(d, { zeit: jetzt, von, tabelle, id, aktion: "aendern", felder });
  return keys;
}

export function lege_an<K extends Tabelle>(d: Daten, tabelle: K, obj: Zeile<K>, von: string, jetzt = new Date().toISOString()): Zeile<K> {
  const liste = d[tabelle] as unknown as Zeile<K>[];
  if (liste.some((x) => x.id === obj.id)) throw new Error(`${tabelle} ${obj.id} existiert bereits`);
  liste.push(obj);
  d.zaehler[tabelle] = (d.zaehler[tabelle] ?? 0) + 1;
  protokolliere(d, { zeit: jetzt, von, tabelle, id: obj.id, aktion: "anlegen", felder: null, text: (obj as any).sku ?? (obj as any).hbr_code ?? (obj as any).firma ?? (obj as any).nummer });
  return obj;
}

/** Löscht und hinterlässt einen Löschvermerk, damit ein späteres Zusammenführen den Datensatz nicht zurückholt. */
export function loesche(d: Daten, tabelle: Tabelle, id: number, von: string, jetzt = new Date().toISOString()) {
  const liste = d[tabelle] as unknown as { id: number }[];
  const i = liste.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [weg] = liste.splice(i, 1);
  d.geloescht.push({ tabelle, id, zeit: jetzt, von });
  protokolliere(d, { zeit: jetzt, von, tabelle, id, aktion: "loeschen", felder: null, text: JSON.stringify(weg).slice(0, 300) });
}
