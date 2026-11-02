// Anfragen & Angebote: Erfassen, Positionen rechnen, Status führen, Angebot drucken.
import { useState } from "preact/hooks";
import { z, aendern, frage, melde, ich } from "./store.ts";
import { ab, kontaktName } from "./abgeleitet.ts";
import { Seitenkopf, Karte, Icon, Feld, Text, Zahl, Auswahl, geheZu, queryParam, datum, useSortierung, relZeit } from "./ui.tsx";
import { VORGANG_STATUS, VORGANG_UEBERGANG, kontaktLeer, heute, aktuellerPreis, type Vorgang, type VorgangStatus, type Position } from "../lib/modell.ts";
import { aendere, lege_an, loesche, neueId } from "../lib/aendern.ts";
import { positionRechnen, positionNetto, positionAusProdukt, summen, naechsteNummer, euro, zahl } from "../lib/angebot.ts";

const QUELLE = { telefon: "Telefon", email: "E-Mail", website: "Website-Formular", vor_ort: "Vor Ort", sonstige: "Sonstige" };
const STATUS_MARKE: Record<VorgangStatus, string> = { neu: "info", in_bearbeitung: "warn", angebot_erstellt: "dunkel", gesendet: "", angenommen: "ok", abgelehnt: "bad", archiviert: "" };
const bearbeitbar = (s: VorgangStatus) => s === "neu" || s === "in_bearbeitung" || s === "angebot_erstellt";

export function VorgangListe() {
  const d = z.daten, a = ab();
  const [status, setStatus] = useState(queryParam("status") ?? "_offen");
  const [q, setQ] = useState("");
  const liste = d.vorgaenge.filter((v) => (status === "_offen" ? !["angenommen", "abgelehnt", "archiviert"].includes(v.status) : !status || v.status === status)
    && (!q || `${v.nummer} ${v.betreff} ${kontaktName(a.kontakte.get(v.kontakt_id ?? -1))} ${v.lieferort_ort} ${v.lieferort_plz}`.toLowerCase().includes(q.toLowerCase())));
  const mw = d.einstellungen.angebot.mwst_proz;
  const { sortiert, Kopf } = useSortierung<Vorgang>(liste, "datum", { datum: (v) => v.datum + v.nummer, nummer: (v) => v.nummer, netto: (v) => summen(v, mw).netto, status: (v) => v.status });
  const volumen = liste.reduce((s, v) => s + summen(v, mw).netto, 0);
  return <>
    <Seitenkopf titel="Anfragen & Angebote" text={`${liste.length} Vorgänge · ${euro(volumen)} netto`}>
      <a class="btn primaer" href="#/angebote/neu"><Icon n="plus" />Neue Anfrage</a>
    </Seitenkopf>
    <Karte ohnePadding>
      <div class="filterleiste">
        <input type="search" placeholder="Suche: Nummer, Kunde, Ort…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <div class="chips">{([["_offen", "Offen"], ["", "Alle"], ...Object.entries(VORGANG_STATUS)] as [string, string][]).map(([k, l]) =>
          <button class={`chip ${status === k ? "an" : ""}`} onClick={() => setStatus(k)}>{l} <span class="faint">{k === "_offen" ? a.vorgaengeOffen : k ? d.vorgaenge.filter((v) => v.status === k).length : d.vorgaenge.length}</span></button>)}</div>
      </div>
      <div class="tabelle-wrap">
        <table class="t">
          <thead><tr><Kopf feld="nummer">Nummer</Kopf><Kopf feld="datum">Datum</Kopf><th>Kunde</th><th>Betreff</th><th>Lieferort</th><th class="num">Pos.</th><Kopf feld="netto" klasse="num">Netto</Kopf><Kopf feld="status">Status</Kopf><th>Bearbeitet</th></tr></thead>
          <tbody>{[...sortiert].reverse().map((v) => <tr class="klickbar" onClick={() => geheZu(`angebote/${v.id}`)}>
            <td class="mono">{v.nummer}</td><td>{datum(v.datum)}</td><td>{kontaktName(a.kontakte.get(v.kontakt_id ?? -1))}</td>
            <td>{v.betreff || <span class="faint">–</span>}</td><td>{[v.lieferort_plz, v.lieferort_ort].filter(Boolean).join(" ") || <span class="faint">–</span>}</td>
            <td class="num">{v.positionen.length}</td><td class="num">{euro(summen(v, mw).netto)}</td>
            <td><span class={`marke ${STATUS_MARKE[v.status]}`}>{VORGANG_STATUS[v.status]}</span></td>
            <td class="faint klein nowrap">{v.geaendert_von}, {relZeit(v.geaendert_am)}</td>
          </tr>)}
          {!sortiert.length && <tr><td colSpan={9} class="leer">Keine Vorgänge. Eine Anfrage legen Sie über „Neue Anfrage“ oder direkt beim Kunden an.</td></tr>}</tbody>
        </table>
      </div>
    </Karte>
  </>;
}

export function NeuerVorgang() {
  const d = z.daten;
  const kontaktParam = Number(queryParam("kontakt")) || null;
  const produktParam = Number(queryParam("produkt")) || null;
  const [kontaktId, setKontaktId] = useState<number | null>(kontaktParam);
  const [neuK, setNeuK] = useState({ firma: "", nachname: "", email: "", telefon: "", plz: "", ort: "", kundentyp: "privat" as const });
  const [v, setV] = useState({ quelle: "telefon" as Vorgang["quelle"], betreff: "", lieferort_plz: "", lieferort_ort: "", wunschtermin: "", flaeche: null as number | null });
  const kunden = d.kontakte.filter((k) => k.typ === "kunde" || k.typ === "partner").sort((x, y) => kontaktName(x).localeCompare(kontaktName(y)));
  const produkt = produktParam ? ab().produkte.get(produktParam) : undefined;

  function anlegen() {
    if (!kontaktId && !neuK.firma.trim() && !neuK.nachname.trim()) { melde("Bitte einen Kunden wählen oder Firma/Name eingeben.", "fehler"); return; }
    if (neuK.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(neuK.email)) { melde("Die E-Mail-Adresse ist ungültig.", "fehler"); return; }
    const id = neueId();
    const ok = aendern((dd, von) => {
      const jetzt = new Date().toISOString();
      let kid = kontaktId;
      if (!kid) { const k = lege_an(dd, "kontakte", { ...kontaktLeer(neueId(), "kunde", neuK.firma.trim(), jetzt, von), ...neuK, firma: neuK.firma.trim(), aktivitaeten: [] }, von); kid = k.id; }
      const k = dd.kontakte.find((x) => x.id === kid)!;
      const pos: Position[] = produkt ? [positionAusProdukt(produkt, dd, v.flaeche ?? 0)] : [];
      lege_an(dd, "vorgaenge", {
        id, version: 1, erstellt_am: jetzt, geaendert_am: jetzt, geaendert_von: von, nummer: naechsteNummer(dd, von), kontakt_id: kid, status: "neu", datum: heute(),
        quelle: v.quelle, lieferort_plz: v.lieferort_plz || k.plz, lieferort_ort: v.lieferort_ort || k.ort, wunschtermin: v.wunschtermin, betreff: v.betreff || (produkt ? `Anfrage ${produkt.sku}` : ""),
        positionen: pos, fracht_netto: 0, notiz: "", angebot_am: null,
      }, von);
    }, "Anfrage angelegt.");
    if (ok) geheZu(`angebote/${id}`);
  }

  return <>
    <Seitenkopf titel="Neue Anfrage" text="Kunde und Eckdaten erfassen – Positionen und Preise folgen im nächsten Schritt.">
      <a class="btn" href="#/angebote">Abbrechen</a>
      <button class="btn primaer" onClick={anlegen} disabled={z.nurLesen}>Anlegen</button>
    </Seitenkopf>
    <div class="raster r2">
      <Karte titel="Kunde">
        <Feld label="Vorhandener Kunde"><Auswahl wert={kontaktId ? String(kontaktId) : ""} setze={(x) => setKontaktId(x ? Number(x) : null)} optionen={kunden.map((k) => [String(k.id), `${kontaktName(k)}${k.ort ? " · " + k.ort : ""}`] as [string, string])} leer="– neuer Kunde –" /></Feld>
        {!kontaktId && <div class="formular" style={{ marginTop: 12 }}>
          <Feld label="Firma"><Text wert={neuK.firma} setze={(x) => setNeuK({ ...neuK, firma: x })} /></Feld>
          <Feld label="Name"><Text wert={neuK.nachname} setze={(x) => setNeuK({ ...neuK, nachname: x })} /></Feld>
          <Feld label="Kundentyp"><Auswahl wert={neuK.kundentyp} setze={(x) => setNeuK({ ...neuK, kundentyp: x as any })} optionen={{ privat: "Privatkunde", bauunternehmen: "Bauunternehmen", architekt: "Architekt/Planer", haendler: "Händler", sonstige: "Sonstige" }} /></Feld>
          <Feld label="E-Mail"><input type="email" value={neuK.email} onInput={(e) => setNeuK({ ...neuK, email: (e.target as HTMLInputElement).value })} /></Feld>
          <Feld label="Telefon"><input type="tel" value={neuK.telefon} onInput={(e) => setNeuK({ ...neuK, telefon: (e.target as HTMLInputElement).value })} /></Feld>
          <Feld label="PLZ"><Text wert={neuK.plz} setze={(x) => setNeuK({ ...neuK, plz: x })} /></Feld>
          <Feld label="Ort"><Text wert={neuK.ort} setze={(x) => setNeuK({ ...neuK, ort: x })} /></Feld>
        </div>}
      </Karte>
      <Karte titel="Anfrage">
        <div class="formular">
          <Feld label="Eingang über"><Auswahl wert={v.quelle} setze={(x) => setV({ ...v, quelle: x })} optionen={QUELLE} /></Feld>
          <Feld label="Wunschtermin"><Text wert={v.wunschtermin} setze={(x) => setV({ ...v, wunschtermin: x })} placeholder="z. B. KW 14" /></Feld>
          <Feld label="Betreff" klasse="breit"><Text wert={v.betreff} setze={(x) => setV({ ...v, betreff: x })} placeholder="z. B. Neubau EFH Familie Meier" /></Feld>
          <Feld label="Lieferort PLZ" hinweis="leer = Adresse des Kunden"><Text wert={v.lieferort_plz} setze={(x) => setV({ ...v, lieferort_plz: x })} /></Feld>
          <Feld label="Lieferort"><Text wert={v.lieferort_ort} setze={(x) => setV({ ...v, lieferort_ort: x })} /></Feld>
          {produkt && <Feld label={`Fläche m² für ${produkt.sku}`} klasse="breit"><Zahl wert={v.flaeche} setze={(x) => setV({ ...v, flaeche: x })} /></Feld>}
        </div>
      </Karte>
    </div>
  </>;
}

export function VorgangDetail({ id, druck }: { id: number; druck?: boolean }) {
  const v = z.daten.vorgaenge.find((x) => x.id === id);
  if (!v) return <Karte><p>Vorgang nicht gefunden. <a href="#/angebote">Zur Liste</a></p></Karte>;
  return druck ? <Druck v={v} /> : <VDetail key={id} v={v} />;
}

function VDetail({ v }: { v: Vorgang }) {
  const d = z.daten, a = ab();
  const [e, setE] = useState(() => structuredClone(v));
  const [version, setVersion] = useState(v.version);
  const [suche, setSuche] = useState("");
  const k = a.kontakte.get(v.kontakt_id ?? -1);
  const mw = d.einstellungen.angebot.mwst_proz;
  const s = summen(e, mw);
  const offenBearb = bearbeitbar(v.status);
  const geaendert = JSON.stringify(e) !== JSON.stringify(v);
  const set = (x: Partial<Vorgang>) => setE({ ...e, ...x });
  const setPos = (i: number, x: Partial<Position>) => set({ positionen: e.positionen.map((p, j) => (j === i ? positionRechnen({ ...p, ...x }) : p)) });

  function hinzufuegen() {
    const t = suche.trim().toUpperCase();
    if (!t) return;
    const p = d.produkte.find((x) => x.sku?.toUpperCase() === t) ?? d.produkte.find((x) => x.sku?.toUpperCase().includes(t));
    if (!p) {
      set({ positionen: [...e.positionen, positionRechnen({ produkt_id: null, sku: "", bezeichnung: suche.trim(), flaeche_m2: 0, verschnitt_proz: 0, bedarf_stk_m2: null, menge_m2: 0, menge_stk: null, ep_netto_m2: 0, rabatt_proz: 0 })] });
    } else {
      if (!aktuellerPreis(p, "vk")) melde(`${p.sku} hat keinen VK je m² – bitte Preis eintragen.`, "info");
      set({ positionen: [...e.positionen, positionAusProdukt(p, d, 0)] });
    }
    setSuche("");
  }
  function speichern(extra: Partial<Vorgang> = {}) {
    const neu = { ...e, ...extra };
    const patch: Partial<Vorgang> = {};
    for (const f of Object.keys(neu) as (keyof Vorgang)[]) if (JSON.stringify(neu[f]) !== JSON.stringify(v[f])) (patch as any)[f] = neu[f];
    if (!Object.keys(patch).length) return true;
    const ok = aendern((dd, von) => aendere(dd, "vorgaenge", v.id, patch, von, version), "Gespeichert.");
    if (ok) { const n = z.daten.vorgaenge.find((x) => x.id === v.id)!; setE(structuredClone(n)); setVersion(n.version); }
    return ok;
  }
  async function status(neu: VorgangStatus) {
    if (neu === "angebot_erstellt") {
      if (!e.positionen.length) { melde("Ein Angebot braucht mindestens eine Position.", "fehler"); return; }
      const ohnePreis = e.positionen.filter((p) => !p.ep_netto_m2 || !p.menge_m2);
      if (ohnePreis.length && !(await frage(`${ohnePreis.length} Positionen haben keinen Preis oder keine Menge. Trotzdem als Angebot erstellen?`, "Angebot erstellen", "Erstellen"))) return;
    }
    if (neu === "archiviert" && !(await frage("Vorgang archivieren? Danach ist er nicht mehr änderbar.", "Archivieren", "Archivieren"))) return;
    speichern({ status: neu, ...(neu === "angebot_erstellt" ? { angebot_am: new Date().toISOString() } : {}) });
  }
  async function loeschen() {
    if (v.status !== "neu") { melde("Nur neue Anfragen können gelöscht werden, sonst bitte archivieren.", "fehler"); return; }
    if (!(await frage(`${v.nummer} löschen?`, "Löschen", "Löschen", true))) return;
    aendern((dd, von) => loesche(dd, "vorgaenge", v.id, von), "Gelöscht.");
    geheZu("angebote");
  }
  const mail = k?.email ? `mailto:${encodeURIComponent(k.email)}?subject=${encodeURIComponent(`Ihr Angebot ${v.nummer} – ${d.einstellungen.firma.name}`)}&body=${encodeURIComponent(
    `${k.nachname ? `${k.anrede === "Frau" ? "Sehr geehrte Frau" : k.anrede === "Herr" ? "Sehr geehrter Herr" : "Guten Tag"} ${k.nachname}` : "Sehr geehrte Damen und Herren"},\n\nvielen Dank für Ihre Anfrage. Anbei erhalten Sie unser Angebot ${v.nummer} über ${euro(s.brutto)} brutto.\n\nMit freundlichen Grüßen\n${ich()}\n${d.einstellungen.firma.name}`)}` : null;

  return <>
    <Seitenkopf titel={<span><span class="mono">{v.nummer}</span> <span class={`marke ${STATUS_MARKE[v.status]}`}>{VORGANG_STATUS[v.status]}</span></span>}
      text={<>{k ? <a href={`#/kontakte/k/${k.id}`}>{kontaktName(k)}</a> : "ohne Kunde"} · {datum(v.datum)} · {QUELLE[v.quelle]} · zuletzt {v.geaendert_von}, {relZeit(v.geaendert_am)}</>}>
      <a class="btn" href="#/angebote">← Liste</a>
      <a class="btn" href={`#/angebote/${v.id}/druck`}><Icon n="drucken" />Angebot ansehen / drucken</a>
      {mail && v.positionen.length > 0 && <a class="btn" href={mail}><Icon n="mail" />E-Mail an Kunden</a>}
    </Seitenkopf>
    <div class="knopfreihe" style={{ marginBottom: 14 }}>
      <span class="muted klein">Status ändern:</span>
      {VORGANG_UEBERGANG[v.status].map((x) => <button class={`btn klein ${x === "angebot_erstellt" || x === "angenommen" ? "dunkel" : ""}`} disabled={z.nurLesen} onClick={() => status(x)}>{VORGANG_STATUS[x]}</button>)}
      {!VORGANG_UEBERGANG[v.status].length && <span class="muted klein">abgeschlossen</span>}
    </div>
    {!offenBearb && v.status !== "archiviert" && <div class="hinweisbox" style={{ marginBottom: 12 }}>Das Angebot ist {VORGANG_STATUS[v.status].toLowerCase()} und deshalb gesperrt. Für Änderungen den Status auf „In Bearbeitung“ setzen.</div>}
    <div class="raster" style={{ gridTemplateColumns: "minmax(0,1fr) 300px" }}>
      <Karte titel="Positionen" ohnePadding>
        <div class="tabelle-wrap">
          <table class="t">
            <thead><tr><th>Artikel</th><th style={{ width: 90 }}>Fläche m²</th><th style={{ width: 75 }}>Verschn. %</th><th class="num">Menge m²</th><th class="num">Stück</th><th style={{ width: 100 }}>EP €/m²</th><th style={{ width: 70 }}>Rabatt %</th><th class="num">Gesamt</th><th></th></tr></thead>
            <tbody>
              {e.positionen.map((p, i) => <tr>
                <td>{p.produkt_id ? <a class="mono" href={`#/produkte/${p.produkt_id}`}>{p.sku}</a> : <span class="marke">frei</span>}
                  <input type="text" value={p.bezeichnung} disabled={!offenBearb} onInput={(x) => setPos(i, { bezeichnung: (x.target as HTMLInputElement).value })} style={{ marginTop: 3 }} aria-label="Bezeichnung" /></td>
                <td><Zahl wert={p.flaeche_m2} disabled={!offenBearb} setze={(x) => setPos(i, { flaeche_m2: x ?? 0 })} aria-label="Fläche" /></td>
                <td><Zahl wert={p.verschnitt_proz} disabled={!offenBearb} setze={(x) => setPos(i, { verschnitt_proz: x ?? 0 })} aria-label="Verschnitt" /></td>
                <td class="num">{zahl(p.menge_m2)}</td>
                <td class="num" title={p.bedarf_stk_m2 ? `${zahl(p.bedarf_stk_m2)} Stk/m²` : "Bedarf je m² fehlt am Produkt"}>{p.menge_stk ? zahl(p.menge_stk, 0) : <span class="faint">–</span>}</td>
                <td><Zahl wert={p.ep_netto_m2} disabled={!offenBearb} setze={(x) => setPos(i, { ep_netto_m2: x ?? 0 })} class={!p.ep_netto_m2 ? "fehler" : ""} aria-label="Einzelpreis" /></td>
                <td><Zahl wert={p.rabatt_proz} disabled={!offenBearb} setze={(x) => setPos(i, { rabatt_proz: x ?? 0 })} aria-label="Rabatt" /></td>
                <td class="num">{euro(positionNetto(p))}</td>
                <td>{offenBearb && <button class="btn klein link" onClick={() => set({ positionen: e.positionen.filter((_, j) => j !== i) })} aria-label="Position entfernen">×</button>}</td>
              </tr>)}
              {!e.positionen.length && <tr><td colSpan={9} class="leer">Noch keine Positionen.</td></tr>}
            </tbody>
          </table>
        </div>
        {offenBearb && <div class="filterleiste" style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}>
          <input type="text" list="sku-liste" placeholder="Artikelnummer (z. B. HBR 11-110) oder freier Text" style={{ maxWidth: 380 }} value={suche} onInput={(x) => setSuche((x.target as HTMLInputElement).value)} onKeyDown={(x) => { if (x.key === "Enter") hinzufuegen(); }} />
          <button class="btn" onClick={hinzufuegen}><Icon n="plus" />Position</button>
          <datalist id="sku-liste">{d.produkte.filter((p) => p.sku && p.status !== "archiviert").map((p) => <option value={p.sku!} />)}</datalist>
          <span class="muted klein">Menge = Fläche + Verschnitt, Stück nach Bedarf je m² aufgerundet.</span>
        </div>}
      </Karte>
      <div class="raster" style={{ alignContent: "start" }}>
        <Karte titel="Summe">
          <dl class="dl" style={{ gridTemplateColumns: "1fr auto" }}>
            <dt>Ware netto</dt><dd class="num">{euro(s.waren)}</dd>
            <dt>Fracht netto</dt><dd><Zahl wert={e.fracht_netto} disabled={!offenBearb} setze={(x) => set({ fracht_netto: x ?? 0 })} style={{ width: 100, textAlign: "right" }} aria-label="Fracht" /></dd>
            <dt>Netto</dt><dd class="num"><b>{euro(s.netto)}</b></dd>
            <dt>MwSt. {mw} %</dt><dd class="num">{euro(s.mwst)}</dd>
            <dt><b>Brutto</b></dt><dd class="num"><b>{euro(s.brutto)}</b></dd>
          </dl>
        </Karte>
        <Karte titel="Eckdaten">
          <div class="formular" style={{ gridTemplateColumns: "1fr" }}>
            <Feld label="Betreff"><Text wert={e.betreff} setze={(x) => set({ betreff: x })} /></Feld>
            <div class="formular" style={{ gridTemplateColumns: "90px 1fr" }}>
              <Feld label="PLZ"><Text wert={e.lieferort_plz} setze={(x) => set({ lieferort_plz: x })} /></Feld>
              <Feld label="Lieferort"><Text wert={e.lieferort_ort} setze={(x) => set({ lieferort_ort: x })} /></Feld>
            </div>
            <Feld label="Wunschtermin"><Text wert={e.wunschtermin} setze={(x) => set({ wunschtermin: x })} /></Feld>
            <Feld label="Eingang über"><Auswahl wert={e.quelle} setze={(x) => set({ quelle: x })} optionen={QUELLE} /></Feld>
            <Feld label="Interne Notiz"><textarea value={e.notiz} onInput={(x) => set({ notiz: (x.target as HTMLTextAreaElement).value })} /></Feld>
          </div>
        </Karte>
        <div class="knopfreihe">
          <button class="btn primaer" disabled={!geaendert || z.nurLesen} onClick={() => speichern()}><Icon n="sichern" />Speichern</button>
          <button class="btn" disabled={!geaendert} onClick={() => setE(structuredClone(v))}>Verwerfen</button>
          {v.status === "neu" && <button class="btn gefahr" onClick={loeschen}>Löschen</button>}
        </div>
      </div>
    </div>
  </>;
}

function Druck({ v }: { v: Vorgang }) {
  const d = z.daten, a = ab();
  const k = a.kontakte.get(v.kontakt_id ?? -1);
  const f = d.einstellungen.firma, an = d.einstellungen.angebot;
  const s = summen(v, an.mwst_proz);
  const gueltig = new Date(Date.parse(v.angebot_am ?? v.datum) + an.gueltig_tage * 86400000).toISOString();
  return <>
    <div class="knopfreihe nicht-drucken" style={{ marginBottom: 14 }}>
      <a class="btn" href={`#/angebote/${v.id}`}>← Zurück zum Vorgang</a>
      <button class="btn primaer" onClick={() => print()}><Icon n="drucken" />Drucken / als PDF speichern</button>
      {v.status === "neu" || v.status === "in_bearbeitung" ? <span class="marke warn">Entwurf – noch nicht als Angebot erstellt</span> : null}
    </div>
    <div class="angebot-blatt">
      <div class="kopfzeile">
        <div><div class="mark" style={{ width: 40, height: 28, marginBottom: 8 }}><i /><i /><i /><i /><i /><i /><i /></div><b style={{ fontSize: 15 }}>{f.name}</b><div style={{ color: "#555" }}>{[f.strasse, [f.plz, f.ort].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div></div>
        <div style={{ textAlign: "right", color: "#555" }}>{f.telefon && <div>Tel. {f.telefon}</div>}{f.email && <div>{f.email}</div>}{f.web && <div>{f.web}</div>}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
        <div>{k ? <>{k.firma && <div>{k.firma}</div>}{(k.vorname || k.nachname) && <div>{[k.anrede, k.vorname, k.nachname].filter(Boolean).join(" ")}</div>}{k.strasse && <div>{k.strasse}</div>}<div>{[k.plz, k.ort].filter(Boolean).join(" ")}</div></> : null}</div>
        <table style={{ width: "auto", marginTop: 0 }}><tbody>
          <tr><td style={{ border: 0, color: "#555" }}>Angebot</td><td style={{ border: 0 }}><b>{v.nummer}</b></td></tr>
          <tr><td style={{ border: 0, color: "#555" }}>Datum</td><td style={{ border: 0 }}>{datum(v.angebot_am ?? v.datum)}</td></tr>
          <tr><td style={{ border: 0, color: "#555" }}>Gültig bis</td><td style={{ border: 0 }}>{datum(gueltig)}</td></tr>
          <tr><td style={{ border: 0, color: "#555" }}>Bearbeiter</td><td style={{ border: 0 }}>{v.geaendert_von}</td></tr>
        </tbody></table>
      </div>
      <h1>Angebot{v.betreff ? `: ${v.betreff}` : ""}</h1>
      {(v.lieferort_plz || v.lieferort_ort) && <div style={{ color: "#555" }}>Lieferort: {[v.lieferort_plz, v.lieferort_ort].filter(Boolean).join(" ")}{v.wunschtermin ? ` · Wunschtermin: ${v.wunschtermin}` : ""}</div>}
      <table>
        <thead><tr><th>Pos.</th><th>Artikel</th><th style={{ textAlign: "right" }}>Menge</th><th style={{ textAlign: "right" }}>EP netto</th><th style={{ textAlign: "right" }}>Gesamt netto</th></tr></thead>
        <tbody>{v.positionen.map((p, i) => <tr>
          <td>{i + 1}</td>
          <td><b>{p.sku}</b> {p.bezeichnung}<div style={{ color: "#666", fontSize: 11.5 }}>{zahl(p.flaeche_m2)} m² Fläche{p.verschnitt_proz ? ` + ${zahl(p.verschnitt_proz)} % Verschnitt` : ""}{p.menge_stk ? ` · ca. ${zahl(p.menge_stk, 0)} Stück` : ""}{p.rabatt_proz ? ` · ${zahl(p.rabatt_proz)} % Rabatt` : ""}</div></td>
          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{zahl(p.menge_m2)} m²</td>
          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{euro(p.ep_netto_m2)}</td>
          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{euro(positionNetto(p))}</td>
        </tr>)}</tbody>
      </table>
      <table style={{ width: 300, marginLeft: "auto" }}><tbody class="summe">
        <tr class="summe"><td>Ware netto</td><td style={{ textAlign: "right" }}>{euro(s.waren)}</td></tr>
        {v.fracht_netto ? <tr class="summe"><td>Fracht netto</td><td style={{ textAlign: "right" }}>{euro(v.fracht_netto)}</td></tr> : null}
        <tr class="summe"><td>Summe netto</td><td style={{ textAlign: "right" }}>{euro(s.netto)}</td></tr>
        <tr class="summe"><td>MwSt. {an.mwst_proz} %</td><td style={{ textAlign: "right" }}>{euro(s.mwst)}</td></tr>
        <tr class="summe"><td><b>Gesamt brutto</b></td><td style={{ textAlign: "right" }}><b>{euro(s.brutto)}</b></td></tr>
      </tbody></table>
      <p style={{ marginTop: 28, color: "#444", whiteSpace: "pre-wrap" }}>{an.fusstext}</p>
      {f.ust_id && <p style={{ color: "#777", fontSize: 11 }}>USt-IdNr. {f.ust_id}</p>}
    </div>
  </>;
}
