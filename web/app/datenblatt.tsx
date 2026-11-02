// Datenblatt-Abgleich: PDF oder Foto neben den Steindaten, erkannte Werte bestätigen.
import { useEffect, useRef, useState } from "preact/hooks";
import { z, aendern, melde } from "./store.ts";
import { Karte, Icon, datum } from "./ui.tsx";
import { erkenneWerte, abgleichen, type Abgleich } from "../lib/datenblatt.ts";
import { aendere } from "../lib/aendern.ts";
import { dateiWaehlen, sha256, dateiSchreiben, dateiLesen } from "../lib/speicher.ts";
import type { Stein } from "../lib/modell.ts";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
let pdfLaden: Promise<any> | null = null;
function pdfjs(): Promise<any> {
  if ((window as any).pdfjsLib) return Promise.resolve((window as any).pdfjsLib);
  if (!pdfLaden) pdfLaden = new Promise((ok, fehler) => {
    const s = document.createElement("script");
    s.src = PDFJS + "pdf.min.js";
    s.onload = () => { const l = (window as any).pdfjsLib; l.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; ok(l); };
    s.onerror = () => { pdfLaden = null; fehler(new Error("Der PDF-Leser konnte nicht geladen werden (Internetverbindung?).")); };
    document.head.appendChild(s);
  });
  return pdfLaden;
}

interface Geladen { name: string; sha: string; typ: "pdf" | "bild"; url: string; text: string; seiten: number }

export function DatenblattAbgleich({ stein }: { stein: Stein }) {
  const [g, setG] = useState<Geladen | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [wahl, setWahl] = useState<Record<string, boolean>>({});
  const seitenRef = useRef<HTMLDivElement>(null);
  const abgleich: Abgleich[] = g ? abgleichen(stein, erkenneWerte(g.text)) : [];

  async function oeffnen(file: Blob, name: string, vorhandenSha?: string) {
    setLaeuft(true); setFehler(null); setG(null);
    try {
      const sha = vorhandenSha ?? await sha256(file);
      const istPdf = file.type === "application/pdf" || /\.pdf$/i.test(name);
      const url = URL.createObjectURL(file);
      let text = "", seiten = 0;
      if (istPdf) {
        const lib = await pdfjs();
        const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
        seiten = doc.numPages;
        const ziel = seitenRef.current!;
        ziel.innerHTML = "";
        for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
          const page = await doc.getPage(i);
          const tc = await page.getTextContent();
          text += tc.items.map((x: any) => x.str + (x.hasEOL ? "\n" : " ")).join("") + "\n";
          const vp = page.getViewport({ scale: 1.4 });
          const c = document.createElement("canvas");
          c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
          ziel.appendChild(c);
        }
      }
      if (!vorhandenSha) await dateiSchreiben(sha, file).catch(() => {});
      const geladen: Geladen = { name, sha, typ: istPdf ? "pdf" : "bild", url, text, seiten };
      setG(geladen);
      const vors = abgleichen(stein, erkenneWerte(text));
      setWahl(Object.fromEntries(vors.map((v) => [v.feld, !v.gleich && v.aktuell === null])));
      if (istPdf && !text.trim()) setFehler("Im PDF ist kein Text enthalten (eingescannt). Bitte die Werte ablesen und im Reiter „Daten“ eintragen.");
    } catch (e) { setFehler((e as Error).message); }
    setLaeuft(false);
  }

  useEffect(() => () => { if (g) URL.revokeObjectURL(g.url); }, [g]);

  async function waehlen() {
    const f = await dateiWaehlen(".pdf,image/*");
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { melde("Die Datei ist größer als 25 MB.", "fehler"); return; }
    oeffnen(f, f.name);
  }
  async function alteOeffnen(sha: string, name: string) {
    const b = await dateiLesen(sha).catch(() => undefined);
    if (!b) { melde("Diese Datei liegt nur auf dem Rechner, auf dem sie geprüft wurde. Bitte erneut hochladen.", "info"); return; }
    oeffnen(b, name, sha);
  }

  function uebernehmen() {
    if (!g) return;
    const patch: Partial<Stein> = {};
    const felder: string[] = [];
    for (const v of abgleich) if (wahl[v.feld]) { (patch as any)[v.feld] = v.wert; felder.push(v.feld); }
    aendern((dd, von) => {
      const s = dd.steine.find((x) => x.id === stein.id)!;
      aendere(dd, "steine", stein.id, {
        ...patch,
        datenblaetter: [...s.datenblaetter.filter((x) => x.sha256 !== g.sha), { dateiname: g.name, sha256: g.sha, geprueft_am: new Date().toISOString(), geprueft_von: von, felder }],
      }, von, stein.version);
    }, felder.length ? `${felder.length} Werte übernommen, Datenblatt als geprüft vermerkt.` : "Datenblatt als geprüft vermerkt.");
  }

  return <div class="raster r2">
    <Karte titel="Datenblatt" rechts={<button class="btn dunkel klein" onClick={waehlen} disabled={laeuft || z.nurLesen}><Icon n="pdf" />PDF oder Foto wählen</button>}>
      {!g && !laeuft && <div class="leer"><b>Hersteller-Datenblatt hochladen</b>Das Dokument wird hier angezeigt. Aus PDFs mit Text liest das ERP Maße, Druckfestigkeit, Wasseraufnahme, Frost, Gewicht und Bedarf je m² heraus. Jeder Wert wird erst nach Ihrer Bestätigung übernommen.</div>}
      {laeuft && <p class="muted">Datei wird gelesen…</p>}
      <div class="pdf-seiten" ref={seitenRef} style={{ display: g?.typ === "pdf" ? "grid" : "none" }} />
      {g?.typ === "bild" && <div class="pdf-seiten"><img src={g.url} alt="Datenblatt" /></div>}
      {g && <p class="muted klein">{g.name}{g.seiten > 6 ? ` · ${g.seiten} Seiten, die ersten 6 werden angezeigt` : ""} · Prüfsumme {g.sha.slice(0, 12)}…</p>}
    </Karte>
    <div class="raster" style={{ alignContent: "start" }}>
      <Karte titel={`Abgleich mit ${stein.hbr_code}`}>
        {fehler && <div class="hinweisbox warn" style={{ marginBottom: 10 }}>{fehler}</div>}
        {g && g.typ === "bild" && <p class="muted" style={{ marginTop: 0 }}>Bei Fotos werden keine Werte automatisch erkannt. Werte bitte ablesen und im Reiter „Daten“ eintragen, danach hier als geprüft vermerken.</p>}
        {g && abgleich.length > 0 && <table class="t">
          <thead><tr><th></th><th>Feld</th><th>Datenblatt</th><th>Im ERP</th></tr></thead>
          <tbody>{abgleich.map((v) => <tr title={v.fundstelle}>
            <td><input type="checkbox" checked={!!wahl[v.feld]} disabled={v.gleich} onChange={() => setWahl({ ...wahl, [v.feld]: !wahl[v.feld] })} aria-label={`${v.label} übernehmen`} /></td>
            <td>{v.label}</td>
            <td><b>{String(v.wert).replace(".", ",")}</b><div class="faint klein" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>„{v.fundstelle}“</div></td>
            <td>{v.gleich ? <span class="marke ok">stimmt</span> : v.aktuell === null ? <span class="faint">leer</span> : <span class="marke warn">{String(v.aktuell).replace(".", ",")} – abweichend</span>}</td>
          </tr>)}</tbody>
        </table>}
        {g && g.typ === "pdf" && g.text.trim() && abgleich.length === 0 && <p class="muted">Keine bekannten Werte im Text gefunden. Bitte manuell prüfen.</p>}
        {g && <div class="knopfreihe" style={{ marginTop: 12 }}>
          <button class="btn primaer" onClick={uebernehmen} disabled={z.nurLesen}>{Object.values(wahl).some(Boolean) ? "Gewählte Werte übernehmen und als geprüft vermerken" : "Als geprüft vermerken"}</button>
        </div>}
        {!g && <p class="muted" style={{ margin: 0 }}>Noch kein Datenblatt geöffnet.</p>}
        <p class="muted klein" style={{ marginBottom: 0 }}>Werte gelten für den Stein und damit für Verblender und Riemchen gemeinsam.</p>
      </Karte>
      <Karte titel="Geprüfte Datenblätter" ohnePadding>
        <table class="t"><tbody>
          {stein.datenblaetter.map((x) => <tr>
            <td><button class="btn link" onClick={() => alteOeffnen(x.sha256, x.dateiname)}>{x.dateiname}</button></td>
            <td class="muted klein">{x.geprueft_von}, {datum(x.geprueft_am)}</td>
            <td class="klein">{x.felder.length ? `${x.felder.length} Werte übernommen` : "nur geprüft"}</td>
          </tr>)}
          {!stein.datenblaetter.length && <tr><td class="leer">Noch kein Datenblatt geprüft.</td></tr>}
        </tbody></table>
      </Karte>
    </div>
  </div>;
}
