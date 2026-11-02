// Sicherung als JSON: prüfen, vergleichen, zusammenführen. Ohne Browser-Abhängigkeiten, daher testbar.
import { FORMAT_KENNUNG, SCHEMA_VERSION, type Daten } from "./modell.ts";

export function sicherungsText(d: Daten): string {
  return JSON.stringify(d);
}

/** Prüft eine eingelesene Datei. Liefert die Daten oder eine verständliche Fehlermeldung. */
export function pruefeSicherung(roh: unknown): { ok: true; daten: Daten } | { ok: false; fehler: string } {
  const d = roh as Partial<Daten>;
  if (!d || typeof d !== "object") return { ok: false, fehler: "Die Datei enthält kein JSON-Objekt." };
  if (d.format !== FORMAT_KENNUNG) return { ok: false, fehler: "Das ist keine Sicherung des Klinkerhandel-ERP." };
  if (typeof d.schema !== "number" || d.schema > SCHEMA_VERSION)
    return { ok: false, fehler: `Die Sicherung stammt aus einer neueren Programmversion (Schema ${d.schema}). Bitte zuerst die Seite aktualisieren.` };
  for (const t of ["steine", "produkte", "bilder", "referenzen", "hinweise", "kontakte", "vorgaenge", "hersteller", "aenderungen"] as const)
    if (!Array.isArray(d[t])) return { ok: false, fehler: `Die Sicherung ist unvollständig: „${t}“ fehlt.` };
  if (!d.produkte!.length && !d.kontakte!.length)
    return { ok: false, fehler: "Die Sicherung enthält weder Produkte noch Kontakte. Zum Schutz vor Datenverlust wird sie nicht eingespielt." };
  return { ok: true, daten: { geloescht: [], ...d } as Daten };
}

type MitId = { id: number; geaendert_am?: string; version?: number };
const TABELLEN = ["steine", "produkte", "bilder", "referenzen", "kontakte", "vorgaenge", "hersteller", "hinweise"] as const;
export type Vergleich = Record<(typeof TABELLEN)[number], { neu: number; neuer: number; aelter: number; gleich: number; nur_hier: number }>;

const zeitVon = (t: string, x: any): string => (t === "hinweise" ? x.erledigt_am ?? "" : x.geaendert_am ?? "");

/** Was würde ein Zusammenführen bewirken? */
export function vergleiche(hier: Daten, dort: Daten): Vergleich {
  const v = {} as Vergleich;
  for (const t of TABELLEN) {
    const a = new Map((hier[t] as MitId[]).map((x) => [x.id, x]));
    const b = new Map((dort[t] as MitId[]).map((x) => [x.id, x]));
    const z = { neu: 0, neuer: 0, aelter: 0, gleich: 0, nur_hier: 0 };
    for (const [id, x] of b) {
      const y = a.get(id);
      if (!y) z.neu++;
      else if (JSON.stringify(x) === JSON.stringify(y)) z.gleich++;
      else if (zeitVon(t, x) > zeitVon(t, y)) z.neuer++;
      else z.aelter++;
    }
    for (const id of a.keys()) if (!b.has(id)) z.nur_hier++;
    v[t] = z;
  }
  return v;
}

export interface Zusammenfuehrung { daten: Daten; uebernommen: number; konflikte: string[] }

/**
 * Führt eine fremde Sicherung in den eigenen Stand ein.
 * Regeln: je Datensatz gewinnt die jüngere Änderung; Löschvermerke werden beachtet;
 * neue Steine/Produkte mit bereits vergebenem HBR-Code oder SKU werden nicht übernommen, sondern gemeldet.
 * Einstellungen bleiben unverändert.
 */
export function fuehreZusammen(hier: Daten, dort: Daten): Zusammenfuehrung {
  const d = structuredClone(hier);
  const konflikte: string[] = [];
  let uebernommen = 0;
  const geloescht = new Map<string, string>();
  for (const g of [...(hier.geloescht ?? []), ...(dort.geloescht ?? [])]) {
    const k = `${g.tabelle}:${g.id}`;
    if ((geloescht.get(k) ?? "") < g.zeit) geloescht.set(k, g.zeit);
  }
  const vergeben = {
    hbr: new Map(d.steine.map((s) => [s.hbr_code, s.id])),
    sku: new Map(d.produkte.filter((p) => p.sku).map((p) => [p.sku!, p.id])),
    nummer: new Map(d.vorgaenge.map((v) => [v.nummer, v.id])),
  };
  for (const t of TABELLEN) {
    const liste = d[t] as MitId[];
    const idx = new Map(liste.map((x, i) => [x.id, i]));
    for (const x of dort[t] as MitId[]) {
      const tod = geloescht.get(`${t}:${x.id}`);
      if (tod && tod >= zeitVon(t, x)) continue;
      const i = idx.get(x.id);
      if (i === undefined) {
        const any = x as any;
        if (t === "steine" && vergeben.hbr.has(any.hbr_code) && vergeben.hbr.get(any.hbr_code) !== x.id) { konflikte.push(`Stein ${any.hbr_code} gibt es auf beiden Seiten mit unterschiedlicher Kennung – nicht übernommen`); continue; }
        if (t === "produkte" && any.sku && vergeben.sku.has(any.sku) && vergeben.sku.get(any.sku) !== x.id) { konflikte.push(`Artikelnummer ${any.sku} gibt es auf beiden Seiten – nicht übernommen`); continue; }
        if (t === "vorgaenge" && vergeben.nummer.has(any.nummer)) { konflikte.push(`Vorgangsnummer ${any.nummer} doppelt – nicht übernommen`); continue; }
        liste.push(structuredClone(x));
        idx.set(x.id, liste.length - 1);
        uebernommen++;
      } else if (zeitVon(t, x) > zeitVon(t, liste[i]) && JSON.stringify(x) !== JSON.stringify(liste[i])) {
        liste[i] = structuredClone(x);
        uebernommen++;
      }
    }
    // Löschvermerke auf den eigenen Stand anwenden
    (d as any)[t] = (d[t] as MitId[]).filter((x) => { const tod = geloescht.get(`${t}:${x.id}`); return !tod || tod < zeitVon(t, x); });
  }
  // Steine, die jetzt keine gültige Referenz mehr haben, sind ein Fehler im Ausgangsstand – melden statt reparieren
  const steinIds = new Set(d.steine.map((s) => s.id));
  for (const p of d.produkte) if (p.stein_id && !steinIds.has(p.stein_id)) konflikte.push(`Produkt ${p.sku ?? p.id} verweist auf einen fehlenden Stein`);

  const schluessel = (a: any) => `${a.zeit}|${a.von}|${a.tabelle}|${a.id}|${a.aktion}`;
  const prot = new Map(d.aenderungen.map((a) => [schluessel(a), a]));
  for (const a of dort.aenderungen) if (!prot.has(schluessel(a))) prot.set(schluessel(a), a);
  d.aenderungen = [...prot.values()].sort((a, b) => a.zeit.localeCompare(b.zeit));
  d.geloescht = [...geloescht].map(([k, zeit]) => {
    const [tabelle, id] = k.split(":");
    const herk = [...(hier.geloescht ?? []), ...(dort.geloescht ?? [])].find((g) => g.tabelle === tabelle && String(g.id) === id && g.zeit === zeit);
    return { tabelle, id: Number(id), zeit, von: herk?.von ?? "" };
  });
  for (const [k, v] of Object.entries(dort.zaehler ?? {})) d.zaehler[k] = Math.max(d.zaehler[k] ?? 0, v);
  return { daten: d, uebernommen, konflikte };
}
