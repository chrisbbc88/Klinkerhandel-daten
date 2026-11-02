// Anfragen & Angebote: Pipeline, Liste, Anlage (manuell oder aus E-Mail), Bearbeitung mit Prüfliste, Aufgaben, Druck.
import { useEffect, useState } from "preact/hooks";
import { z, aendern, frage, melde, ich, neuZeichnen } from "./store.ts";
import { ab } from "./abgeleitet.ts";
import { Seitenkopf, Karte, Icon, Feld, Text, Zahl, Auswahl, Dialog, geheZu, queryParam, datum, datumZeit, useSortierung, relZeit, initialen } from "./ui.tsx";
import {
  VORGANG_STATUS, VORGANG_UEBERGANG, PRUEFSCHRITTE, VERLUSTGRUENDE, kontaktLeer, heute, aktuellerPreis, kundenZeile, kontaktAnzeige,
  type Vorgang, type VorgangStatus, type Position, type Kontakt,
} from "../lib/modell.ts";
import { aendere, lege_an, loesche, neueId } from "../lib/aendern.ts";
import { positionRechnen, positionNetto, positionAusProdukt, summen, naechsteNummer, euro, zahl } from "../lib/angebot.ts";
import { datenqualitaet, QUALITAET_TEXT, frachtFuer, statusWechsel, freigeben, pipelineKennzahlen, anfragePlanen, anfrageAnlegen, emlText, ANFRAGE_SCHEMA, ANFRAGE_ANWEISUNG, type AnfrageRoh, type AnfragePlan, type Qualitaet } from "../lib/anfrage.ts";
import { kiStrukturiert, KiFehler } from "../lib/ki.ts";
import { dateiWaehlen } from "../lib/speicher.ts";
import { kiSchluessel } from "./ki.tsx";
import { regelnAnwenden, vierAugenNoetig, erstellerVon } from "../lib/preisregeln.ts";
import { alleVorlagen, passendeVorlage, vorlageFuellen } from "../lib/vorlagen.ts";

export const QUELLE: Record<Vorgang["quelle"], string> = { telefon: "Telefon", email: "E-Mail", website: "Website-Formular", wunschliste: "Wunschliste (Website)", vor_ort: "Vor Ort", sonstige: "Sonstige" };
const STATUS_MARKE: Record<VorgangStatus, string> = { neu: "info", in_bearbeitung: "warn", angebot_erstellt: "dunkel", gesendet: "", angenommen: "ok", abgelehnt: "bad", archiviert: "" };
const SPALTEN: VorgangStatus[] = ["neu", "in_bearbeitung", "angebot_erstellt", "gesendet", "angenommen", "abgelehnt"];
const SPALTE_TITEL: Partial<Record<VorgangStatus, string>> = { in_bearbeitung: "In Bearbeitung", angebot_erstellt: "Zur Prüfung", gesendet: "Versendet" };
const bearbeitbar = (s: VorgangStatus) => s === "neu" || s === "in_bearbeitung" || s === "angebot_erstellt";

export function QualitaetMarke({ q }: { q: Qualitaet }) {
  const cls = { ok: "ok", unvollstaendig: "warn", pruefen: "warn", verdacht: "bad" }[q.stufe];
  const titel = [...q.verdacht, ...q.auffaellig, ...q.fehlt.map((f) => `fehlt: ${f}`)].join("\n");
  return <span class={`marke ${cls}`} title={titel || "Daten vollständig"}>{QUALITAET_TEXT[q.stufe]}</span>;
}

/** Statuswechsel mit Regeln; fragt bei „Verloren“ nach dem Grund. */
async function wechseln(v: Vorgang, neu: VorgangStatus, verlustgrund?: string): Promise<boolean> {
  if (neu === "archiviert" && !(await frage("Vorgang archivieren? Danach ist er nicht mehr änderbar.", "Archivieren", "Archivieren"))) return false;
  if (neu === "abgelehnt" && !verlustgrund) { z.verlustDialog = v.id; return false; }
  const ok = aendern((dd, von) => {
    const r = statusWechsel(dd, v.id, neu, von, { verlustgrund });
    if (!r.ok) throw new Error(r.fehler);
  }, neu === "angenommen" ? "Gewonnen! Die nächsten Schritte stehen jetzt als Aufgaben im Vorgang." : `Status: ${VORGANG_STATUS[neu]}`);
  return ok;
}

export function VerlustDialog() {
  const v = z.daten.vorgaenge.find((x) => x.id === z.verlustDialog);
  const [grund, setGrund] = useState(VERLUSTGRUENDE[0]);
  const [text, setText] = useState("");
  const zu = () => { z.verlustDialog = null; neuZeichnen(); };
  if (!v) return null;
  return <Dialog titel={`${v.nummer} als verloren markieren`} onClose={zu} fuss={<>
    <button class="btn" onClick={zu}>Abbrechen</button>
    <button class="btn gefahr" onClick={async () => { const g = grund === "Sonstiges" && text.trim() ? `Sonstiges: ${text.trim()}` : grund; zu(); await wechseln(v, "abgelehnt", g); }}>Als verloren markieren</button>
  </>}>
    <Feld label="Warum ist das Angebot verloren?"><Auswahl wert={grund} setze={setGrund} optionen={VERLUSTGRUENDE.map((x) => [x, x] as [string, string])} /></Feld>
    {grund === "Sonstiges" && <Feld label="Kurz beschreiben"><Text wert={text} setze={setText} /></Feld>}
    <p class="muted klein">Die Gründe werden in der Pipeline ausgewertet.</p>
  </Dialog>;
}

// ---------- Übersicht ----------
export function VorgangListe() {
  const d = z.daten, a = ab();
  const [ansicht, setAnsicht] = useState<"pipeline" | "liste">(() => { try { return (localStorage.getItem("erp-angebote-ansicht") as any) ?? "pipeline"; } catch { return "pipeline"; } });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(queryParam("status") ?? "_offen");
  const [mail, setMail] = useState(false);
  const [ziehe, setZiehe] = useState<number | null>(null);
  useEffect(() => { try { localStorage.setItem("erp-angebote-ansicht", ansicht); } catch { /* ohne Speicher */ } }, [ansicht]);
  const mw = d.einstellungen.angebot.mwst_proz;
  const kz = pipelineKennzahlen(d);
  const passt = (v: Vorgang) => !q || `${v.nummer} ${v.betreff} ${kundenZeile(a.kontakte.get(v.kontakt_id ?? -1), v)}`.toLowerCase().includes(q.toLowerCase());

  return <>
    <Seitenkopf titel="Anfragen & Angebote" text="Von der Anfrage bis zum gewonnenen Auftrag">
      <div class="chips"><button class={`chip ${ansicht === "pipeline" ? "an" : ""}`} onClick={() => setAnsicht("pipeline")}>Pipeline</button><button class={`chip ${ansicht === "liste" ? "an" : ""}`} onClick={() => setAnsicht("liste")}>Liste</button></div>
      <button class="btn" disabled={z.nurLesen} onClick={() => setMail(true)}><Icon n="mail" />Anfrage aus E-Mail</button>
      <a class="btn primaer" href="#/angebote/neu"><Icon n="plus" />Neue Anfrage</a>
    </Seitenkopf>
    <div class="raster r4" style={{ marginBottom: 16 }}>
      <div class="karte kpi"><span class="titel">Offen im Angebot</span><span class="wert">{euro(kz.offenVolumen)}</span><span class="unter">netto, ohne Gewonnen/Verloren</span></div>
      <div class="karte kpi"><span class="titel">Gewonnen</span><span class="wert" style={{ color: "var(--ok)" }}>{euro(kz.gewonnenVolumen)}</span><span class="unter">{d.vorgaenge.filter((v) => v.status === "angenommen").length} Aufträge</span></div>
      <div class="karte kpi"><span class="titel">Abschlussquote</span><span class="wert">{kz.quote === null ? "–" : `${Math.round(kz.quote * 100)} %`}</span><span class="unter">{kz.verlustgruende.length ? `häufigster Verlustgrund: ${kz.verlustgruende[0][0]}` : "gewonnen ÷ (gewonnen + verloren)"}</span></div>
      <div class="karte kpi"><span class="titel">Ø Zeit bis Angebot</span><span class="wert">{kz.zeitBisAngebotStd === null ? "–" : kz.zeitBisAngebotStd < 1 ? `${Math.round(kz.zeitBisAngebotStd * 60)} Min.` : kz.zeitBisAngebotStd < 48 ? `${kz.zeitBisAngebotStd.toFixed(1).replace(".", ",")} Std.` : `${Math.round(kz.zeitBisAngebotStd / 24)} Tage`}</span><span class="unter">Eingang bis „Angebot erstellt“ · Ziel: unter 1 Tag</span></div>
    </div>
    {kz.nachfassen.length > 0 && <div class="hinweisbox warn" style={{ marginBottom: 12 }}><Icon n="warnung" /><span><b>{kz.nachfassen.length} Angebote nachfassen</b> – seit über 7 Tagen versendet ohne Rückmeldung: {kz.nachfassen.slice(0, 5).map((v) => v.nummer).join(", ")}</span></div>}
    {ansicht === "pipeline" ? <>
      <div class="filterleiste karte" style={{ marginBottom: 12, borderRadius: 6 }}><input type="search" placeholder="Suche: Nummer, Name, Firma, Ort…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} /><span class="muted klein">Karten per Ziehen in die nächste Spalte verschieben – erlaubte Schritte sind hervorgehoben.</span></div>
      <div class="pipeline">
        {SPALTEN.map((s) => {
          const liste = d.vorgaenge.filter((v) => v.status === s && passt(v)).sort((x, y) => y.geaendert_am.localeCompare(x.geaendert_am));
          const summe = liste.reduce((x, v) => x + summen(v, mw).netto, 0);
          const zv = ziehe ? d.vorgaenge.find((v) => v.id === ziehe) : undefined;
          const erlaubt = !!zv && VORGANG_UEBERGANG[zv.status].includes(s);
          return <section class={`spalte ${erlaubt ? "ziel" : ""} ${s}`} onDragOver={(e) => { if (erlaubt) e.preventDefault(); }}
            onDrop={async (e) => { e.preventDefault(); if (zv && erlaubt) await wechseln(zv, s); setZiehe(null); }}>
            <header><b>{SPALTE_TITEL[s] ?? VORGANG_STATUS[s]}</b><span class="zahl">{liste.length}</span><span class="summe">{euro(summe)}</span></header>
            {liste.slice(0, 40).map((v) => {
              const k = a.kontakte.get(v.kontakt_id ?? -1);
              const q2 = k ? datenqualitaet(k) : null;
              const pruef = Object.keys(v.pruefung).length;
              const offeneAufgaben = v.aufgaben.filter((x) => !x.erledigt_am).length;
              return <article class="pkarte" draggable={!z.nurLesen} onDragStart={() => setZiehe(v.id)} onDragEnd={() => setZiehe(null)} onClick={() => geheZu(`angebote/${v.id}`)}>
                <div class="knopfreihe" style={{ justifyContent: "space-between", gap: 6 }}><span class="mono klein">{v.nummer}</span><span class="faint klein">{relZeit(v.geaendert_am)}</span></div>
                <div class="name">{kundenZeile(k, v)}</div>
                {v.betreff && <div class="muted klein">{v.betreff}</div>}
                <div class="knopfreihe" style={{ gap: 4, marginTop: 6 }}>
                  <b class="klein">{euro(summen(v, mw).netto)}</b>
                  {q2 && q2.stufe !== "ok" && <QualitaetMarke q={q2} />}
                  {bearbeitbar(v.status) && v.positionen.length > 0 && <span class={`marke ${pruef === PRUEFSCHRITTE.length ? "ok" : ""}`}>Prüfung {pruef}/{PRUEFSCHRITTE.length}</span>}
                  {v.quelle === "wunschliste" && <span class="marke info">Wunschliste</span>}
                  {v.status === "angebot_erstellt" && vierAugenNoetig(v, d) && !v.freigabe && <span class="marke warn">Freigabe fehlt</span>}
                  {offeneAufgaben > 0 && <span class="marke warn">{offeneAufgaben} Aufgaben</span>}
                  {v.status === "abgelehnt" && v.verlustgrund && <span class="marke">{v.verlustgrund}</span>}
                </div>
              </article>;
            })}
            {!liste.length && <p class="faint klein" style={{ padding: "6px 4px" }}>leer</p>}
          </section>;
        })}
      </div>
    </> : <Liste q={q} setQ={setQ} status={status} setStatus={setStatus} />}
    {mail && <MailAnfrage onClose={() => setMail(false)} />}
  </>;
}

function Liste({ q, setQ, status, setStatus }: { q: string; setQ: (s: string) => void; status: string; setStatus: (s: string) => void }) {
  const d = z.daten, a = ab();
  const mw = d.einstellungen.angebot.mwst_proz;
  const liste = d.vorgaenge.filter((v) => (status === "_offen" ? !["angenommen", "abgelehnt", "archiviert"].includes(v.status) : !status || v.status === status)
    && (!q || `${v.nummer} ${v.betreff} ${kundenZeile(a.kontakte.get(v.kontakt_id ?? -1), v)}`.toLowerCase().includes(q.toLowerCase())));
  const { sortiert, Kopf } = useSortierung<Vorgang>(liste, "datum", { datum: (v) => v.datum + v.nummer, nummer: (v) => v.nummer, netto: (v) => summen(v, mw).netto, status: (v) => v.status });
  return <Karte ohnePadding>
    <div class="filterleiste">
      <input type="search" placeholder="Suche: Nummer, Name, Firma, Ort…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="chips">{([["_offen", "Offen"], ["", "Alle"], ...Object.entries(VORGANG_STATUS)] as [string, string][]).map(([k, l]) =>
        <button class={`chip ${status === k ? "an" : ""}`} onClick={() => setStatus(k)}>{l} <span class="faint">{k === "_offen" ? a.vorgaengeOffen : k ? d.vorgaenge.filter((v) => v.status === k).length : d.vorgaenge.length}</span></button>)}</div>
    </div>
    <div class="tabelle-wrap">
      <table class="t">
        <thead><tr><Kopf feld="nummer">Nummer</Kopf><Kopf feld="datum">Datum</Kopf><th>Kunde · Firma · Lieferort</th><th>Betreff</th><th class="num">Pos.</th><Kopf feld="netto" klasse="num">Netto</Kopf><Kopf feld="status">Status</Kopf><th>Bearbeitet</th></tr></thead>
        <tbody>{[...sortiert].reverse().map((v) => <tr class="klickbar" onClick={() => geheZu(`angebote/${v.id}`)}>
          <td class="mono">{v.nummer}</td><td>{datum(v.datum)}</td><td>{kundenZeile(a.kontakte.get(v.kontakt_id ?? -1), v)}</td>
          <td>{v.betreff || <span class="faint">–</span>}</td><td class="num">{v.positionen.length}</td><td class="num">{euro(summen(v, mw).netto)}</td>
          <td><span class={`marke ${STATUS_MARKE[v.status]}`}>{VORGANG_STATUS[v.status]}</span></td>
          <td class="faint klein nowrap">{v.geaendert_von}, {relZeit(v.geaendert_am)}</td>
        </tr>)}
        {!sortiert.length && <tr><td colSpan={8} class="leer">Keine Vorgänge.</td></tr>}</tbody>
      </table>
    </div>
  </Karte>;
}

// ---------- Anfrage aus E-Mail ----------
function MailAnfrage({ onClose }: { onClose: () => void }) {
  const d = z.daten, a = ab();
  const [text, setText] = useState("");
  const [quelle, setQuelle] = useState<Vorgang["quelle"]>("wunschliste");
  const [schluessel, setSchluessel] = useState<string | undefined>();
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erg, setErg] = useState<{ roh: AnfrageRoh; plan: AnfragePlan } | null>(null);
  useEffect(() => { kiSchluessel().then(setSchluessel); }, []);

  async function datei() {
    const f = await dateiWaehlen(".eml,.txt,message/rfc822,text/plain");
    if (!f) return;
    const t = await f.text();
    setText(/\.eml$/i.test(f.name) || /^(Received|From|Return-Path|MIME-Version):/m.test(t) ? emlText(t) : t.slice(0, 20000));
  }
  async function auslesen() {
    if (!schluessel || !text.trim()) return;
    setLaeuft(true); setFehler(null);
    try {
      const { roh } = await kiStrukturiert<AnfrageRoh>(schluessel, d.einstellungen.ki.modell, ANFRAGE_ANWEISUNG, [{ type: "text", text: `Anfrage:\n\n${text}` }], ANFRAGE_SCHEMA, undefined, 3000);
      setErg({ roh, plan: anfragePlanen(d, roh) });
    } catch (e) { setFehler(e instanceof KiFehler ? e.message : (e as Error).message); }
    setLaeuft(false);
  }
  function anlegen() {
    if (!erg) return;
    let id = 0;
    if (aendern((dd, von) => { id = anfrageAnlegen(dd, erg.plan, erg.roh, quelle, text, von); }, "Angebotsentwurf angelegt – bitte prüfen.")) { onClose(); geheZu(`angebote/${id}`); }
  }
  const p = erg?.plan;
  const k = p ? { ...kontaktLeer(0, "kunde", "", "", ""), ...(p.kontakt.vorhanden ?? {}), ...Object.fromEntries(Object.entries(p.kontakt.neu).filter(([, v]) => v)) } as Kontakt : null;
  const mw = d.einstellungen.angebot.mwst_proz;
  return <Dialog titel="Anfrage aus E-Mail oder Wunschliste" breit onClose={onClose} fuss={<>
    <span class="links muted klein">{schluessel ? `Auslesen mit ${d.einstellungen.ki.modell}` : "Für das Auslesen wird ein Claude-API-Schlüssel benötigt (Einstellungen › Allgemein)."}</span>
    <button class="btn" onClick={onClose}>Abbrechen</button>
    {!erg ? <button class="btn primaer" disabled={!schluessel || !text.trim() || laeuft} onClick={auslesen}>{laeuft ? "KI liest die Anfrage…" : "Mit KI auslesen"}</button>
      : <button class="btn primaer" onClick={anlegen}><Icon n="check" />Angebotsentwurf anlegen</button>}
  </>}>
    {!erg && <>
      <div class="formular" style={{ gridTemplateColumns: "1fr 220px" }}>
        <Feld label="E-Mail-Text einfügen (Strg + V) oder Datei laden"><textarea rows={12} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="Kompletten Text der Anfrage hier einfügen – inklusive Absender, Adresse, Artikel und Flächen." /></Feld>
        <div class="raster" style={{ alignContent: "start" }}>
          <Feld label="Eingang über"><Auswahl wert={quelle} setze={setQuelle} optionen={QUELLE} /></Feld>
          <button class="btn" onClick={datei}><Icon n="upload" />.eml- oder Textdatei</button>
          <p class="muted klein" style={{ margin: 0 }}>Tipp: In Outlook die Mail auf den Desktop ziehen → .eml-Datei, oder einfach den Text kopieren.</p>
        </div>
      </div>
      {fehler && <div class="hinweisbox bad" style={{ marginTop: 10 }}>{fehler}</div>}
    </>}
    {erg && p && k && <div class="raster r2">
      <div class="raster" style={{ alignContent: "start" }}>
        <div class="karte karte-inhalt">
          <div class="knopfreihe" style={{ justifyContent: "space-between" }}><h3>Kunde {p.kontakt.vorhanden ? <span class="marke info">bereits vorhanden</span> : <span class="marke">wird neu angelegt</span>}</h3><QualitaetMarke q={p.qualitaet} /></div>
          <dl class="dl" style={{ marginTop: 8 }}>
            <dt>Name</dt><dd>{[k.anrede, k.vorname, k.nachname].filter(Boolean).join(" ") || "–"}</dd>
            <dt>Firma</dt><dd>{k.firma || "–"}</dd>
            <dt>Adresse</dt><dd>{[k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "–"}</dd>
            <dt>Kontakt</dt><dd>{[k.email, k.telefon].filter(Boolean).join(" · ") || "–"}</dd>
          </dl>
          {[...p.qualitaet.verdacht.map((x) => ["bad", x]), ...p.qualitaet.auffaellig.map((x) => ["warn", x]), ...p.qualitaet.fehlt.map((x) => ["warn", `fehlt: ${x}`])].map(([c, t]) => <div class={`hinweisbox ${c} klein`} style={{ marginTop: 6, padding: "4px 10px" }}>{t}</div>)}
        </div>
        <div class="karte karte-inhalt">
          <h3>Lieferung</h3>
          <dl class="dl" style={{ marginTop: 8 }}>
            <dt>Lieferort</dt><dd>{[p.lieferung.strasse, [p.lieferung.plz, p.lieferung.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "–"}</dd>
            <dt>Zeitraum</dt><dd>{p.lieferung.zeitraum || "–"}</dd>
            <dt>Fracht</dt><dd>{p.fracht ? `${euro(p.fracht.betrag)} (${p.fracht.zone})` : "keine Zone – bitte eintragen"}</dd>
            <dt>Bauvorhaben</dt><dd>{erg.roh.bauvorhaben || "–"}</dd>
          </dl>
        </div>
      </div>
      <div class="raster" style={{ alignContent: "start" }}>
        <div class="karte">
          <table class="t"><thead><tr><th>Artikel</th><th class="num">m²</th><th class="num">EP</th><th class="num">Netto</th></tr></thead>
            <tbody>{p.positionen.map((x) => <tr><td>{x.gefunden ? <span class="mono">{x.sku}</span> : <span class="marke warn">nicht gefunden</span>} <span class="klein muted">{x.gefunden ? "" : x.original}</span></td>
              <td class="num">{zahl(x.menge_m2)}</td><td class="num">{x.ep_netto_m2 ? euro(x.ep_netto_m2) : <span class="marke warn">fehlt</span>}</td><td class="num">{euro(positionNetto(x))}</td></tr>)}
              {!p.positionen.length && <tr><td colSpan={4} class="muted">keine Artikel erkannt</td></tr>}</tbody></table>
          <div class="karte-inhalt" style={{ borderTop: "1px solid var(--line)" }}><b>Entwurf: {euro(summen({ positionen: p.positionen, fracht_netto: p.fracht?.betrag ?? 0, mindermenge_netto: p.mindermenge }, mw).netto)} netto</b></div>
        </div>
        {p.hinweise.length > 0 && <div class="hinweisbox warn" style={{ display: "block" }}><b>Bitte prüfen</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }} class="klein">{p.hinweise.map((h) => <li>{h}</li>)}</ul></div>}
        <p class="muted klein" style={{ margin: 0 }}>Der Entwurf wird mit Status „In Bearbeitung“ angelegt. Versendet werden kann er erst nach der Prüfliste. {p.kontakt.vorhanden ? "Beim vorhandenen Kontakt werden nur leere Felder ergänzt." : ""}</p>
      </div>
    </div>}
  </Dialog>;
}

// ---------- Neue Anfrage (manuell) ----------
export function NeuerVorgang() {
  const d = z.daten;
  const kontaktParam = Number(queryParam("kontakt")) || null;
  const produktParam = Number(queryParam("produkt")) || null;
  const [kontaktId, setKontaktId] = useState<number | null>(kontaktParam);
  const [neuK, setNeuK] = useState({ anrede: "", vorname: "", nachname: "", firma: "", email: "", telefon: "", strasse: "", plz: "", ort: "", kundentyp: "privat" as Kontakt["kundentyp"] });
  const [v, setV] = useState({ quelle: "telefon" as Vorgang["quelle"], betreff: "", lieferort_strasse: "", lieferort_plz: "", lieferort_ort: "", wunschtermin: "", flaeche: null as number | null });
  const kunden = d.kontakte.filter((k) => k.typ === "kunde" || k.typ === "partner").sort((x, y) => kontaktAnzeige(x).localeCompare(kontaktAnzeige(y)));
  const produkt = produktParam ? ab().produkte.get(produktParam) : undefined;
  const q = !kontaktId ? datenqualitaet({ ...kontaktLeer(0, "kunde", "", "", ""), ...neuK }) : null;

  function anlegen() {
    if (!kontaktId && !neuK.firma.trim() && !neuK.nachname.trim()) { melde("Bitte einen Kunden wählen oder mindestens den Nachnamen eingeben.", "fehler"); return; }
    if (neuK.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(neuK.email)) { melde("Die E-Mail-Adresse ist ungültig.", "fehler"); return; }
    const id = neueId();
    const ok = aendern((dd, von) => {
      const jetzt = new Date().toISOString();
      let kid = kontaktId;
      if (!kid) { const k = lege_an(dd, "kontakte", { ...kontaktLeer(neueId(), "kunde", neuK.firma.trim(), jetzt, von), ...neuK, firma: neuK.firma.trim(), aktivitaeten: [] }, von); kid = k.id; }
      const k = dd.kontakte.find((x) => x.id === kid)!;
      const pos: Position[] = produkt ? [positionAusProdukt(produkt, dd, v.flaeche ?? 0)] : [];
      const plz = v.lieferort_plz || k.plz;
      const fr = frachtFuer(dd, plz, pos.reduce((s, p) => s + p.menge_m2, 0));
      lege_an(dd, "vorgaenge", {
        id, version: 1, erstellt_am: jetzt, geaendert_am: jetzt, geaendert_von: von, nummer: naechsteNummer(dd, von), kontakt_id: kid, status: "neu", datum: heute(),
        quelle: v.quelle, lieferort_strasse: v.lieferort_strasse || (v.lieferort_plz ? "" : k.strasse), lieferort_plz: plz, lieferort_ort: v.lieferort_ort || k.ort, wunschtermin: v.wunschtermin,
        betreff: v.betreff || (produkt ? `Anfrage ${produkt.sku}` : ""), fracht_netto: fr?.betrag ?? 0, notiz: "", angebot_am: null,
        statusverlauf: [{ status: "neu", zeit: jetzt, von }], pruefung: {}, aufgaben: [], verlustgrund: "", eingang_text: "", ...regelnAnwenden({ positionen: pos, mindermenge_netto: 0, mindermenge_manuell: false }, dd), freigabe: null,
      }, von);
    }, "Anfrage angelegt.");
    if (ok) geheZu(`angebote/${id}`);
  }
  const nk = (x: Partial<typeof neuK>) => setNeuK({ ...neuK, ...x });
  return <>
    <Seitenkopf titel="Neue Anfrage" text="Kunde und Eckdaten erfassen – Positionen und Preise folgen im nächsten Schritt.">
      <a class="btn" href="#/angebote">Abbrechen</a>
      <button class="btn primaer" onClick={anlegen} disabled={z.nurLesen}>Anlegen</button>
    </Seitenkopf>
    <div class="raster r2">
      <Karte titel="Kunde" rechts={q ? <QualitaetMarke q={q} /> : undefined}>
        <Feld label="Vorhandener Kunde"><Auswahl wert={kontaktId ? String(kontaktId) : ""} setze={(x) => setKontaktId(x ? Number(x) : null)} optionen={kunden.map((k) => [String(k.id), kundenZeile(k)] as [string, string])} leer="– neuer Kunde –" /></Feld>
        {!kontaktId && <div class="formular" style={{ marginTop: 12 }}>
          <Feld label="Anrede"><Auswahl wert={neuK.anrede} setze={(x) => nk({ anrede: x })} optionen={[["Frau", "Frau"], ["Herr", "Herr"]]} leer="–" /></Feld>
          <Feld label="Vorname"><Text wert={neuK.vorname} setze={(x) => nk({ vorname: x })} /></Feld>
          <Feld label="Nachname *"><Text wert={neuK.nachname} setze={(x) => nk({ nachname: x })} /></Feld>
          <Feld label="Firma (optional)"><Text wert={neuK.firma} setze={(x) => nk({ firma: x, kundentyp: x ? (neuK.kundentyp === "privat" ? "bauunternehmen" : neuK.kundentyp) : "privat" })} /></Feld>
          <Feld label="Kundentyp"><Auswahl wert={neuK.kundentyp} setze={(x) => nk({ kundentyp: x as Kontakt["kundentyp"] })} optionen={{ privat: "Privatkunde", bauunternehmen: "Bauunternehmen", architekt: "Architekt/Planer", haendler: "Händler", sonstige: "Sonstige" }} /></Feld>
          <Feld label="E-Mail"><input type="email" value={neuK.email} onInput={(e) => nk({ email: (e.target as HTMLInputElement).value })} /></Feld>
          <Feld label="Telefon"><input type="tel" value={neuK.telefon} onInput={(e) => nk({ telefon: (e.target as HTMLInputElement).value })} /></Feld>
          <Feld label="Straße" klasse="halb"><Text wert={neuK.strasse} setze={(x) => nk({ strasse: x })} /></Feld>
          <Feld label="PLZ"><Text wert={neuK.plz} setze={(x) => nk({ plz: x })} /></Feld>
          <Feld label="Ort"><Text wert={neuK.ort} setze={(x) => nk({ ort: x })} /></Feld>
        </div>}
      </Karte>
      <Karte titel="Anfrage">
        <div class="formular">
          <Feld label="Eingang über"><Auswahl wert={v.quelle} setze={(x) => setV({ ...v, quelle: x })} optionen={QUELLE} /></Feld>
          <Feld label="Wunschtermin"><Text wert={v.wunschtermin} setze={(x) => setV({ ...v, wunschtermin: x })} placeholder="z. B. KW 14" /></Feld>
          <Feld label="Betreff / Bauvorhaben" klasse="breit"><Text wert={v.betreff} setze={(x) => setV({ ...v, betreff: x })} placeholder="z. B. Neubau EFH Familie Meier" /></Feld>
          <Feld label="Lieferadresse Straße" klasse="halb" hinweis="leer = Adresse des Kunden"><Text wert={v.lieferort_strasse} setze={(x) => setV({ ...v, lieferort_strasse: x })} /></Feld>
          <Feld label="PLZ"><Text wert={v.lieferort_plz} setze={(x) => setV({ ...v, lieferort_plz: x })} /></Feld>
          <Feld label="Ort"><Text wert={v.lieferort_ort} setze={(x) => setV({ ...v, lieferort_ort: x })} /></Feld>
          {produkt && <Feld label={`Fläche m² für ${produkt.sku}`} klasse="breit"><Zahl wert={v.flaeche} setze={(x) => setV({ ...v, flaeche: x })} /></Feld>}
        </div>
      </Karte>
    </div>
  </>;
}

// ---------- Detail ----------
export function VorgangDetail({ id, druck }: { id: number; druck?: boolean }) {
  const v = z.daten.vorgaenge.find((x) => x.id === id);
  if (!v) return <Karte><p>Vorgang nicht gefunden. <a href="#/angebote">Zur Liste</a></p></Karte>;
  return druck ? <Druck v={v} /> : <VDetail key={id} v={v} />;
}

function VDetail({ v }: { v: Vorgang }) {
  const d = z.daten, a = ab();
  const [patch, setPatch] = useState<{ x: Partial<Vorgang>; ver: number }>(() => ({ x: {}, ver: v.version }));
  const e = { ...v, ...patch.x } as Vorgang;
  const offen = Object.fromEntries(Object.entries(patch.x).filter(([k, val]) => JSON.stringify(val) !== JSON.stringify((v as any)[k])));
  const geaendert = Object.keys(offen).length > 0;
  if (!geaendert && v.version !== patch.ver) patch.ver = v.version;
  const fremd = geaendert && v.version !== patch.ver;
  const [suche, setSuche] = useState("");
  const k = a.kontakte.get(v.kontakt_id ?? -1);
  const q = k ? datenqualitaet(k) : null;
  const mw = d.einstellungen.angebot.mwst_proz;
  const s = summen(e, mw);
  const offenBearb = bearbeitbar(v.status);
  const set = (x: Partial<Vorgang>) => setPatch({ ...patch, x: { ...patch.x, ...x } });
  /** Positionen setzen und Preisregeln (Staffel, Mindermenge) anwenden. */
  const setPositionen = (positionen: Position[], extra: Partial<Vorgang> = {}) => { const r = regelnAnwenden({ positionen, mindermenge_netto: e.mindermenge_netto, mindermenge_manuell: e.mindermenge_manuell, ...extra }, d); set({ ...extra, positionen: r.positionen, mindermenge_netto: r.mindermenge_netto }); };
  const setPos = (i: number, x: Partial<Position>) => setPositionen(e.positionen.map((p, j) => (j === i ? positionRechnen({ ...p, ...x }) : p)));
  const neuLaden = () => setPatch({ x: {}, ver: v.version });

  function hinzufuegen() {
    const t = suche.trim().toUpperCase();
    if (!t) return;
    const p = d.produkte.find((x) => x.sku?.toUpperCase() === t) ?? d.produkte.find((x) => x.sku?.toUpperCase().includes(t));
    if (!p) setPositionen([...e.positionen, positionRechnen({ produkt_id: null, sku: "", bezeichnung: suche.trim(), flaeche_m2: 0, verschnitt_proz: 0, bedarf_stk_m2: null, menge_m2: 0, menge_stk: null, ep_netto_m2: 0, rabatt_proz: 0 })]);
    else { if (!aktuellerPreis(p, "vk")) melde(`${p.sku} hat keinen VK je m² – bitte Preis eintragen.`, "info"); setPositionen([...e.positionen, positionAusProdukt(p, d, 0)]); }
    setSuche("");
  }
  function speichern(): boolean {
    if (!geaendert) return true;
    const pr = Object.keys(offen).some((x) => ["positionen", "fracht_netto", "mindermenge_netto", "lieferort_plz", "lieferort_ort", "lieferort_strasse"].includes(x)) && (Object.keys(v.pruefung).length || v.freigabe) ? { pruefung: {}, freigabe: null } : {};
    const ok = aendern((dd, von) => aendere(dd, "vorgaenge", v.id, { ...offen, ...pr } as Partial<Vorgang>, von, patch.ver), Object.keys(pr).length ? "Gespeichert. Die Prüfliste wurde zurückgesetzt, weil sich Positionen oder Lieferung geändert haben." : "Gespeichert.");
    if (ok) setPatch({ x: {}, ver: z.daten.vorgaenge.find((x) => x.id === v.id)!.version });
    return ok;
  }
  async function status(neu: VorgangStatus) { if (geaendert && !speichern()) return; await wechseln(z.daten.vorgaenge.find((x) => x.id === v.id)!, neu); }
  function pruefen(key: string) {
    if (geaendert) { melde("Bitte zuerst speichern, dann prüfen.", "info"); return; }
    aendern((dd, von) => {
      const cur = dd.vorgaenge.find((x) => x.id === v.id)!;
      const pr = { ...cur.pruefung };
      if (pr[key]) delete pr[key]; else pr[key] = { von, zeit: new Date().toISOString() };
      aendere(dd, "vorgaenge", v.id, { pruefung: pr }, von);
    });
  }
  function aufgabe(id: number) {
    aendern((dd, von) => {
      const cur = dd.vorgaenge.find((x) => x.id === v.id)!;
      aendere(dd, "vorgaenge", v.id, { aufgaben: cur.aufgaben.map((x) => x.id !== id ? x : x.erledigt_am ? { ...x, erledigt_am: null, erledigt_von: null } : { ...x, erledigt_am: new Date().toISOString(), erledigt_von: von }) }, von);
    });
  }
  function frachtNachPlz() {
    const f = frachtFuer(d, e.lieferort_plz, e.positionen.reduce((x, p) => x + p.menge_m2, 0));
    if (!f) { melde("Für diese PLZ ist keine Frachtzone hinterlegt (Einstellungen › Allgemein).", "info"); return; }
    set({ fracht_netto: f.betrag }); melde(`Fracht ${euro(f.betrag)} (${f.zone}).`, "info");
  }
  async function loeschen() {
    if (v.status !== "neu" && v.status !== "in_bearbeitung") { melde("Nur Anfragen ohne Angebot können gelöscht werden, sonst bitte archivieren.", "fehler"); return; }
    if (!(await frage(`${v.nummer} löschen?`, "Löschen", "Löschen", true))) return;
    aendern((dd, von) => loesche(dd, "vorgaenge", v.id, von), "Gelöscht.");
    geheZu("angebote");
  }
  const anrede = k?.nachname ? `${k.anrede === "Frau" ? "Sehr geehrte Frau" : k.anrede === "Herr" ? "Sehr geehrter Herr" : "Guten Tag"} ${k.nachname}` : "Sehr geehrte Damen und Herren";
  const mail = k?.email ? `mailto:${encodeURIComponent(k.email)}?subject=${encodeURIComponent(`Ihr Angebot ${v.nummer} – ${d.einstellungen.firma.name}`)}&body=${encodeURIComponent(
    `${anrede},\n\nvielen Dank für Ihre Anfrage. Anbei erhalten Sie unser Angebot ${v.nummer} über ${euro(s.brutto)} brutto.\n\nMit freundlichen Grüßen\n${ich()}\n${d.einstellungen.firma.name}`)}` : null;
  const pruefOk = PRUEFSCHRITTE.every(([key]) => v.pruefung[key]);
  const vierAugen = vierAugenNoetig(v, d);
  const ersteller = erstellerVon(v);
  const versandOk = pruefOk && (!vierAugen || !!v.freigabe);
  const [mailOffen, setMailOffen] = useState(false);
  function freigeben_() {
    aendern((dd, von) => { const r = freigeben(dd, v.id, von); if (!r.ok) throw new Error(r.fehler); }, "Angebot freigegeben (Vier-Augen).");
  }

  return <>
    <Seitenkopf titel={<span><span class="mono">{v.nummer}</span> <span class={`marke ${STATUS_MARKE[v.status]}`}>{VORGANG_STATUS[v.status]}</span></span>}
      text={<>{k ? <a href={`#/kontakte/k/${k.id}`}>{kundenZeile(k, v)}</a> : "ohne Kunde"} · {datum(v.datum)} · {QUELLE[v.quelle]} · zuletzt {v.geaendert_von}, {relZeit(v.geaendert_am)}</>}>
      <a class="btn" href="#/angebote">← Übersicht</a>
      <a class="btn" href={`#/angebote/${v.id}/druck`}><Icon n="drucken" />Angebot ansehen / drucken</a>
      <button class="btn dunkel" onClick={() => setMailOffen(true)}><Icon n="mail" />E-Mail schreiben</button>
    </Seitenkopf>
    <div class="knopfreihe" style={{ marginBottom: 14 }}>
      <span class="muted klein">Nächster Schritt:</span>
      {VORGANG_UEBERGANG[v.status].map((x) => <button class={`btn klein ${x === "angenommen" ? "primaer" : x === "abgelehnt" ? "gefahr" : x === "angebot_erstellt" || x === "gesendet" ? "dunkel" : ""}`}
        disabled={z.nurLesen || (x === "gesendet" && !versandOk)} title={x === "gesendet" && !pruefOk ? "Erst die Prüfliste abhaken" : x === "gesendet" && !versandOk ? "Vier-Augen-Freigabe fehlt" : ""} onClick={() => status(x)}>{x === "angebot_erstellt" ? "Angebot erstellt → zur Prüfung" : x === "gesendet" ? "Als versendet markieren" : VORGANG_STATUS[x]}</button>)}
      {!VORGANG_UEBERGANG[v.status].length && <span class="muted klein">abgeschlossen</span>}
    </div>
    {fremd && <div class="hinweisbox warn" style={{ marginBottom: 12 }}><span>Der Vorgang wurde inzwischen anderweitig geändert. Speichern ist gesperrt.</span><div class="knopfreihe"><button class="btn klein" onClick={neuLaden}>Neu laden</button></div></div>}
    {!offenBearb && v.status !== "archiviert" && v.status !== "angenommen" && <div class="hinweisbox" style={{ marginBottom: 12 }}>Das Angebot ist {VORGANG_STATUS[v.status].toLowerCase()} und deshalb gesperrt. Für Änderungen „In Bearbeitung“ wählen.</div>}
    {v.status === "abgelehnt" && v.verlustgrund && <div class="hinweisbox bad" style={{ marginBottom: 12 }}>Verloren: {v.verlustgrund}</div>}
    <div class="raster" style={{ gridTemplateColumns: "minmax(0,1fr) 320px" }}>
      <div class="raster" style={{ alignContent: "start" }}>
        {v.status === "angenommen" && <Karte titel="Gewonnen – nächste Schritte" rechts={<span class="marke ok">{v.aufgaben.filter((x) => x.erledigt_am).length}/{v.aufgaben.length} erledigt</span>}>
          <ul class="pruefliste">{v.aufgaben.map((x) => <li style={{ gridTemplateColumns: "24px 1fr auto" }}>
            <input type="checkbox" checked={!!x.erledigt_am} disabled={z.nurLesen} onChange={() => aufgabe(x.id)} aria-label={x.text} />
            <span style={{ textDecoration: x.erledigt_am ? "line-through" : undefined, color: x.erledigt_am ? "var(--muted)" : undefined }}>{x.text}</span>
            <span class="faint klein">{x.erledigt_am ? `${x.erledigt_von}, ${datum(x.erledigt_am)}` : ""}</span>
          </li>)}</ul>
        </Karte>}
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
                  <td title={p.rabatt_manuell ? "von Hand gesetzt" : "laut Staffel"}><Zahl wert={p.rabatt_proz} disabled={!offenBearb} setze={(x) => setPos(i, { rabatt_proz: x ?? 0, rabatt_manuell: true })} aria-label="Rabatt" />
                    {p.rabatt_manuell && offenBearb && p.produkt_id ? <button class="btn link klein" onClick={() => setPos(i, { rabatt_manuell: false })}>Staffel</button> : <span class="faint klein">{p.produkt_id && p.rabatt_proz ? "Staffel" : ""}</span>}</td>
                  <td class="num">{euro(positionNetto(p))}</td>
                  <td>{offenBearb && <button class="btn klein link" onClick={() => setPositionen(e.positionen.filter((_, j) => j !== i))} aria-label="Position entfernen">×</button>}</td>
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
        <Karte titel="Eckdaten">
          <div class="formular">
            <Feld label="Betreff / Bauvorhaben" klasse="breit"><Text wert={e.betreff} setze={(x) => set({ betreff: x })} /></Feld>
            <Feld label="Lieferadresse Straße" klasse="halb"><Text wert={e.lieferort_strasse} setze={(x) => set({ lieferort_strasse: x })} /></Feld>
            <Feld label="PLZ"><Text wert={e.lieferort_plz} setze={(x) => set({ lieferort_plz: x })} /></Feld>
            <Feld label="Ort"><Text wert={e.lieferort_ort} setze={(x) => set({ lieferort_ort: x })} /></Feld>
            <Feld label="Wunschtermin"><Text wert={e.wunschtermin} setze={(x) => set({ wunschtermin: x })} /></Feld>
            <Feld label="Eingang über"><Auswahl wert={e.quelle} setze={(x) => set({ quelle: x })} optionen={QUELLE} /></Feld>
            <Feld label="Interne Notiz" klasse="breit"><textarea rows={4} value={e.notiz} onInput={(x) => set({ notiz: (x.target as HTMLTextAreaElement).value })} /></Feld>
          </div>
          {v.eingang_text && <details style={{ marginTop: 10 }}><summary class="klein muted" style={{ cursor: "pointer" }}>Original-Anfrage anzeigen</summary><pre class="klein" style={{ whiteSpace: "pre-wrap", background: "var(--surface-2)", padding: 10, borderRadius: 6, maxHeight: 300, overflow: "auto" }}>{v.eingang_text}</pre></details>}
        </Karte>
      </div>
      <div class="raster" style={{ alignContent: "start" }}>
        <Karte titel="Summe">
          <dl class="dl" style={{ gridTemplateColumns: "1fr auto" }}>
            <dt>Ware netto</dt><dd class="num">{euro(s.waren)}</dd>
            <dt>Fracht netto {offenBearb && <button class="btn link klein" onClick={frachtNachPlz}>nach PLZ</button>}</dt><dd><Zahl wert={e.fracht_netto} disabled={!offenBearb} setze={(x) => set({ fracht_netto: x ?? 0 })} style={{ width: 100, textAlign: "right" }} aria-label="Fracht" /></dd>
            <dt>Mindermenge {e.mindermenge_manuell && offenBearb && <button class="btn link klein" onClick={() => setPositionen(e.positionen, { mindermenge_manuell: false })}>automatisch</button>}</dt>
            <dd><Zahl wert={e.mindermenge_netto} disabled={!offenBearb} setze={(x) => set({ mindermenge_netto: x ?? 0, mindermenge_manuell: true })} style={{ width: 100, textAlign: "right" }} aria-label="Mindermengenzuschlag" /></dd>
            <dt>Netto</dt><dd class="num"><b>{euro(s.netto)}</b></dd>
            <dt>MwSt. {mw} %</dt><dd class="num">{euro(s.mwst)}</dd>
            <dt><b>Brutto</b></dt><dd class="num"><b>{euro(s.brutto)}</b></dd>
          </dl>
          <div class="knopfreihe" style={{ marginTop: 12 }}>
            <button class="btn primaer" disabled={!geaendert || z.nurLesen || !!fremd} onClick={() => speichern()}><Icon n="sichern" />Speichern</button>
            <button class="btn" disabled={!geaendert} onClick={neuLaden}>Verwerfen</button>
            {(v.status === "neu" || v.status === "in_bearbeitung") && <button class="btn gefahr klein" onClick={loeschen}>Löschen</button>}
          </div>
        </Karte>
        {k && <Karte titel="Kunde" rechts={q ? <QualitaetMarke q={q} /> : undefined}>
          <dl class="dl"><dt>Name</dt><dd>{[k.anrede, k.vorname, k.nachname].filter(Boolean).join(" ") || "–"}</dd><dt>Firma</dt><dd>{k.firma || "–"}</dd>
            <dt>Kontakt</dt><dd>{k.email ? <a href={`mailto:${k.email}`}>{k.email}</a> : "–"}{k.telefon && <div><a href={`tel:${k.telefon.replace(/[^\d+]/g, "")}`}>{k.telefon}</a></div>}</dd></dl>
          {q && q.stufe !== "ok" && <ul class="klein" style={{ margin: "8px 0 0", paddingLeft: 18 }}>{[...q.verdacht, ...q.auffaellig, ...q.fehlt.map((f) => `fehlt: ${f}`)].map((x) => <li>{x}</li>)}</ul>}
        </Karte>}
        {vierAugen && (offenBearb || v.status === "gesendet") && <Karte titel="Vier-Augen-Freigabe" rechts={<span class={`marke ${v.freigabe ? "ok" : "warn"}`}>{v.freigabe ? "freigegeben" : "offen"}</span>}>
          {v.freigabe ? <p style={{ margin: 0 }}>Freigegeben von <b>{v.freigabe.von}</b>, {datumZeit(v.freigabe.zeit)}.</p> : <>
            <p class="klein" style={{ marginTop: 0 }}>Ab {euro(d.einstellungen.preise.vier_augen_ab ?? 0)} netto muss eine zweite Person freigeben. Erstellt von <b>{ersteller}</b>.</p>
            <button class="btn primaer" disabled={z.nurLesen || v.status !== "angebot_erstellt" || ich() === ersteller || geaendert} onClick={freigeben_}>Als {ich()} freigeben</button>
            {ich() === ersteller && <p class="muted klein" style={{ marginBottom: 0 }}>Sie haben das Angebot erstellt – bitte eine Kollegin oder einen Kollegen freigeben lassen.</p>}
            {v.status !== "angebot_erstellt" && <p class="muted klein" style={{ marginBottom: 0 }}>Freigabe nach „Angebot erstellt“.</p>}
          </>}
          <p class="muted klein" style={{ marginBottom: 0 }}>Hinweis: In der Browser-Version gilt der gewählte Bearbeiter. Mit Anmeldung (Server-Version) ist die Freigabe fest an die Person gebunden.</p>
        </Karte>}
        {(offenBearb || v.status === "gesendet") && <Karte titel="Prüfung vor Versand" rechts={<span class={`marke ${pruefOk ? "ok" : ""}`}>{Object.keys(v.pruefung).length}/{PRUEFSCHRITTE.length}</span>}>
          <ul class="pruefliste">{PRUEFSCHRITTE.map(([key, text]) => { const p = v.pruefung[key]; return <li style={{ gridTemplateColumns: "24px 1fr" }}>
            <input type="checkbox" checked={!!p} disabled={z.nurLesen || !offenBearb} onChange={() => pruefen(key)} aria-label={text} />
            <span>{text}{p && <div class="faint klein">{p.von}, {datumZeit(p.zeit)}</div>}</span>
          </li>; })}</ul>
          <p class="muted klein" style={{ marginBottom: 0 }}>„Als versendet markieren“ geht erst, wenn alle Punkte abgehakt sind. Ändern sich Positionen oder Lieferung, wird die Prüfung zurückgesetzt.</p>
        </Karte>}
        <Karte titel="Verlauf" ohnePadding>
          <ul class="feed">{[...v.statusverlauf].reverse().map((x) => <li><span class="wer" title={x.von}>{initialen(x.von)}</span><span>{VORGANG_STATUS[x.status]}</span><span class="faint nowrap">{datumZeit(x.zeit)}</span></li>)}</ul>
        </Karte>
      </div>
    </div>
    {mailOffen && <MailDialog v={v} onClose={() => setMailOffen(false)} />}
  </>;
}

function MailDialog({ v, onClose }: { v: Vorgang; onClose: () => void }) {
  const d = z.daten, a = ab();
  const k = a.kontakte.get(v.kontakt_id ?? -1);
  const vorlagen = alleVorlagen(d);
  const [id, setId] = useState(passendeVorlage(v, k));
  const vl = vorlagen.find((x) => x.id === id) ?? vorlagen[0];
  const gefuellt = vorlageFuellen(vl, d, v, k, ich());
  const [betreff, setBetreff] = useState(gefuellt.betreff);
  const [text, setText] = useState(gefuellt.text);
  const lieferanten = d.kontakte.filter((x) => (x.typ === "lieferant" || x.typ === "hersteller") && x.email);
  const [an, setAn] = useState(id === "bestellung_lieferant" ? lieferanten[0]?.email ?? "" : k?.email ?? "");
  const [versendet, setVersendet] = useState(false);
  function waehle(nid: string) {
    const nvl = vorlagen.find((x) => x.id === nid) ?? vorlagen[0];
    const g = vorlageFuellen(nvl, d, v, k, ich());
    setId(nid); setBetreff(g.betreff); setText(g.text); setAn(nid === "bestellung_lieferant" ? lieferanten[0]?.email ?? "" : k?.email ?? "");
  }
  const darfVersendet = id === "angebot" && v.status === "angebot_erstellt";
  function vermerken(wie: string) {
    aendern((dd, von) => {
      if (k) { const kk = dd.kontakte.find((x) => x.id === k.id)!; aendere(dd, "kontakte", k.id, { aktivitaeten: [{ zeit: new Date().toISOString(), von, text: `E-Mail „${vl.titel}“ zu ${v.nummer} ${wie}` }, ...(kk.aktivitaeten ?? [])] }, von); }
    });
    if (versendet && darfVersendet) wechseln(z.daten.vorgaenge.find((x) => x.id === v.id)!, "gesendet");
  }
  const mailto = `mailto:${encodeURIComponent(an)}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
  return <Dialog titel={`E-Mail zu ${v.nummer}`} breit onClose={onClose} fuss={<>
    <span class="links muted klein">Direkt aus dem ERP senden geht mit der Server-Version (Supabase + E-Mail-Dienst oder Microsoft 365).</span>
    <button class="btn" onClick={() => { navigator.clipboard?.writeText(text).then(() => { melde("Text kopiert – Betreff steht oben."); vermerken("kopiert"); }, () => melde("Kopieren nicht möglich.", "fehler")); }}>Text kopieren</button>
    <a class="btn primaer" href={mailto} onClick={() => { vermerken("im Mailprogramm geöffnet"); onClose(); }}><Icon n="mail" />Im Mailprogramm öffnen</a>
    <button class="btn" disabled title="kommt mit der Server-Version">Direkt senden</button>
  </>}>
    <div class="raster" style={{ gridTemplateColumns: "220px 1fr" }}>
      <div class="raster" style={{ alignContent: "start", gap: 4 }}>
        {[...new Set(vorlagen.map((x) => x.situation))].map((sit) => <div>
          <div class="faint klein" style={{ margin: "6px 0 2px" }}>{sit}</div>
          {vorlagen.filter((x) => x.situation === sit).map((x) => <button class={`chip ${x.id === id ? "an" : ""}`} style={{ width: "100%", borderRadius: 6, marginBottom: 4, justifyContent: "flex-start" }} onClick={() => waehle(x.id)}>{x.titel}</button>)}
        </div>)}
        <a class="klein" href="#/einstellungen/vorlagen" onClick={onClose}>Vorlagen bearbeiten</a>
      </div>
      <div class="raster" style={{ alignContent: "start" }}>
        <div class="formular" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Feld label="An">{id === "bestellung_lieferant" && lieferanten.length ? <Auswahl wert={an} setze={setAn} optionen={lieferanten.map((x) => [x.email, `${kontaktAnzeige(x)} <${x.email}>`] as [string, string])} /> : <input type="email" value={an} onInput={(x) => setAn((x.target as HTMLInputElement).value)} />}</Feld>
          <Feld label="Betreff"><div class="knopfreihe" style={{ flexWrap: "nowrap" }}><Text wert={betreff} setze={setBetreff} /><button class="btn klein" onClick={() => navigator.clipboard?.writeText(betreff).then(() => melde("Betreff kopiert."))} title="Betreff kopieren">⧉</button></div></Feld>
        </div>
        <Feld label="Text (hier noch änderbar)"><textarea rows={16} value={text} onInput={(x) => setText((x.target as HTMLTextAreaElement).value)} style={{ fontSize: 13 }} /></Feld>
        {/\[[^\]]+\]/.test(text) && <div class="hinweisbox warn klein">Im Text stehen noch Platzhalter in eckigen Klammern, z. B. {text.match(/\[[^\]]+\]/)?.[0]} – bitte ersetzen.</div>}
        {id === "angebot" && <p class="muted klein" style={{ margin: 0 }}>Das Angebot als PDF über „Angebot ansehen / drucken“ → „Als PDF speichern“ erzeugen und anhängen.</p>}
        {darfVersendet && <label class="check"><input type="checkbox" checked={versendet} onChange={(x) => setVersendet((x.target as HTMLInputElement).checked)} /> Danach als versendet markieren (wenn Prüfung und Freigabe vollständig sind)</label>}
      </div>
    </div>
  </Dialog>;
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
      {(v.lieferort_plz || v.lieferort_ort) && <div style={{ color: "#555" }}>Lieferadresse: {[v.lieferort_strasse, [v.lieferort_plz, v.lieferort_ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}{v.wunschtermin ? ` · Wunschtermin: ${v.wunschtermin}` : ""}</div>}
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
        {v.mindermenge_netto ? <tr class="summe"><td>Mindermengenzuschlag</td><td style={{ textAlign: "right" }}>{euro(v.mindermenge_netto)}</td></tr> : null}
        <tr class="summe"><td>Summe netto</td><td style={{ textAlign: "right" }}>{euro(s.netto)}</td></tr>
        <tr class="summe"><td>MwSt. {an.mwst_proz} %</td><td style={{ textAlign: "right" }}>{euro(s.mwst)}</td></tr>
        <tr class="summe"><td><b>Gesamt brutto</b></td><td style={{ textAlign: "right" }}><b>{euro(s.brutto)}</b></td></tr>
      </tbody></table>
      <p style={{ marginTop: 28, color: "#444", whiteSpace: "pre-wrap" }}>{an.fusstext}</p>
      {f.ust_id && <p style={{ color: "#777", fontSize: 11 }}>USt-IdNr. {f.ust_id}</p>}
    </div>
  </>;
}
