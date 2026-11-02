// Einstellungen: Allgemein, Sicherung & Daten, Stammdaten, Info.
import { useState } from "preact/hooks";
import { z, aendern, frage, melde, geraetAendern, ich } from "./store.ts";
import { ab } from "./abgeleitet.ts";
import { Seitenkopf, Karte, Feld, Text, Zahl, Icon } from "./ui.tsx";
import { SicherungSeite } from "./sicherung.tsx";
import { kontaktLeer, type Einstellungen as E } from "../lib/modell.ts";
import { aendere, lege_an, neueId } from "../lib/aendern.ts";
import type { Bestand } from "../../src/import/bestand.ts";

declare const __VERSION__: string;

export function Einstellungen({ sub, bestand }: { sub?: string; bestand: Bestand }) {
  const reiter = sub ?? "allgemein";
  return <>
    <Seitenkopf titel="Einstellungen" />
    <div class="reiter">
      {[["allgemein", "Allgemein"], ["sicherung", "Sicherung & Daten"], ["stammdaten", "Stammdaten"], ["info", "Über das ERP"]].map(([k, l]) => <button class={reiter === k ? "an" : ""} onClick={() => { location.hash = `#/einstellungen/${k}`; }}>{l}</button>)}
    </div>
    {reiter === "allgemein" && <Allgemein />}
    {reiter === "sicherung" && <SicherungSeite bestand={bestand} />}
    {reiter === "stammdaten" && <Stammdaten />}
    {reiter === "info" && <Info />}
  </>;
}

function Allgemein() {
  const d = z.daten;
  const [e, setE] = useState<E>(() => structuredClone(d.einstellungen));
  const [neuName, setNeuName] = useState("");
  const geaendert = JSON.stringify(e) !== JSON.stringify(d.einstellungen);
  const speichern = () => aendern((dd, von) => {
    dd.aenderungen.push({ zeit: new Date().toISOString(), von, tabelle: "einstellungen", id: 0, aktion: "aendern", felder: null, text: "Einstellungen geändert" });
    dd.einstellungen = structuredClone(e);
  }, "Einstellungen gespeichert.");
  const f = (x: Partial<E["firma"]>) => setE({ ...e, firma: { ...e.firma, ...x } });
  const an = (x: Partial<E["angebot"]>) => setE({ ...e, angebot: { ...e.angebot, ...x } });
  return <div class="raster r2">
    <Karte titel="Bearbeiter">
      <p class="muted" style={{ marginTop: 0 }}>Wer an diesem Rechner arbeitet, wird bei jeder Änderung vermerkt. Das ist keine Anmeldung mit Passwort – die kommt mit der Server-Version.</p>
      <Feld label="An diesem Rechner arbeitet"><select value={z.geraet.bearbeiter ?? ""} onChange={(x) => geraetAendern({ bearbeiter: (x.target as HTMLSelectElement).value || null })}>
        {e.bearbeiter.map((b) => <option value={b}>{b}</option>)}</select></Feld>
      <div class="chips" style={{ margin: "12px 0" }}>{e.bearbeiter.map((b) => <span class="chip">{b}<button class="btn link" aria-label={`${b} entfernen`} onClick={() => setE({ ...e, bearbeiter: e.bearbeiter.filter((x) => x !== b) })} disabled={b === ich()}>×</button></span>)}</div>
      <div class="knopfreihe"><input type="text" placeholder="Name" style={{ maxWidth: 200 }} value={neuName} onInput={(x) => setNeuName((x.target as HTMLInputElement).value)} />
        <button class="btn" disabled={!neuName.trim() || e.bearbeiter.includes(neuName.trim())} onClick={() => { setE({ ...e, bearbeiter: [...e.bearbeiter, neuName.trim()] }); setNeuName(""); }}>Hinzufügen</button></div>
    </Karte>
    <Karte titel="Firma (für Angebote)">
      <div class="formular">
        <Feld label="Name" klasse="breit"><Text wert={e.firma.name} setze={(v) => f({ name: v })} /></Feld>
        <Feld label="Straße" klasse="breit"><Text wert={e.firma.strasse} setze={(v) => f({ strasse: v })} /></Feld>
        <Feld label="PLZ"><Text wert={e.firma.plz} setze={(v) => f({ plz: v })} /></Feld>
        <Feld label="Ort"><Text wert={e.firma.ort} setze={(v) => f({ ort: v })} /></Feld>
        <Feld label="Telefon"><Text wert={e.firma.telefon} setze={(v) => f({ telefon: v })} /></Feld>
        <Feld label="E-Mail"><Text wert={e.firma.email} setze={(v) => f({ email: v })} /></Feld>
        <Feld label="Web"><Text wert={e.firma.web} setze={(v) => f({ web: v })} /></Feld>
        <Feld label="USt-IdNr."><Text wert={e.firma.ust_id} setze={(v) => f({ ust_id: v })} /></Feld>
      </div>
    </Karte>
    <Karte titel="Angebote">
      <div class="formular">
        <Feld label="MwSt. %"><Zahl wert={e.angebot.mwst_proz} setze={(v) => an({ mwst_proz: v ?? 19 })} /></Feld>
        <Feld label="Verschnitt % (Vorgabe)"><Zahl wert={e.angebot.verschnitt_proz} setze={(v) => an({ verschnitt_proz: v ?? 0 })} /></Feld>
        <Feld label="Gültigkeit Tage"><Zahl wert={e.angebot.gueltig_tage} setze={(v) => an({ gueltig_tage: v ?? 30 })} /></Feld>
        <Feld label="Nummernpräfix" hinweis="Nummer: Präfix-Jahr-Kürzel-lfd. Nr."><Text wert={e.angebot.nummer_praefix} setze={(v) => an({ nummer_praefix: v.replace(/[^A-Za-z0-9]/g, "").slice(0, 6) })} /></Feld>
        <Feld label="Fußtext" klasse="breit"><textarea value={e.angebot.fusstext} onInput={(x) => an({ fusstext: (x.target as HTMLTextAreaElement).value })} /></Feld>
      </div>
    </Karte>
    <div class="knopfreihe" style={{ alignSelf: "end" }}>
      <button class="btn primaer" disabled={!geaendert || z.nurLesen} onClick={speichern}><Icon n="sichern" />Einstellungen speichern</button>
      <button class="btn" disabled={!geaendert} onClick={() => setE(structuredClone(d.einstellungen))}>Verwerfen</button>
    </div>
  </div>;
}

function Stammdaten() {
  const d = z.daten, a = ab();
  const [neu, setNeu] = useState({ name: "", praefix: "" });
  const praefixe = [...new Set(d.steine.map((s) => s.hbr_code.slice(4, 6)))].sort();
  const offen = praefixe.filter((p) => !d.hersteller.some((h) => h.hbr_praefix === p));

  async function praefixSetzen(hid: number, praefix: string) {
    const p = praefix.trim();
    if (p && !/^\d{2}$/.test(p)) { melde("Präfix: zwei Ziffern, z. B. 17.", "fehler"); return; }
    if (p && d.hersteller.some((h) => h.hbr_praefix === p && h.id !== hid)) { melde(`Präfix ${p} ist schon vergeben.`, "fehler"); return; }
    const ohne = d.steine.filter((s) => s.hbr_code.slice(4, 6) === p && !s.hersteller_id);
    const zuordnen = ohne.length > 0 && await frage(`${ohne.length} Steine mit Präfix ${p} haben noch keinen Hersteller. Sollen sie ${a.hersteller.get(hid)?.name} zugeordnet werden? Verblender und Riemchen werden mit angepasst.`, "Steine zuordnen", "Zuordnen");
    aendern((dd, von) => {
      aendere(dd, "hersteller", hid, { hbr_praefix: p || null }, von);
      if (zuordnen) for (const s of ohne) {
        aendere(dd, "steine", s.id, { hersteller_id: hid, hersteller_quelle: "praefix" }, von);
        for (const pr of dd.produkte) if (pr.stein_id === s.id) aendere(dd, "produkte", pr.id, { hersteller_id: hid }, von);
      }
    }, zuordnen ? `Präfix gesetzt, ${ohne.length} Steine zugeordnet.` : "Präfix gesetzt.");
  }
  function anlegen() {
    if (!neu.name.trim()) return;
    if (d.hersteller.some((h) => h.name.toLowerCase() === neu.name.trim().toLowerCase())) { melde("Diesen Hersteller gibt es schon.", "fehler"); return; }
    if (neu.praefix && (!/^\d{2}$/.test(neu.praefix) || d.hersteller.some((h) => h.hbr_praefix === neu.praefix))) { melde("Präfix ungültig oder schon vergeben.", "fehler"); return; }
    let hid = 0;
    const ok = aendern((dd, von) => {
      const h = lege_an(dd, "hersteller", { id: neueId(), name: neu.name.trim(), hbr_praefix: null, woo_kategorie_id: null, geaendert_am: new Date().toISOString() }, von);
      hid = h.id;
      lege_an(dd, "kontakte", { ...kontaktLeer(neueId(), "hersteller", h.name, new Date().toISOString(), von, h.id), aktivitaeten: [] }, von);
    }, "Hersteller angelegt (inkl. Kontakt).");
    if (ok && neu.praefix) praefixSetzen(hid, neu.praefix);
    setNeu({ name: "", praefix: "" });
  }

  return <div class="raster r2">
    <Karte titel="Hersteller und HBR-Präfixe" ohnePadding>
      <table class="t">
        <thead><tr><th>Hersteller</th><th style={{ width: 90 }}>Präfix</th><th class="num">Steine</th></tr></thead>
        <tbody>{d.hersteller.map((h) => <tr>
          <td>{h.name}</td>
          <td><PraefixFeld wert={h.hbr_praefix ?? ""} setze={(v) => praefixSetzen(h.id, v)} /></td>
          <td class="num">{d.steine.filter((s) => s.hersteller_id === h.id).length}</td>
        </tr>)}</tbody>
      </table>
      <div class="filterleiste" style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}>
        <input type="text" placeholder="Neuer Hersteller" style={{ maxWidth: 220 }} value={neu.name} onInput={(e) => setNeu({ ...neu, name: (e.target as HTMLInputElement).value })} />
        <input type="text" placeholder="Präfix" style={{ width: 80 }} value={neu.praefix} onInput={(e) => setNeu({ ...neu, praefix: (e.target as HTMLInputElement).value })} />
        <button class="btn" disabled={!neu.name.trim() || z.nurLesen} onClick={anlegen}>Anlegen</button>
      </div>
    </Karte>
    <div class="raster" style={{ alignContent: "start" }}>
      {offen.length > 0 && <Karte titel="Präfixe ohne Hersteller">
        <p class="muted" style={{ marginTop: 0 }}>Diese HBR-Präfixe kommen im Bestand vor, sind aber keinem Hersteller zugeordnet. Präfix links beim richtigen Hersteller eintragen oder einen neuen Hersteller anlegen.</p>
        <div class="chips">{offen.map((p) => <span class="chip mono">{p} · {d.steine.filter((s) => s.hbr_code.slice(4, 6) === p).length} Steine</span>)}</div>
      </Karte>}
      <Karte titel="Formate (Normmaße)" ohnePadding>
        <table class="t"><thead><tr><th>Kürzel</th><th>Name</th><th>Maße mm</th></tr></thead>
          <tbody>{d.formate.map((f) => <tr><td class="mono">{f.kuerzel}</td><td>{f.name}</td><td class="mono">{f.mm ? f.mm.join(" × ") : "–"}</td></tr>)}</tbody></table>
      </Karte>
      <Karte titel="Farben"><p class="muted" style={{ marginTop: 0 }}>Entsprechen den Farbkategorien im Shop.</p><div class="chips">{d.farben.map((f) => <span class="chip">{f.schluessel}</span>)}</div></Karte>
    </div>
  </div>;
}
function PraefixFeld({ wert, setze }: { wert: string; setze: (v: string) => void }) {
  const [t, setT] = useState(wert);
  return <input type="text" class="mono" value={t} maxLength={2} placeholder="–" onInput={(e) => setT((e.target as HTMLInputElement).value)} onBlur={() => { if (t !== wert) setze(t); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Präfix" />;
}

function Info() {
  const d = z.daten;
  const groesse = new Blob([JSON.stringify(d)]).size;
  return <div class="raster r2">
    <Karte titel="Klinkerhandel ERP – Testversion im Browser">
      <dl class="dl">
        <dt>Programmversion</dt><dd class="mono">{typeof __VERSION__ !== "undefined" ? __VERSION__ : "Entwicklung"}</dd>
        <dt>Datenformat</dt><dd>Schema {d.schema}</dd>
        <dt>Shop-Stand der Übernahme</dt><dd>{d.shop_stand ? new Date(d.shop_stand).toLocaleString("de-DE") : "–"}</dd>
        <dt>Datenmenge</dt><dd>{(groesse / 1024 / 1024).toFixed(1).replace(".", ",")} MB · {d.produkte.length} Produkte · {d.kontakte.length} Kontakte · {d.vorgaenge.length} Vorgänge · {d.aenderungen.length} Protokolleinträge</dd>
        <dt>Dieses Fenster</dt><dd>{z.nurLesen ? "nur lesen (ERP ist in einem anderen Tab geöffnet)" : "bearbeiten"}</dd>
      </dl>
    </Karte>
    <Karte titel="Was diese Version kann – und was nicht">
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li>Läuft komplett im Browser, Daten bleiben auf diesem Rechner. Austausch zwischen Kollegen über Sicherungsdateien (Zusammenführen mit Vorschau).</li>
        <li>Keine Anmeldung mit Passwort und keine Rechteverwaltung. Bearbeiter werden nur vermerkt.</li>
        <li>Kein direktes Veröffentlichen in WooCommerce – dafür gibt es das Shop-Paket.</li>
        <li>Datenblätter: Werte werden per Mustererkennung aus PDF-Text gelesen, nicht per KI. Eingescannte PDFs und Fotos werden angezeigt, Werte bitte ablesen.</li>
        <li>Die Server-Version (gemeinsame Datenbank, Anmeldung, Veröffentlichen per Klick) übernimmt Sicherungen dieser Version ohne Umbau.</li>
      </ul>
    </Karte>
  </div>;
}
