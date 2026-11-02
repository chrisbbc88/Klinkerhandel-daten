// Datenblätter: PDF-Leser (pdf.js, bei Bedarf geladen) und Liste der geprüften Datenblätter eines Steins.
import { Karte, datum } from "./ui.tsx";
import { melde } from "./store.ts";
import { dateiLesen } from "../lib/speicher.ts";
import type { Stein } from "../lib/modell.ts";
import { feldLabel } from "./abgeleitet.ts";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
let pdfLaden: Promise<any> | null = null;
export function pdfjs(): Promise<any> {
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

export function GepruefteDatenblaetter({ stein }: { stein: Stein }) {
  async function oeffnen(sha: string) {
    const b = await dateiLesen(sha).catch(() => undefined);
    if (!b) { melde("Die Datei liegt nur im Browser des Rechners, auf dem sie geprüft wurde.", "info"); return; }
    window.open(URL.createObjectURL(b), "_blank", "noopener");
  }
  return <Karte titel="Geprüfte Datenblätter" ohnePadding>
    <table class="t"><tbody>
      {stein.datenblaetter.map((x) => <tr>
        <td><button class="btn link" onClick={() => oeffnen(x.sha256)}>{x.dateiname}</button></td>
        <td class="muted klein">{x.geprueft_von}, {datum(x.geprueft_am)}</td>
        <td class="klein">{x.felder.length ? x.felder.map(feldLabel).join(", ") : "nur geprüft"}</td>
      </tr>)}
      {!stein.datenblaetter.length && <tr><td class="leer">Noch kein Datenblatt geprüft.</td></tr>}
    </tbody></table>
  </Karte>;
}
