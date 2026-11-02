// Einstellungen: Allgemein, Sicherung & Daten, Stammdaten, Info.
import { useState } from "preact/hooks";
import { z, aendern, frage, melde, geraetAendern, ich } from "./store.ts";
import { ab } from "./abgeleitet.ts";
import { Seitenkopf, Karte, Feld, Text, Zahl, Icon, Auswahl } from "./ui.tsx";
import { useEffect } from "preact/hooks";
import { kiSchluesselLesen, kiSchluesselSpeichern } from "../lib/speicher.ts";
import { kiSchluesselVergessen } from "./ki.tsx";
import { KI_MODELLE, API_URL } from "../lib/ki.ts";
import { STANDARD_VORLAGEN, PLATZHALTER, alleVorlagen } from "../lib/vorlagen.ts";
import type { Vorlage } from "../lib/modell.ts";
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
      {[["allgemein", "Allgemein"], ["preise", "Preisregeln & Freigabe"], ["vorlagen", "E-Mail-Vorlagen"], ["sicherung", "Sicherung & Daten"], ["stammdaten", "Stammdaten"], ["info", "Über das ERP"]].map(([k, l]) => <button class={reiter === k ? "an" : ""} onClick={() => { location.hash = `#/einstellungen/${k}`; }}>{l}</button>)}
    </div>
    {reiter === "allgemein" && <Allgemein />}
    {reiter === "sicherung" && <SicherungSeite bestand={bestand} />}
    {reiter === "stammdaten" && <Stammdaten />}
    {reiter === "info" && <Info />}
    {reiter === "preise" && <PreisRegeln />}
    {reiter === "vorlagen" && <Vorlagen />}
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
    <KiEinstellung modell={e.ki.modell} setModell={(m) => setE({ ...e, ki: { modell: m } })} />
    <Karte titel="Angebote">
      <div class="formular">
        <Feld label="MwSt. %"><Zahl wert={e.angebot.mwst_proz} setze={(v) => an({ mwst_proz: v ?? 19 })} /></Feld>
        <Feld label="Verschnitt % (Vorgabe)"><Zahl wert={e.angebot.verschnitt_proz} setze={(v) => an({ verschnitt_proz: v ?? 0 })} /></Feld>
        <Feld label="Gültigkeit Tage"><Zahl wert={e.angebot.gueltig_tage} setze={(v) => an({ gueltig_tage: v ?? 30 })} /></Feld>
        <Feld label="Nummernpräfix" hinweis="Nummer: Präfix-Jahr-Kürzel-lfd. Nr."><Text wert={e.angebot.nummer_praefix} setze={(v) => an({ nummer_praefix: v.replace(/[^A-Za-z0-9]/g, "").slice(0, 6) })} /></Feld>
        <Feld label="Fußtext" klasse="breit"><textarea value={e.angebot.fusstext} onInput={(x) => an({ fusstext: (x.target as HTMLTextAreaElement).value })} /></Feld>
      </div>
    </Karte>
    <Karte titel="Fracht nach PLZ" rechts={<span class="muted klein">wird bei neuen Anfragen automatisch eingesetzt</span>}>
      <table class="t">
        <thead><tr><th>Zone</th><th>PLZ beginnt mit</th><th style={{ width: 90 }}>€ netto</th><th style={{ width: 90 }}>frei ab m²</th><th></th></tr></thead>
        <tbody>{e.fracht.zonen.map((zo, i) => { const setZ = (x: Partial<typeof zo>) => setE({ ...e, fracht: { ...e.fracht, zonen: e.fracht.zonen.map((y, j) => (j === i ? { ...y, ...x } : y)) } }); return <tr>
          <td><Text wert={zo.name} setze={(v) => setZ({ name: v })} aria-label="Zone" /></td>
          <td><Text wert={zo.plz} setze={(v) => setZ({ plz: v.replace(/[^\d,\s]/g, "") })} placeholder="z. B. 46,47,48" aria-label="PLZ-Anfänge" /></td>
          <td><Zahl wert={zo.betrag} setze={(v) => setZ({ betrag: v ?? 0 })} aria-label="Betrag" /></td>
          <td><Zahl wert={zo.frei_ab_m2} setze={(v) => setZ({ frei_ab_m2: v })} aria-label="frachtfrei ab" /></td>
          <td><button class="btn link klein" onClick={() => setE({ ...e, fracht: { ...e.fracht, zonen: e.fracht.zonen.filter((_, j) => j !== i) } })}>×</button></td>
        </tr>; })}</tbody>
      </table>
      <div class="knopfreihe" style={{ marginTop: 10 }}>
        <button class="btn klein" onClick={() => setE({ ...e, fracht: { ...e.fracht, zonen: [...e.fracht.zonen, { name: "Neue Zone", plz: "", betrag: 0, frei_ab_m2: null }] } })}>Zone hinzufügen</button>
        <span class="muted klein">Übrige PLZ:</span><span style={{ width: 90 }}><Zahl wert={e.fracht.sonst_betrag} setze={(v) => setE({ ...e, fracht: { ...e.fracht, sonst_betrag: v } })} aria-label="Fracht übrige PLZ" /></span><span class="muted klein">€ (leer = von Hand)</span>
      </div>
      <p class="muted klein" style={{ marginBottom: 0 }}>Die beiden Zonen sind Beispiele – bitte die echten Frachtsätze eintragen. Der längste passende PLZ-Anfang gewinnt.</p>
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
      const h = lege_an(dd, "hersteller", { id: neueId(), name: neu.name.trim(), hbr_praefix: null, woo_kategorie_id: null, im_shop_anzeigen: true, geaendert_am: new Date().toISOString() }, von);
      hid = h.id;
      lege_an(dd, "kontakte", { ...kontaktLeer(neueId(), "hersteller", h.name, new Date().toISOString(), von, h.id), aktivitaeten: [] }, von);
    }, "Hersteller angelegt (inkl. Kontakt).");
    if (ok && neu.praefix) praefixSetzen(hid, neu.praefix);
    setNeu({ name: "", praefix: "" });
  }

  return <div class="raster r2">
    <Karte titel="Hersteller und HBR-Präfixe" ohnePadding rechts={<span class="muted klein">„Im Shop zeigen“ gilt für alle Produkte des Herstellers, außer am Produkt ist etwas anderes eingestellt.</span>}>
      <table class="t">
        <thead><tr><th>Hersteller</th><th style={{ width: 90 }}>Präfix</th><th class="num">Steine</th><th title="Standard für alle Produkte dieses Herstellers; am Produkt änderbar">Im Shop zeigen</th></tr></thead>
        <tbody>{d.hersteller.map((h) => <tr>
          <td>{h.name}</td>
          <td><PraefixFeld wert={h.hbr_praefix ?? ""} setze={(v) => praefixSetzen(h.id, v)} /></td>
          <td class="num">{d.steine.filter((s) => s.hersteller_id === h.id).length}</td>
          <td><label class="check"><input type="checkbox" checked={h.im_shop_anzeigen} disabled={z.nurLesen} onChange={(e) => { const v = (e.target as HTMLInputElement).checked; aendern((dd, von) => aendere(dd, "hersteller", h.id, { im_shop_anzeigen: v, sichtbarkeit_geaendert_am: new Date().toISOString() }, von), `${h.name}: im Shop ${v ? "sichtbar" : "ausgeblendet"} (Standard).`); }} />{h.im_shop_anzeigen ? "ja" : "nein"}</label></td>
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
        <dt>Versionsregel</dt><dd>Jede ausgelieferte index.html bekommt eine neue Versionsnummer; sie steht unten rechts auf jeder Seite.</dd>
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

function KiEinstellung({ modell, setModell }: { modell: string; setModell: (m: string) => void }) {
  const [vorhanden, setVorhanden] = useState<boolean | null>(null);
  const [neu, setNeu] = useState("");
  const [test, setTest] = useState<string | null>(null);
  useEffect(() => { kiSchluesselLesen().then((k) => setVorhanden(!!k)).catch(() => setVorhanden(false)); }, []);
  async function speichern() {
    const k = neu.trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) { melde("Das sieht nicht wie ein Claude-API-Schlüssel aus (beginnt mit sk-ant-).", "fehler"); return; }
    await kiSchluesselSpeichern(k); kiSchluesselVergessen(); setNeu(""); setVorhanden(true); melde("Schlüssel in diesem Browser gespeichert.");
  }
  async function entfernen() {
    if (!(await frage("Den Schlüssel aus diesem Browser entfernen? KI-Auslesen ist danach hier nicht mehr möglich.", "Schlüssel entfernen", "Entfernen", true))) return;
    await kiSchluesselSpeichern(undefined); kiSchluesselVergessen(); setVorhanden(false); setTest(null);
  }
  async function testen() {
    setTest("Teste…");
    const k = await kiSchluesselLesen();
    try {
      const r = await fetch(API_URL, { method: "POST", headers: { "content-type": "application/json", "x-api-key": k ?? "", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: modell, max_tokens: 5, messages: [{ role: "user", content: "Antworte nur mit OK." }] }) });
      const j = await r.json().catch(() => null);
      setTest(r.ok ? `Verbindung funktioniert (${modell}).` : `Fehler ${r.status}: ${j?.error?.message ?? "unbekannt"}`);
    } catch { setTest("Keine Verbindung zur Claude-API."); }
  }
  return <Karte titel="KI: Datenblätter auslesen" rechts={<span class={`marke ${vorhanden ? "ok" : ""}`}>{vorhanden ? "eingerichtet" : "nicht eingerichtet"}</span>}>
    <p class="muted" style={{ marginTop: 0 }}>Für „Mit KI auslesen“ beim Erfassen und im Reiter Datenblatt. Abgerechnet wird über Ihr Konto in der Claude Console (ca. 2–5 Cent je Datenblatt mit Sonnet).</p>
    <div class="formular">
      <Feld label="Modell" klasse="breit"><Auswahl wert={modell} setze={setModell} optionen={KI_MODELLE} /></Feld>
      <Feld label={vorhanden ? "Neuen Schlüssel eintragen (ersetzt den alten)" : "Claude-API-Schlüssel"} klasse="breit" hinweis="Wird nur in diesem Browser auf diesem Rechner gespeichert – nicht in Sicherungsdateien, nicht auf GitHub.">
        <input type="password" autoComplete="off" spellcheck={false} placeholder="sk-ant-…" value={neu} onInput={(x) => setNeu((x.target as HTMLInputElement).value)} />
      </Feld>
    </div>
    <div class="knopfreihe" style={{ marginTop: 10 }}>
      <button class="btn dunkel" disabled={!neu.trim()} onClick={speichern}>Schlüssel speichern</button>
      {vorhanden && <button class="btn" onClick={testen}>Verbindung testen</button>}
      {vorhanden && <button class="btn gefahr" onClick={entfernen}>Entfernen</button>}
      {test && <span class="klein">{test}</span>}
    </div>
    <ul class="muted klein" style={{ marginBottom: 0, paddingLeft: 18 }}>
      <li>Empfehlung: in der Claude Console einen eigenen Schlüssel nur für das ERP anlegen und ein monatliches Ausgabenlimit setzen.</li>
      <li>Jeder, der an diesem Rechner in diesem Browser das ERP öffnet, kann den Schlüssel nutzen. Auf gemeinsam genutzten Rechnern nach der Arbeit entfernen.</li>
      <li>Die Modellauswahl gilt für alle (wird mit den Einstellungen gespeichert), der Schlüssel nur hier.</li>
    </ul>
  </Karte>;
}

function PreisRegeln() {
  const d = z.daten;
  const [p, setP] = useState(() => structuredClone(d.einstellungen.preise));
  const geaendert = JSON.stringify(p) !== JSON.stringify(d.einstellungen.preise);
  const speichern = () => aendern((dd, von) => {
    dd.einstellungen.preise = { ...structuredClone(p), staffeln: [...p.staffeln].filter((x) => x.ab_m2 > 0).sort((a, b) => a.ab_m2 - b.ab_m2) };
    dd.aenderungen.push({ zeit: new Date().toISOString(), von, tabelle: "einstellungen", id: 0, aktion: "aendern", felder: null, text: "Preisregeln geändert" });
  }, "Preisregeln gespeichert. Sie gelten für neue und geänderte Positionen.");
  return <div class="raster r2">
    <Karte titel="Preisstaffel (Rabatt nach Menge je Position)">
      <table class="t"><thead><tr><th>ab m²</th><th>Rabatt %</th><th></th></tr></thead>
        <tbody>{p.staffeln.map((s, i) => <tr>
          <td><Zahl wert={s.ab_m2} setze={(v) => setP({ ...p, staffeln: p.staffeln.map((x, j) => (j === i ? { ...x, ab_m2: v ?? 0 } : x)) })} aria-label="ab m²" /></td>
          <td><Zahl wert={s.rabatt_proz} setze={(v) => setP({ ...p, staffeln: p.staffeln.map((x, j) => (j === i ? { ...x, rabatt_proz: v ?? 0 } : x)) })} aria-label="Rabatt" /></td>
          <td><button class="btn link klein" onClick={() => setP({ ...p, staffeln: p.staffeln.filter((_, j) => j !== i) })}>×</button></td>
        </tr>)}</tbody></table>
      <button class="btn klein" style={{ marginTop: 10 }} onClick={() => setP({ ...p, staffeln: [...p.staffeln, { ab_m2: 0, rabatt_proz: 0 }] })}>Stufe hinzufügen</button>
      <p class="muted klein" style={{ marginBottom: 0 }}>Gilt automatisch für jede Artikelposition nach ihrer Menge (inkl. Verschnitt). Ein von Hand eingetragener Rabatt hat Vorrang; mit „Staffel“ lässt er sich zurücksetzen. Die Werte sind Beispiele.</p>
    </Karte>
    <div class="raster" style={{ alignContent: "start" }}>
      <Karte titel="Mindermengenzuschlag">
        <div class="formular">
          <Feld label="Wenn Gesamtmenge unter m²" hinweis="leer = nie"><Zahl wert={p.mindermenge.unter_m2} setze={(v) => setP({ ...p, mindermenge: { ...p.mindermenge, unter_m2: v } })} /></Feld>
          <Feld label="Zuschlag € netto"><Zahl wert={p.mindermenge.betrag} setze={(v) => setP({ ...p, mindermenge: { ...p.mindermenge, betrag: v ?? 0 } })} /></Feld>
        </div>
        <p class="muted klein" style={{ marginBottom: 0 }}>Wird im Angebot als eigene Zeile ausgewiesen und lässt sich je Angebot überschreiben.</p>
      </Karte>
      <Karte titel="Vier-Augen-Freigabe">
        <Feld label="Freigabe durch zweite Person ab € netto" hinweis="leer = keine Freigabe nötig"><Zahl wert={p.vier_augen_ab} setze={(v) => setP({ ...p, vier_augen_ab: v })} /></Feld>
        <p class="muted klein" style={{ marginBottom: 0 }}>Ab dieser Summe kann ein Angebot erst als versendet markiert werden, wenn jemand anderes als der Ersteller es freigegeben hat.</p>
      </Karte>
      <div class="knopfreihe">
        <button class="btn primaer" disabled={!geaendert || z.nurLesen} onClick={speichern}><Icon n="sichern" />Speichern</button>
        <button class="btn" disabled={!geaendert} onClick={() => setP(structuredClone(d.einstellungen.preise))}>Verwerfen</button>
      </div>
    </div>
  </div>;
}

function Vorlagen() {
  const d = z.daten;
  const liste = alleVorlagen(d);
  const [id, setId] = useState(liste[0].id);
  const original = liste.find((x) => x.id === id) ?? liste[0];
  const [e, setE] = useState<Vorlage>(() => structuredClone(original));
  const istStandard = STANDARD_VORLAGEN.some((x) => x.id === e.id);
  const angepasst = (d.einstellungen.vorlagen ?? []).some((x) => x.id === e.id);
  const geaendert = JSON.stringify(e) !== JSON.stringify(original);
  const waehlen = (nid: string) => { setId(nid); setE(structuredClone(liste.find((x) => x.id === nid)!)); };
  const speichern = () => aendern((dd, von) => {
    dd.einstellungen.vorlagen = [...(dd.einstellungen.vorlagen ?? []).filter((x) => x.id !== e.id), structuredClone(e)];
    dd.aenderungen.push({ zeit: new Date().toISOString(), von, tabelle: "einstellungen", id: 0, aktion: "aendern", felder: null, text: `E-Mail-Vorlage „${e.titel}“ geändert` });
  }, "Vorlage gespeichert.");
  async function zuruecksetzen() {
    if (istStandard && !(await frage(`„${e.titel}“ auf den Standardtext zurücksetzen?`, "Zurücksetzen", "Zurücksetzen"))) return;
    if (!istStandard && !(await frage(`Vorlage „${e.titel}“ löschen?`, "Löschen", "Löschen", true))) return;
    aendern((dd) => { dd.einstellungen.vorlagen = (dd.einstellungen.vorlagen ?? []).filter((x) => x.id !== e.id); });
    const s = STANDARD_VORLAGEN.find((x) => x.id === e.id);
    if (s) setE(structuredClone(s)); else waehlen(STANDARD_VORLAGEN[0].id);
  }
  function neu() {
    const v: Vorlage = { id: `eigen-${Date.now()}`, titel: "Neue Vorlage", situation: "Eigene", betreff: "", text: "{anrede},\n\n\n\nMit freundlichen Grüßen\n{bearbeiter}\n{firma}" };
    aendern((dd) => { dd.einstellungen.vorlagen = [...(dd.einstellungen.vorlagen ?? []), v]; });
    setId(v.id); setE(v);
  }
  return <div class="raster" style={{ gridTemplateColumns: "240px minmax(0,1fr) 260px" }}>
    <Karte ohnePadding titel="Vorlagen" rechts={<button class="btn klein" onClick={neu} disabled={z.nurLesen}>Neu</button>}>
      <div style={{ padding: 8, display: "grid", gap: 4 }}>{[...new Set(liste.map((x) => x.situation))].map((sit) => <div>
        <div class="faint klein" style={{ margin: "6px 4px 2px" }}>{sit}</div>
        {liste.filter((x) => x.situation === sit).map((x) => <button class={`chip ${x.id === id ? "an" : ""}`} style={{ width: "100%", borderRadius: 6, marginBottom: 4, justifyContent: "flex-start" }} onClick={() => waehlen(x.id)}>{x.titel}{(d.einstellungen.vorlagen ?? []).some((y) => y.id === x.id) && STANDARD_VORLAGEN.some((y) => y.id === x.id) ? " ·" : ""}</button>)}
      </div>)}</div>
    </Karte>
    <Karte titel={e.titel} rechts={angepasst && istStandard ? <span class="marke info">angepasst</span> : undefined}>
      <div class="formular" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Feld label="Name"><Text wert={e.titel} setze={(v) => setE({ ...e, titel: v })} /></Feld>
        <Feld label="Situation"><Text wert={e.situation} setze={(v) => setE({ ...e, situation: v })} /></Feld>
        <Feld label="Betreff" klasse="breit"><Text wert={e.betreff} setze={(v) => setE({ ...e, betreff: v })} /></Feld>
        <Feld label="Text" klasse="breit"><textarea rows={18} value={e.text} onInput={(x) => setE({ ...e, text: (x.target as HTMLTextAreaElement).value })} style={{ fontFamily: "var(--mono)", fontSize: 12.5 }} /></Feld>
      </div>
      <div class="knopfreihe" style={{ marginTop: 10 }}>
        <button class="btn primaer" disabled={!geaendert || z.nurLesen} onClick={speichern}><Icon n="sichern" />Speichern</button>
        <button class="btn" disabled={!geaendert} onClick={() => setE(structuredClone(original))}>Verwerfen</button>
        {(angepasst || !istStandard) && <button class="btn gefahr" onClick={zuruecksetzen}>{istStandard ? "Auf Standard zurücksetzen" : "Löschen"}</button>}
      </div>
    </Karte>
    <Karte titel="Platzhalter">
      <p class="muted klein" style={{ marginTop: 0 }}>Werden beim Schreiben aus dem Vorgang gefüllt. Text in [eckigen Klammern] füllen Sie selbst.</p>
      <dl class="dl klein" style={{ gridTemplateColumns: "auto 1fr" }}>{PLATZHALTER.map(([k, t]) => <><dt class="mono">{k}</dt><dd>{t}</dd></>)}</dl>
    </Karte>
  </div>;
}
