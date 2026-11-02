// Sicherung: Ordner, automatische Sicherung, JSON-Export/-Import mit Zusammenführen.
import { useEffect, useState } from "preact/hooks";
import { z, aendern, sichern, melde, neuZeichnen, geraetAendern, datenErsetzen, frage, fremdeErledigt, fremdeSuchen, fremdeOeffnen, ich, sicherungFaellig } from "./store.ts";
import { Dialog, Karte, Icon, relZeit, datumZeit, Feld, Auswahl } from "./ui.tsx";
import { pruefeSicherung, vergleiche, fuehreZusammen, type Vergleich } from "../lib/sicherung.ts";
import { ordnerWaehlen, ordnerFreigeben, ordnerVergessen, ordnerStatus, sicherungenAuflisten, ausOrdnerLesen, dateiWaehlen, type SicherungsDatei } from "../lib/speicher.ts";
import { datenAusBestand } from "../lib/modell.ts";
import type { Bestand } from "../../src/import/bestand.ts";

const TAB_LABEL: Record<keyof Vergleich, string> = {
  produkte: "Produkte", steine: "Steine", kontakte: "Kontakte", vorgaenge: "Anfragen/Angebote", bilder: "Bilder", referenzen: "Referenzen", hersteller: "Hersteller", hinweise: "Hinweise",
};

export async function jsonEinlesen() {
  const f = await dateiWaehlen(".json,application/json");
  if (!f) return;
  try {
    const p = pruefeSicherung(JSON.parse(await f.text()));
    if (!p.ok) { melde(p.fehler, "fehler"); return; }
    z.importAngebot = { daten: p.daten, quelle: f.name };
    neuZeichnen();
  } catch (e) { melde(`Die Datei ist kein gültiges JSON: ${(e as Error).message}`, "fehler"); }
}

/** Dialog: Vorschau, dann Zusammenführen (Standard) oder Ersetzen. */
export function ImportDialog() {
  const a = z.importAngebot!;
  const [modus, setModus] = useState<"zusammen" | "ersetzen">("zusammen");
  const [laeuft, setLaeuft] = useState(false);
  const v = vergleiche(z.daten, a.daten);
  const vorschau = fuehreZusammen(z.daten, a.daten);
  const schliessen = () => { z.importAngebot = null; neuZeichnen(); };
  const verwerfen = () => { if (a.dateiZeit) fremdeErledigt(a.dateiZeit); schliessen(); };

  async function los() {
    setLaeuft(true);
    if (modus === "ersetzen") {
      if (!(await frage(`Der aktuelle Stand in diesem Browser wird vollständig durch „${a.quelle}“ ersetzt. Vorher wird automatisch eine Sicherung des aktuellen Stands angelegt.`, "Stand ersetzen?", "Ersetzen", true))) { setLaeuft(false); return; }
      await datenErsetzen(a.daten, `Stand ersetzt durch ${a.quelle}`);
      melde("Stand ersetzt.");
    } else {
      await sichern(false, "vor-zusammenfuehren");
      const ok = aendern((d, von) => {
        const r = fuehreZusammen(d, a.daten);
        Object.assign(d, r.daten);
        d.aenderungen.push({ zeit: new Date().toISOString(), von, tabelle: "system", id: 0, aktion: "aendern", felder: null, text: `Zusammengeführt mit ${a.quelle}: ${r.uebernommen} Datensätze übernommen, ${r.konflikte.length} Konflikte` });
      });
      if (ok) melde(`${vorschau.uebernommen} Datensätze übernommen${vorschau.konflikte.length ? `, ${vorschau.konflikte.length} Konflikte – siehe Verlauf` : ""}.`);
    }
    if (a.dateiZeit) fremdeErledigt(a.dateiZeit);
    setLaeuft(false);
    schliessen();
  }

  return <Dialog titel="Sicherung einlesen" breit onClose={schliessen} fuss={<>
    <span class="links muted klein">Quelle: {a.quelle} · gespeichert {datumZeit(a.daten.gespeichert_am)}</span>
    {a.dateiZeit && <button class="btn" onClick={verwerfen}>Nicht übernehmen</button>}
    <button class="btn" onClick={schliessen}>Abbrechen</button>
    <button class={`btn ${modus === "ersetzen" ? "gefahr" : "primaer"}`} disabled={laeuft || z.nurLesen} onClick={los}>{modus === "ersetzen" ? "Stand ersetzen" : `Zusammenführen (${vorschau.uebernommen})`}</button>
  </>}>
    <div class="raster r2" style={{ marginBottom: 16 }}>
      <label class={`karte karte-inhalt check ${modus === "zusammen" ? "an" : ""}`} style={{ alignItems: "flex-start", borderColor: modus === "zusammen" ? "var(--ink)" : undefined }}>
        <input type="radio" checked={modus === "zusammen"} onChange={() => setModus("zusammen")} />
        <span><b>Zusammenführen</b> (empfohlen)<br /><span class="muted klein">Neue Datensätze kommen dazu. Bei Datensätzen, die auf beiden Seiten geändert wurden, gewinnt die jüngere Änderung. Gelöschtes bleibt gelöscht. Ihre Einstellungen bleiben.</span></span>
      </label>
      <label class="karte karte-inhalt check" style={{ alignItems: "flex-start", borderColor: modus === "ersetzen" ? "var(--bad)" : undefined }}>
        <input type="radio" checked={modus === "ersetzen"} onChange={() => setModus("ersetzen")} />
        <span><b>Ersetzen</b><br /><span class="muted klein">Der Stand in diesem Browser wird verworfen und durch die Datei ersetzt. Vorher wird automatisch gesichert.</span></span>
      </label>
    </div>
    <table class="t">
      <thead><tr><th>Bereich</th><th class="num">Neu</th><th class="num">Dort neuer</th><th class="num">Hier neuer</th><th class="num">Gleich</th><th class="num">Nur hier</th></tr></thead>
      <tbody>{(Object.keys(TAB_LABEL) as (keyof Vergleich)[]).map((t) => <tr>
        <td>{TAB_LABEL[t]}</td>
        <td class="num">{v[t].neu || "–"}</td><td class="num">{v[t].neuer || "–"}</td><td class="num faint">{v[t].aelter || "–"}</td>
        <td class="num faint">{v[t].gleich}</td><td class="num faint">{v[t].nur_hier || "–"}</td>
      </tr>)}</tbody>
    </table>
    {modus === "zusammen" && vorschau.konflikte.length > 0 && <div class="hinweisbox warn" style={{ marginTop: 12, display: "block" }}>
      <b>{vorschau.konflikte.length} Konflikte werden nicht automatisch gelöst:</b>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{vorschau.konflikte.slice(0, 12).map((k) => <li>{k}</li>)}</ul>
      {vorschau.konflikte.length > 12 && <span class="klein">… und {vorschau.konflikte.length - 12} weitere</span>}
    </div>}
    {modus === "ersetzen" && <p class="muted klein" style={{ marginTop: 12 }}>Hier geändert und dort nicht vorhanden: {Object.values(v).reduce((s, x) => s + x.nur_hier + x.aelter, 0)} Datensätze gehen beim Ersetzen verloren.</p>}
  </Dialog>;
}

export function SicherungSeite({ bestand }: { bestand: Bestand }) {
  const g = z.geraet;
  const [dateien, setDateien] = useState<SicherungsDatei[] | null>(null);
  const [ordnerName, setOrdnerName] = useState<string>("");
  const laden = async () => {
    z.ordner = await ordnerStatus();
    if (z.ordner === "erlaubt") { setDateien(await sicherungenAuflisten()); fremdeSuchen(); }
    else setDateien(null);
    neuZeichnen();
  };
  useEffect(() => { laden(); }, []);

  async function waehlen() {
    try {
      const n = await ordnerWaehlen(); setOrdnerName(n);
      z.ordner = "erlaubt";
      await sichern(false);
      await laden();
    } catch (e) { if ((e as Error).name !== "AbortError") melde(`Ordner konnte nicht gewählt werden: ${(e as Error).message}`, "fehler"); }
  }

  async function ausDatei(f: SicherungsDatei) {
    try {
      const p = pruefeSicherung(JSON.parse(await ausOrdnerLesen(f.name)));
      if (!p.ok) { melde(p.fehler, "fehler"); return; }
      z.importAngebot = { daten: p.daten, quelle: f.name }; neuZeichnen();
    } catch (e) { melde(`${f.name}: ${(e as Error).message}`, "fehler"); }
  }

  async function zuruecksetzen() {
    if (!(await frage("Alle Daten in diesem Browser werden auf den Shop-Stand vom 02.11.2026 zurückgesetzt. Eigene Änderungen, Kontakte und Angebote gehen verloren. Vorher wird automatisch eine Sicherung angelegt.", "Auf Shop-Stand zurücksetzen?", "Zurücksetzen", true))) return;
    await datenErsetzen(datenAusBestand(bestand, new Date().toISOString(), ich()), "Auf Shop-Stand zurückgesetzt");
    melde("Daten zurückgesetzt.");
  }

  const ordnerText = {
    nicht_unterstuetzt: "Dieser Browser kann keinen Ordner dauerhaft beschreiben (das können Chrome und Edge). Sicherungen werden heruntergeladen.",
    keiner: "Noch kein Sicherungsordner gewählt.",
    erlaubt: `Sicherungsordner ${ordnerName ? `„${ordnerName}“ ` : ""}ist verbunden.`,
    freigeben: "Der Sicherungsordner ist gewählt, muss aber nach einem Neustart des Browsers einmal freigegeben werden.",
  }[z.ordner];

  return <div class="raster r-2-1">
    <div class="raster">
      <Karte titel="Sicherungsordner" rechts={<span class={`marke ${z.ordner === "erlaubt" ? "ok" : z.ordner === "freigeben" ? "warn" : ""}`}>{z.ordner === "erlaubt" ? "verbunden" : z.ordner === "freigeben" ? "Freigabe nötig" : z.ordner === "keiner" ? "nicht gewählt" : "nicht verfügbar"}</span>}>
        <p style={{ marginTop: 0 }}>{ordnerText}</p>
        <div class="knopfreihe">
          {z.ordner !== "nicht_unterstuetzt" && <button class="btn dunkel" onClick={waehlen}><Icon n="ordner" />{z.ordner === "keiner" ? "Ordner wählen oder anlegen" : "Anderen Ordner wählen"}</button>}
          {z.ordner === "freigeben" && <button class="btn primaer" onClick={async () => { if (await ordnerFreigeben()) { melde("Ordner freigegeben."); laden(); } }}>Ordner freigeben</button>}
          {(z.ordner === "erlaubt" || z.ordner === "freigeben") && <button class="btn gefahr" onClick={async () => { await ordnerVergessen(); laden(); }}>Verbindung trennen</button>}
        </div>
        <p class="muted klein" style={{ marginBottom: 0 }}>Tipp: Liegt der Ordner in einem gemeinsamen Cloud-Ordner (OneDrive, Dropbox, Netzlaufwerk), sieht das ERP die Sicherungen der Kollegen und bietet an, deren Änderungen zu übernehmen. Im Dialog können Sie mit „Neuer Ordner“ auch direkt einen Ordner anlegen, z. B. „Klinkerhandel-ERP-Sicherung“.</p>
      </Karte>

      <Karte titel="Automatische Sicherung">
        <div class="formular">
          <label class="check breit"><input type="checkbox" checked={g.auto_an} onChange={(e) => geraetAendern({ auto_an: (e.target as HTMLInputElement).checked })} /> Automatisch sichern, wenn sich etwas geändert hat</label>
          <Feld label="Abstand">
            <Auswahl wert={String(g.intervall_min)} setze={(v) => geraetAendern({ intervall_min: Number(v) })} optionen={[["15", "alle 15 Minuten"], ["30", "alle 30 Minuten"], ["60", "alle 60 Minuten"], ["120", "alle 2 Stunden"]]} />
          </Feld>
          <Feld label="Eigene automatische Sicherungen aufbewahren" hinweis="Löscht nur automatische Sicherungen dieses Bearbeiters im Sicherungsordner.">
            <Auswahl wert={String(g.behalten_tage)} setze={(v) => geraetAendern({ behalten_tage: Number(v) })} optionen={[["0", "alle behalten"], ["30", "30 Tage"], ["90", "90 Tage"]]} />
          </Feld>
        </div>
        <dl class="dl" style={{ marginTop: 14 }}>
          <dt>Letzte Sicherung</dt><dd>{g.letzte_sicherung ? `${datumZeit(g.letzte_sicherung)} (${relZeit(g.letzte_sicherung)})` : "noch keine"}</dd>
          <dt>Datei</dt><dd class="mono">{g.letzte_sicherung_datei ?? "–"}</dd>
          <dt>Ungesicherte Änderungen</dt><dd>{sicherungFaellig() ? <span class="marke warn">ja, seit {relZeit(z.daten.gespeichert_am)}</span> : <span class="marke ok">nein</span>}</dd>
        </dl>
        {z.ordner !== "erlaubt" && <p class="muted klein">Ohne verbundenen Ordner erinnert das ERP nach Ablauf des Abstands an eine Sicherung als Download.</p>}
      </Karte>

      {dateien && <Karte titel="Sicherungen im Ordner" rechts={<button class="btn klein" onClick={laden}>Aktualisieren</button>} ohnePadding>
        <div class="tabelle-wrap" style={{ maxHeight: 360 }}>
          <table class="t">
            <thead><tr><th>Datei</th><th>Von</th><th>Zeit</th><th class="num">Größe</th><th></th></tr></thead>
            <tbody>
              {dateien.slice(0, 100).map((f) => <tr>
                <td class="mono klein">{f.name}</td>
                <td>{f.von ? decodeURIComponent(f.von) : "–"} {f.auto && <span class="marke">auto</span>}</td>
                <td class="nowrap">{relZeit(new Date(f.geaendert).toISOString())}</td>
                <td class="num">{(f.groesse / 1024 / 1024).toFixed(1).replace(".", ",")} MB</td>
                <td><button class="btn klein" onClick={() => ausDatei(f)}>Einlesen…</button></td>
              </tr>)}
              {!dateien.length && <tr><td colSpan={5} class="muted">Noch keine Sicherungen im Ordner.</td></tr>}
            </tbody>
          </table>
        </div>
      </Karte>}
    </div>

    <div class="raster" style={{ alignContent: "start" }}>
      <Karte titel="Jetzt sichern">
        <p style={{ marginTop: 0 }} class="muted">Speichert den kompletten Stand als JSON-Datei ({z.ordner === "erlaubt" ? "in den Sicherungsordner" : "als Download"}).</p>
        <div class="knopfreihe">
          <button class="btn primaer" disabled={z.sicherungLaeuft} onClick={() => sichern(false)}><Icon n="sichern" />Sicherung erstellen</button>
          {z.ordner === "erlaubt" && <button class="btn" onClick={() => { import("../lib/speicher.ts").then((m) => m.herunterladen(m.sicherungsName(ich(), false), JSON.stringify(z.daten))); }}><Icon n="download" />Als Download</button>}
        </div>
      </Karte>
      <Karte titel="Sicherung einlesen">
        <p style={{ marginTop: 0 }} class="muted">JSON-Datei eines Kollegen oder eines älteren Stands. Vor dem Übernehmen sehen Sie, was sich ändert.</p>
        <button class="btn dunkel" disabled={z.nurLesen} onClick={jsonEinlesen}><Icon n="upload" />JSON-Datei wählen…</button>
        {z.fremde.length > 0 && <div style={{ marginTop: 12 }} class="raster">
          {z.fremde.map((f) => <div class="hinweisbox"><span>Neuer Stand von <b>{decodeURIComponent(f.von ?? "")}</b>, {relZeit(new Date(f.geaendert).toISOString())}</span><div class="knopfreihe"><button class="btn klein" onClick={() => fremdeOeffnen(f)}>Ansehen</button></div></div>)}
        </div>}
      </Karte>
      <Karte titel="Wichtig zu wissen">
        <ul style={{ margin: 0, paddingLeft: 18 }} class="klein">
          <li>Die Daten liegen in diesem Browser auf diesem Rechner. Ein anderer Rechner oder Browser hat einen eigenen Stand.</li>
          <li>Browserdaten löschen entfernt auch die ERP-Daten. Darum regelmäßig sichern.</li>
          <li>Sicherungsdateien enthalten Einkaufspreise und Kundendaten. Nicht ins öffentliche GitHub-Repository hochladen.</li>
        </ul>
      </Karte>
      <Karte titel="Gefahrenbereich">
        <button class="btn gefahr" disabled={z.nurLesen} onClick={zuruecksetzen}>Auf Shop-Stand zurücksetzen…</button>
      </Karte>
    </div>
  </div>;
}

/** Hinweise oben auf jeder Seite: Freigabe, fremde Stände, Erinnerung. */
export function SicherungsBanner() {
  const g = z.geraet;
  const out = [];
  if (z.ordner === "freigeben") out.push(<div class="hinweisbox warn banner"><Icon n="ordner" /><span>Der Sicherungsordner muss nach dem Browser-Neustart einmal freigegeben werden, damit automatisch gesichert werden kann.</span>
    <div class="knopfreihe"><button class="btn primaer klein" onClick={async () => { if (await ordnerFreigeben()) { z.ordner = "erlaubt"; melde("Ordner freigegeben."); fremdeSuchen(); neuZeichnen(); } }}>Freigeben</button></div></div>);
  for (const f of z.fremde) out.push(<div class="hinweisbox banner"><Icon n="verlauf" /><span>Im Sicherungsordner liegt ein neuerer Stand von <b>{decodeURIComponent(f.von ?? "")}</b> ({relZeit(new Date(f.geaendert).toISOString())}).</span>
    <div class="knopfreihe"><button class="btn klein" onClick={() => fremdeErledigt(f.geaendert)}>Ignorieren</button><button class="btn dunkel klein" onClick={() => fremdeOeffnen(f)}>Ansehen und übernehmen</button></div></div>);
  if (z.sicherungsFehler) out.push(<div class="hinweisbox bad banner"><Icon n="warnung" /><span>{z.sicherungsFehler}</span><div class="knopfreihe"><button class="btn klein" onClick={() => sichern(false)}>Erneut versuchen</button></div></div>);
  const ueberfaellig = sicherungFaellig() && (!g.letzte_sicherung || Date.now() - Date.parse(g.letzte_sicherung) > g.intervall_min * 60000)
    && Date.now() - Date.parse(z.daten.gespeichert_am) < 7 * 86400000;
  if (ueberfaellig && z.ordner !== "erlaubt" && z.ordner !== "freigeben" && !z.nurLesen)
    out.push(<div class="hinweisbox warn banner"><Icon n="sichern" /><span>Es gibt Änderungen seit der letzten Sicherung ({relZeit(g.letzte_sicherung)}).</span>
      <div class="knopfreihe">{z.ordner === "keiner" && <a class="btn klein" href="#/einstellungen/sicherung">Ordner einrichten</a>}<button class="btn primaer klein" onClick={() => sichern(false)}>Jetzt sichern</button></div></div>);
  return <>{out}</>;
}
