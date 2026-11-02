// Gemeinsame Bausteine der Oberfläche.
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { FARBWERT } from "../lib/modell.ts";

// ---------- Navigation ----------
export function useRoute(): string[] {
  const lesen = () => decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("?")[0].split("/").filter(Boolean);
  const [r, setR] = useState(lesen);
  useEffect(() => { const f = () => { setR(lesen()); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return r;
}
export function queryParam(name: string): string | null {
  const q = location.hash.split("?")[1];
  return q ? new URLSearchParams(q).get(name) : null;
}
export const geheZu = (pfad: string) => { location.hash = "#/" + pfad.replace(/^#?\/?/, ""); };

// ---------- Icons (eigene, schlichte Linien) ----------
const P: Record<string, string> = {
  dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  produkte: "M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10",
  kontakte: "M16 20v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 18.5V20M10 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7M20 20v-1.5a3.5 3.5 0 00-2.5-3.3M15.5 4.2a3.5 3.5 0 010 6.6",
  angebote: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  einstellungen: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  suche: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5",
  menue: "M4 6h16M4 12h16M4 18h16",
  plus: "M12 5v14M5 12h14",
  hoch: "M12 19V5M5 12l7-7 7 7",
  runter: "M12 5v14M19 12l-7 7-7-7",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  upload: "M12 21V9M7 14l5-5 5 5M5 3h14",
  ordner: "M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  sichern: "M5 3h11l3 3v15H5zM8 3v6h8V3M8 21v-7h8v7",
  warnung: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  euro: "M17 6a7 7 0 100 12M4 10h9M4 14h9",
  bild: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15 9h.01",
  verlauf: "M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8M3 3v5h5M12 7v5l4 2",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  drucken: "M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z",
  pdf: "M7 3h7l5 5v13H7zM14 3v5h5M9 14h6M9 17h4",
  check: "M5 12l5 5 9-9",
  shop: "M3 9l2-5h14l2 5M3 9v11h18V9M3 9h18M9 20v-6h6v6",
  liste: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  referenz: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6",
};
export function Icon({ n, s }: { n: string; s?: number }) {
  return <svg viewBox="0 0 24 24" width={s ?? 17} height={s ?? 17} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={P[n] ?? ""} /></svg>;
}

// ---------- Layout ----------
export function Seitenkopf({ titel, text, children }: { titel: ComponentChildren; text?: ComponentChildren; children?: ComponentChildren }) {
  return <div class="seitenkopf"><div><h1>{titel}</h1>{text && <p>{text}</p>}</div>{children && <div class="aktionen">{children}</div>}</div>;
}
export function Karte({ titel, rechts, children, klasse, ohnePadding }: { titel?: ComponentChildren; rechts?: ComponentChildren; children: ComponentChildren; klasse?: string; ohnePadding?: boolean }) {
  return <section class={`karte ${klasse ?? ""}`}>
    {(titel || rechts) && <div class="karte-kopf">{typeof titel === "string" ? <h2>{titel}</h2> : titel}{rechts && <div class="rechts">{rechts}</div>}</div>}
    {ohnePadding ? children : <div class="karte-inhalt">{children}</div>}
  </section>;
}
export function Feld({ label, hinweis, children, klasse }: { label: string; hinweis?: ComponentChildren; children: ComponentChildren; klasse?: string }) {
  return <label class={`feld ${klasse ?? ""}`}><span>{label}</span>{children}{hinweis && <small>{hinweis}</small>}</label>;
}
export function Leer({ titel, children }: { titel: string; children?: ComponentChildren }) {
  return <div class="leer"><b>{titel}</b>{children}</div>;
}

export function Dialog({ titel, onClose, children, fuss, breit }: { titel: ComponentChildren; onClose: () => void; children: ComponentChildren; fuss?: ComponentChildren; breit?: boolean }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; addEventListener("keydown", f); return () => removeEventListener("keydown", f); }, [onClose]);
  return <div class="schleier" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class={`dialog ${breit ? "breit" : ""}`} role="dialog" aria-modal="true">
      <div class="dialog-kopf"><h2>{titel}</h2><button class="x" onClick={onClose} aria-label="Schließen">×</button></div>
      <div class="dialog-inhalt">{children}</div>
      {fuss && <div class="dialog-fuss">{fuss}</div>}
    </div>
  </div>;
}

// ---------- Eingaben ----------
export function Text({ wert, setze, ...rest }: { wert: string; setze: (v: string) => void; [k: string]: any }) {
  return <input type="text" value={wert} onInput={(e) => setze((e.target as HTMLInputElement).value)} {...rest} />;
}
/** Zahleneingabe mit Komma. Leeres Feld = null. */
export function Zahl({ wert, setze, ...rest }: { wert: number | null | undefined; setze: (v: number | null) => void; [k: string]: any }) {
  const [t, setT] = useState(wert == null ? "" : String(wert).replace(".", ","));
  useEffect(() => { const n = t.trim() ? Number(t.replace(/\./g, "").replace(",", ".")) : null; if (n !== wert) setT(wert == null ? "" : String(wert).replace(".", ",")); }, [wert]);
  const ungueltig = t.trim() !== "" && Number.isNaN(Number(t.replace(/\./g, "").replace(",", ".")));
  return <input type="text" inputMode="decimal" class={ungueltig ? "fehler" : ""} value={t} {...rest}
    onInput={(e) => { const v = (e.target as HTMLInputElement).value; setT(v); const n = v.trim() ? Number(v.replace(/\./g, "").replace(",", ".")) : null; if (n === null || !Number.isNaN(n)) setze(n); }} />;
}
export function Auswahl<T extends string>({ wert, setze, optionen, leer, ...rest }: { wert: T | "" | null; setze: (v: T) => void; optionen: [T, string][] | Record<string, string>; leer?: string; [k: string]: any }) {
  const liste = Array.isArray(optionen) ? optionen : (Object.entries(optionen) as [T, string][]);
  return <select value={wert ?? ""} onChange={(e) => setze((e.target as HTMLSelectElement).value as T)} {...rest}>
    {leer !== undefined && <option value="">{leer}</option>}
    {liste.map(([k, v]) => <option value={k}>{v}</option>)}
  </select>;
}
export function Chips({ alle, gewaehlt, setze, farbe }: { alle: string[]; gewaehlt: string[]; setze: (v: string[]) => void; farbe?: boolean }) {
  return <div class="chips">{alle.map((x) => {
    const an = gewaehlt.includes(x);
    return <button type="button" class={`chip ${an ? "an" : ""}`} aria-pressed={an} onClick={() => setze(an ? gewaehlt.filter((y) => y !== x) : [...gewaehlt, x])}>
      {farbe && <Farbpunkt f={x} />}{x}
    </button>;
  })}</div>;
}
export function Farbpunkt({ f }: { f: string }) {
  return <span class="farbpunkt" style={{ background: FARBWERT[f] ?? "#ccc" }} title={f} />;
}
export function Score({ wert }: { wert: number }) {
  return <span class={`score ${wert >= 80 ? "" : wert >= 55 ? "mittel" : "schlecht"}`} title={`Vollständigkeit ${wert} %`}><i><b style={{ width: `${wert}%` }} /></i>{wert}</span>;
}

// ---------- Hilfen ----------
export function relZeit(iso: string | null | undefined): string {
  if (!iso) return "nie";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "gerade eben";
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  if (s < 86400 * 7) return `vor ${Math.floor(s / 86400)} Tag${s >= 172800 ? "en" : ""}`;
  return new Date(iso).toLocaleDateString("de-DE");
}
export const datum = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("de-DE") : "–");
export const datumZeit = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–");
export const initialen = (n: string) => n.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();

export function useSortierung<T>(liste: T[], start: string, werte: Record<string, (x: T) => string | number | null>) {
  const [s, setS] = useState({ feld: start, ab: false });
  const f = werte[s.feld];
  const sortiert = f ? [...liste].sort((a, b) => {
    const x = f(a), y = f(b);
    if (x === y) return 0; if (x === null || x === "") return 1; if (y === null || y === "") return -1;
    const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "de", { numeric: true });
    return s.ab ? -r : r;
  }) : liste;
  const Kopf = ({ feld, children, klasse }: { feld: string; children: ComponentChildren; klasse?: string }) =>
    <th class={`sort ${klasse ?? ""}`} onClick={() => setS({ feld, ab: s.feld === feld ? !s.ab : false })} aria-sort={s.feld === feld ? (s.ab ? "descending" : "ascending") : undefined}>
      {children}{s.feld === feld ? (s.ab ? " ↓" : " ↑") : ""}</th>;
  return { sortiert, Kopf };
}

export function Seiten({ seite, setSeite, gesamt, proSeite }: { seite: number; setSeite: (n: number) => void; gesamt: number; proSeite: number }) {
  const max = Math.max(1, Math.ceil(gesamt / proSeite));
  if (gesamt <= proSeite) return <div class="seiten">{gesamt} Einträge</div>;
  return <div class="seiten">
    <span>{seite * proSeite + 1}–{Math.min(gesamt, (seite + 1) * proSeite)} von {gesamt}</span>
    <button class="btn klein" disabled={seite === 0} onClick={() => setSeite(seite - 1)}>Zurück</button>
    <button class="btn klein" disabled={seite >= max - 1} onClick={() => setSeite(seite + 1)}>Weiter</button>
  </div>;
}
