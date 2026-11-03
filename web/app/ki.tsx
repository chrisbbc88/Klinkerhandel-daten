// Datenblatt hochladen und auslesen – mit KI (eigener API-Schlüssel) oder ohne KI (Textsuche im PDF).
import { useEffect, useState } from "preact/hooks";
import { z, melde } from "./store.ts";
import { Karte, Icon } from "./ui.tsx";
import { pdfjs } from "./datenblatt.tsx";
import { kiAuslesen, vorschlaege, medienTyp, KiFehler, type KiVorschlag } from "../lib/ki.ts";
import { erkenneWerte, FELD_LABEL } from "../lib/datenblatt.ts";
import { OBERFLAECHEN } from "../lib/modell.ts";
import { dateiWaehlen, sha256, dateiSchreiben, kiSchluesselLesen } from "../lib/speicher.ts";

export interface GeladeneDatei { name: string; sha: string; blob: Blob; url: string }

let schluesselCache: string | undefined | null = null;
export async function kiSchluessel(): Promise<string | undefined> { if (schluesselCache === null) schluesselCache = await kiSchluesselLesen().catch(() => undefined); return schluesselCache; }
export function kiSchluesselVergessen() { schluesselCache = null; }

async function pdfText(b: Blob): Promise<string> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await b.arrayBuffer()), isEvalSupported: false }).promise;
  let t = "";
  for (let i = 1; i <= Math.min(doc.numPages, 8); i++) t += (await (await doc.getPage(i)).getTextContent()).items.map((x: any) => x.str + (x.hasEOL ? "\n" : " ")).join("") + "\n";
  return t;
}

/**
 * Datenblatt-Assistent. onUebernehmen bekommt die bestätigten Vorschläge und die Datei.
 * aktuell: liefert den aktuellen Wert eines Felds (für den Vergleich „Im ERP“).
 */
export function KiDatenblatt({ titel, onUebernehmen, aktuell, knopfText }: {
  titel: string; knopfText: string;
  onUebernehmen: (gewaehlt: KiVorschlag[], datei: GeladeneDatei) => void;
  aktuell?: (feld: string) => unknown;
}) {
  const [datei, setDatei] = useState<GeladeneDatei | null>(null);
  const [schluessel, setSchluessel] = useState<string | undefined>();
  const [laeuft, setLaeuft] = useState<"" | "ki" | "text">("");
  const [ergebnis, setErgebnis] = useState<{ liste: KiVorschlag[]; hinweise: string[]; quelle: "ki" | "text"; kosten?: string } | null>(null);
  const [wahl, setWahl] = useState<Record<string, boolean>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => { kiSchluessel().then(setSchluessel); }, []);
  useEffect(() => () => { if (datei) URL.revokeObjectURL(datei.url); }, [datei]);

  async function waehlen() {
    const f = await dateiWaehlen(".pdf,image/jpeg,image/png,image/webp");
    if (!f) return;
    if (!medienTyp(f, f.name)) { melde("Bitte ein PDF oder ein Foto (JPG, PNG, WEBP) wählen.", "fehler"); return; }
    if (f.size > 20 * 1024 * 1024) { melde("Die Datei ist größer als 20 MB.", "fehler"); return; }
    const sha = await sha256(f);
    await dateiSchreiben(sha, f).catch(() => {});
    setDatei({ name: f.name, sha, blob: f, url: URL.createObjectURL(f) });
    setErgebnis(null); setFehler(null);
  }

  function setzeErgebnis(liste: KiVorschlag[], hinweise: string[], quelle: "ki" | "text", kosten?: string) {
    setErgebnis({ liste, hinweise, quelle, kosten });
    // Vorauswahl: alles, was abweicht und eine Belegstelle hat; leere Felder immer
    setWahl(Object.fromEntries(liste.map((v) => {
      const a = aktuell?.(v.feld);
      const leer = a === null || a === undefined || a === "" || (Array.isArray(a) && !a.length);
      return [v.feld, JSON.stringify(a) !== JSON.stringify(v.wert) && (leer || !v.warnung)];
    })));
  }

  async function mitKi() {
    if (!datei || !schluessel) return;
    setLaeuft("ki"); setFehler(null);
    try {
      const r = await kiAuslesen(datei.blob, datei.name, schluessel, z.daten.einstellungen.ki.modell, z.daten, OBERFLAECHEN);
      const v = vorschlaege(r.roh, z.daten, OBERFLAECHEN);
      setzeErgebnis(v.liste, v.hinweise, "ki", `${r.kosten.ein.toLocaleString("de-DE")} Eingabe- / ${r.kosten.aus.toLocaleString("de-DE")} Ausgabe-Token`);
    } catch (e) { setFehler(e instanceof KiFehler ? e.message : `Auslesen fehlgeschlagen: ${(e as Error).message}`); }
    setLaeuft("");
  }

  async function ohneKi() {
    if (!datei) return;
    if (medienTyp(datei.blob, datei.name) !== "application/pdf") { setFehler("Ohne KI können nur PDFs mit Text gelesen werden. Fotos bitte mit KI auslesen oder Werte abtippen."); return; }
    setLaeuft("text"); setFehler(null);
    try {
      const t = await pdfText(datei.blob);
      if (!t.trim()) { setFehler("Im PDF ist kein Text enthalten (eingescannt). Bitte mit KI auslesen oder Werte abtippen."); setLaeuft(""); return; }
      const liste: KiVorschlag[] = erkenneWerte(t).map((v) => ({ feld: v.feld, label: FELD_LABEL[v.feld], ziel: "stein", wert: v.wert, anzeige: String(v.wert).replace(".", ","), beleg: v.fundstelle }));
      setzeErgebnis(liste, liste.length ? ["Textsuche ohne KI: nur Maße und technische Werte. Hersteller, Farben und Texte bitte selbst ergänzen."] : ["Keine bekannten Werte im Text gefunden."], "text");
    } catch (e) { setFehler((e as Error).message); }
    setLaeuft("");
  }

  const gewaehlt = ergebnis?.liste.filter((v) => wahl[v.feld]) ?? [];
  const istPdf = datei && medienTyp(datei.blob, datei.name) === "application/pdf";

  return <Karte titel={titel} rechts={<button class="btn dunkel klein" onClick={waehlen} disabled={!!laeuft || z.nurLesen}><Icon n="pdf" />{datei ? "Andere Datei" : "Datenblatt wählen"}</button>}>
    {!datei && <div class="leer" style={{ padding: "18px 8px" }}><b>PDF oder Foto des Hersteller-Datenblatts</b>
      {schluessel ? "Die KI liest Hersteller, Herstellungsart, Farben, Formate, Maße, Technik und einen Textvorschlag aus. Jeder Wert wird erst nach Ihrer Bestätigung übernommen."
        : <>Ohne KI werden aus PDFs mit Text nur Maße und technische Werte gesucht. Für das vollständige Auslesen unter <a href="#/einstellungen/allgemein">Einstellungen › Allgemein</a> einen Claude-API-Schlüssel hinterlegen.</>}
    </div>}
    {datei && <div class={`raster ${ergebnis ? "r-ki" : ""}`}>
      <div>
        {istPdf ? <iframe src={datei.url} title="Datenblatt" style={{ width: "100%", height: ergebnis ? 520 : 360, border: "1px solid var(--line)", borderRadius: 6 }} />
          : <img src={datei.url} alt="Datenblatt" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 6 }} />}
        <p class="muted klein" style={{ margin: "6px 0 0" }}>{datei.name}</p>
      </div>
      {ergebnis && <div>
        <table class="t">
          <thead><tr><th></th><th>Feld</th><th>Aus dem Datenblatt</th>{aktuell && <th>Bisher</th>}</tr></thead>
          <tbody>{ergebnis.liste.map((v) => {
            const a = aktuell?.(v.feld);
            const gleich = JSON.stringify(a) === JSON.stringify(v.wert);
            return <tr>
              <td><input type="checkbox" checked={!!wahl[v.feld]} disabled={gleich} onChange={() => setWahl({ ...wahl, [v.feld]: !wahl[v.feld] })} aria-label={`${v.label} übernehmen`} /></td>
              <td class="nowrap">{v.label}</td>
              <td><b style={{ fontWeight: 500 }}>{v.anzeige}</b>
                {v.beleg && <div class="faint klein">„{v.beleg}“</div>}
                {v.warnung && <div class="klein" style={{ color: "var(--warn)" }}>{v.warnung}</div>}</td>
              {aktuell && <td class="klein">{gleich ? <span class="marke ok">stimmt</span> : a === null || a === undefined || a === "" || (Array.isArray(a) && !a.length) ? <span class="faint">leer</span> : <span class="marke warn">{Array.isArray(a) ? a.join(", ") : String(a).slice(0, 40)}</span>}</td>}
            </tr>;
          })}</tbody>
        </table>
        {ergebnis.hinweise.map((h) => <div class="hinweisbox warn klein" style={{ marginTop: 8 }}>{h}</div>)}
        <p class="muted klein">{ergebnis.quelle === "ki" ? `Ausgelesen mit ${z.daten.einstellungen.ki.modell} · ${ergebnis.kosten}` : "Textsuche ohne KI"}</p>
      </div>}
    </div>}
    {fehler && <div class="hinweisbox bad" style={{ marginTop: 10 }}>{fehler}</div>}
    {datei && <div class="knopfreihe" style={{ marginTop: 12 }}>
      {schluessel && <button class="btn primaer" disabled={!!laeuft} onClick={mitKi}>{laeuft === "ki" ? "KI liest das Datenblatt… (10–40 Sek.)" : ergebnis?.quelle === "ki" ? "Erneut mit KI auslesen" : "Mit KI auslesen"}</button>}
      {istPdf && <button class={`btn ${schluessel ? "" : "primaer"}`} disabled={!!laeuft} onClick={ohneKi}>{laeuft === "text" ? "Suche…" : "Ohne KI: Werte im Text suchen"}</button>}
      {ergebnis && <button class="btn dunkel" disabled={!gewaehlt.length && !onUebernehmen} onClick={() => onUebernehmen(gewaehlt, datei)}><Icon n="check" />{knopfText} ({gewaehlt.length})</button>}
    </div>}
  </Karte>;
}
