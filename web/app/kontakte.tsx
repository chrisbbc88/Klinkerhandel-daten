// Kontakte: Kunden, Hersteller, Lieferanten, Partner – mit Aktivitäten, Preisanfrage und Angeboten.
import { useMemo, useState } from "preact/hooks";
import { z, aendern, frage, melde, ich } from "./store.ts";
import { ab, kontaktName, herstellerName } from "./abgeleitet.ts";
import { Seitenkopf, Karte, Icon, Feld, Text, Auswahl, Dialog, geheZu, datumZeit, datum, initialen, useSortierung, Seiten, relZeit } from "./ui.tsx";
import { kontaktLeer, VORGANG_STATUS, type Kontakt, type KontaktTyp } from "../lib/modell.ts";
import { aendere, lege_an, loesche, neueId } from "../lib/aendern.ts";
import { kontakteCsv, kontaktImportPlanen, kontaktImportAusfuehren, type KontaktZeile } from "../lib/kontaktcsv.ts";
import { herunterladen, dateiWaehlen } from "../lib/speicher.ts";
import { summen, euro } from "../lib/angebot.ts";
import { datenqualitaet } from "../lib/anfrage.ts";
import { QualitaetMarke } from "./vorgaenge.tsx";

export const TYP: Record<KontaktTyp, string> = { kunde: "Kunde", hersteller: "Hersteller", lieferant: "Lieferant", partner: "Partner" };
const TYP_PLURAL: Record<string, string> = { "": "Alle Kontakte", kunde: "Kunden", hersteller: "Hersteller", lieferant: "Lieferanten", partner: "Partner" };
export const KUNDENTYP: Record<string, string> = { "": "–", privat: "Privatkunde", bauunternehmen: "Bauunternehmen", architekt: "Architekt/Planer", haendler: "Händler", sonstige: "Sonstige" };

export function KontaktListe({ typ }: { typ: KontaktTyp | "" }) {
  const d = z.daten;
  const [q, setQ] = useState(""); const [seite, setSeite] = useState(0);
  const [imp, setImp] = useState<{ name: string; zeilen: KontaktZeile[]; fehlt: string[] } | null>(null);
  const vorgaenge = useMemo(() => { const m = new Map<number, number>(); for (const v of d.vorgaenge) if (v.kontakt_id) m.set(v.kontakt_id, (m.get(v.kontakt_id) ?? 0) + 1); return m; }, [z.rev]);
  const liste = d.kontakte.filter((k) => (!typ || k.typ === typ) && (!q || `${k.firma} ${k.vorname} ${k.nachname} ${k.email} ${k.ort} ${k.plz} ${k.telefon}`.toLowerCase().includes(q.toLowerCase())));
  const { sortiert, Kopf } = useSortierung<Kontakt>(liste, "name", { name: (k) => kontaktName(k).toLowerCase(), ort: (k) => k.ort, typ: (k) => k.typ, geaendert: (k) => k.geaendert_am });

  function neu() {
    const id = neueId();
    if (aendern((dd, von) => { lege_an(dd, "kontakte", { ...kontaktLeer(id, typ || "kunde", "", new Date().toISOString(), von), aktivitaeten: [] }, von); })) geheZu(`kontakte/k/${id}`);
  }
  async function importWaehlen() {
    const f = await dateiWaehlen(".csv,text/csv,.txt");
    if (!f) return;
    let text = await f.text();
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(await f.arrayBuffer());
    setImp({ name: f.name, ...kontaktImportPlanen(d, text, typ || "kunde") });
  }

  return <>
    <Seitenkopf titel={TYP_PLURAL[typ]} text={`${liste.length} Kontakte`}>
      <button class="btn" onClick={() => herunterladen(`kontakte_${new Date().toISOString().slice(0, 10)}.csv`, kontakteCsv(sortiert), "text/csv;charset=utf-8")}><Icon n="download" />CSV</button>
      <button class="btn" disabled={z.nurLesen} onClick={importWaehlen}><Icon n="upload" />CSV importieren</button>
      <button class="btn primaer" disabled={z.nurLesen} onClick={neu}><Icon n="plus" />Neuer {typ ? TYP[typ] : "Kontakt"}</button>
    </Seitenkopf>
    <Karte ohnePadding>
      <div class="filterleiste">
        <input type="search" placeholder="Suche: Firma, Name, Ort, E-Mail…" value={q} onInput={(e) => { setQ((e.target as HTMLInputElement).value); setSeite(0); }} />
        <div class="chips">{(["", "kunde", "hersteller", "lieferant", "partner"] as const).map((t) => <a class={`chip ${typ === t ? "an" : ""}`} href={`#/kontakte${t ? "/" + t : ""}`} style={{ textDecoration: "none" }}>{TYP_PLURAL[t]} <span class="faint">{t ? d.kontakte.filter((k) => k.typ === t).length : d.kontakte.length}</span></a>)}</div>
      </div>
      <div class="tabelle-wrap">
        <table class="t kontaktliste">
          <thead><tr><Kopf feld="name">Name</Kopf><th>{typ === "kunde" || typ === "partner" ? "Firma" : typ ? "Ansprechpartner" : "Firma / Ansprechpartner"}</th><th>Daten</th><Kopf feld="typ">Typ</Kopf><Kopf feld="ort">Ort</Kopf><th>Telefon</th><th>E-Mail</th><th class="num">Vorgänge</th><Kopf feld="geaendert">Geändert</Kopf></tr></thead>
          <tbody>{sortiert.slice(seite * 50, seite * 50 + 50).map((k) => <tr class="klickbar" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) return; geheZu(`kontakte/k/${k.id}`); }}>
            <td><b style={{ fontWeight: 500 }}>{kontaktName(k)}</b></td>
            <td>{(k.typ === "kunde" || k.typ === "partner" ? k.firma : [k.vorname, k.nachname].filter(Boolean).join(" ")) || <span class="faint">–</span>}{k.funktion && <span class="muted klein"> · {k.funktion}</span>}</td>
            <td>{k.typ === "kunde" ? <QualitaetMarke q={datenqualitaet(k)} /> : null}</td>
            <td><span class="marke">{TYP[k.typ]}</span>{k.kundentyp && <span class="muted klein"> {KUNDENTYP[k.kundentyp]}</span>}</td>
            <td>{[k.plz, k.ort].filter(Boolean).join(" ") || <span class="faint">–</span>}</td>
            <td class="nowrap">{k.telefon ? <a href={`tel:${k.telefon.replace(/[^\d+]/g, "")}`}>{k.telefon}</a> : <span class="faint">–</span>}</td>
            <td>{k.email ? <a href={`mailto:${k.email}`}>{k.email}</a> : <span class="faint">–</span>}</td>
            <td class="num">{vorgaenge.get(k.id) ?? ""}</td>
            <td class="faint klein nowrap">{relZeit(k.geaendert_am)}</td>
          </tr>)}
          {!sortiert.length && <tr><td colSpan={9} class="leer">Keine Kontakte. Legen Sie einen an oder importieren Sie eine CSV (z. B. aus Outlook oder Excel).</td></tr>}</tbody>
        </table>
      </div>
      <Seiten seite={seite} setSeite={setSeite} gesamt={sortiert.length} proSeite={50} />
    </Karte>
    {imp && <Dialog titel={`Kontakte importieren: ${imp.name}`} breit onClose={() => setImp(null)} fuss={<>
      <button class="btn" onClick={() => setImp(null)}>Abbrechen</button>
      <button class="btn primaer" disabled={!imp.zeilen.some((x) => x.aktion === "neu" || x.aktion === "aendern")} onClick={() => {
        let n = 0; if (aendern((dd, von) => { n = kontaktImportAusfuehren(dd, imp.zeilen, von); })) melde(`${n} Kontakte übernommen.`); setImp(null);
      }}>{imp.zeilen.filter((x) => x.aktion === "neu" || x.aktion === "aendern").length} übernehmen</button>
    </>}>
      {imp.fehlt.map((f) => <div class="hinweisbox bad">{f}</div>)}
      <p class="muted klein" style={{ marginTop: 0 }}>Erkannte Spalten: typ, firma, anrede, vorname, nachname, funktion, email, telefon, mobil, strasse, plz, ort, land, kundentyp, notiz (auch „E-Mail“, „Straße“, „PLZ“ …). Vorhandene Kontakte werden über Firma + E-Mail erkannt.</p>
      <table class="t"><thead><tr><th>Zeile</th><th>Name</th><th>Ergebnis</th><th>Details</th></tr></thead><tbody>
        {imp.zeilen.slice(0, 300).map((x) => <tr><td class="faint">{x.nr}</td><td>{x.name}</td><td><span class={`marke ${x.aktion === "fehler" ? "bad" : x.aktion === "neu" ? "info" : x.aktion === "aendern" ? "dunkel" : ""}`}>{{ neu: "Neu", aendern: "Änderung", gleich: "unverändert", fehler: "Fehler" }[x.aktion]}</span></td>
          <td class="klein">{x.fehler.join(" · ") || Object.entries(x.felder).map(([k, v]) => `${k}: ${v}`).join(" · ")}</td></tr>)}
      </tbody></table>
    </Dialog>}
  </>;
}

export function KontaktDetail({ id }: { id: number }) {
  const k = ab().kontakte.get(id);
  if (!k) return <Karte><p>Kontakt nicht gefunden. <a href="#/kontakte">Zur Liste</a></p></Karte>;
  return <KDetail key={id} k={k} />;
}

function KDetail({ k }: { k: Kontakt }) {
  const d = z.daten;
  const [e, setE] = useState(() => structuredClone(k));
  const [version, setVersion] = useState(k.version);
  const [notiz, setNotiz] = useState("");
  const [anfrage, setAnfrage] = useState(false);
  const geaendert = JSON.stringify({ ...e, aktivitaeten: undefined }) !== JSON.stringify({ ...k, aktivitaeten: undefined });
  const set = (x: Partial<Kontakt>) => setE({ ...e, ...x });
  const vorgaenge = d.vorgaenge.filter((v) => v.kontakt_id === k.id).sort((a, b) => b.datum.localeCompare(a.datum));

  function speichern() {
    if (!e.firma.trim() && !e.nachname.trim() && !e.email.trim()) { melde("Bitte mindestens Firma, Nachname oder E-Mail angeben.", "fehler"); return; }
    if (e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) { melde("Die E-Mail-Adresse ist ungültig.", "fehler"); return; }
    const patch: Partial<Kontakt> = {};
    for (const f of Object.keys(e) as (keyof Kontakt)[]) if (f !== "aktivitaeten" && JSON.stringify(e[f]) !== JSON.stringify(k[f])) (patch as any)[f] = e[f];
    if (aendern((dd, von) => aendere(dd, "kontakte", k.id, patch, von, version), "Kontakt gespeichert.")) setVersion(z.daten.kontakte.find((x) => x.id === k.id)!.version);
  }
  function notieren(text: string) {
    if (!text.trim()) return;
    if (aendern((dd, von) => { const kk = dd.kontakte.find((x) => x.id === k.id)!; aendere(dd, "kontakte", k.id, { aktivitaeten: [{ zeit: new Date().toISOString(), von, text: text.trim() }, ...(kk.aktivitaeten ?? [])] }, von); })) {
      setNotiz(""); setVersion(z.daten.kontakte.find((x) => x.id === k.id)!.version);
    }
  }
  async function loeschen() {
    if (vorgaenge.length) { melde("Kontakte mit Anfragen oder Angeboten können nicht gelöscht werden.", "fehler"); return; }
    if (!(await frage(`${kontaktName(k)} löschen?`, "Kontakt löschen", "Löschen", true))) return;
    aendern((dd, von) => loesche(dd, "kontakte", k.id, von), "Kontakt gelöscht.");
    geheZu(`kontakte/${k.typ}`);
  }
  function neuesAngebot() { geheZu(`angebote/neu?kontakt=${k.id}`); }

  return <>
    <Seitenkopf titel={kontaktName(k)} text={<>{TYP[k.typ]}{k.kundentyp ? ` · ${KUNDENTYP[k.kundentyp]}` : ""} · geändert {relZeit(k.geaendert_am)} von {k.geaendert_von}</>}>
      <a class="btn" href={`#/kontakte/${k.typ}`}>← {TYP_PLURAL[k.typ]}</a>
      {k.email && <a class="btn" href={`mailto:${k.email}`}><Icon n="mail" />E-Mail</a>}
      {(k.typ === "hersteller" || k.typ === "lieferant") && <button class="btn dunkel" onClick={() => setAnfrage(true)}><Icon n="mail" />Preisanfrage</button>}
      {(k.typ === "kunde" || k.typ === "partner") && <button class="btn primaer" onClick={neuesAngebot} disabled={z.nurLesen}><Icon n="angebote" />Neue Anfrage / Angebot</button>}
    </Seitenkopf>
    <div class="raster r-2-1">
      <div class="raster">
        <Karte titel="Stammdaten">
          <div class="formular">
            <Feld label="Typ"><Auswahl wert={e.typ} setze={(v) => set({ typ: v })} optionen={TYP} /></Feld>
            {e.typ === "kunde" && <Feld label="Kundentyp"><Auswahl wert={e.kundentyp} setze={(v) => set({ kundentyp: v as Kontakt["kundentyp"] })} optionen={KUNDENTYP} /></Feld>}
            {e.typ === "hersteller" && <Feld label="Hersteller (Stammdaten)"><Auswahl wert={e.hersteller_id ? String(e.hersteller_id) : ""} setze={(v) => set({ hersteller_id: v ? Number(v) : null })} optionen={d.hersteller.map((h) => [String(h.id), h.name] as [string, string])} leer="–" /></Feld>}
            <Feld label="Firma" klasse="halb"><Text wert={e.firma} setze={(v) => set({ firma: v })} /></Feld>
            <Feld label="Anrede"><Auswahl wert={e.anrede} setze={(v) => set({ anrede: v })} optionen={[["Frau", "Frau"], ["Herr", "Herr"], ["Divers", "Divers"]]} leer="–" /></Feld>
            <Feld label="Vorname"><Text wert={e.vorname} setze={(v) => set({ vorname: v })} /></Feld>
            <Feld label="Nachname"><Text wert={e.nachname} setze={(v) => set({ nachname: v })} /></Feld>
            <Feld label="Funktion"><Text wert={e.funktion} setze={(v) => set({ funktion: v })} placeholder="z. B. Vertrieb Nord" /></Feld>
            <Feld label="E-Mail"><input type="email" value={e.email} onInput={(x) => set({ email: (x.target as HTMLInputElement).value })} /></Feld>
            <Feld label="Telefon"><input type="tel" value={e.telefon} onInput={(x) => set({ telefon: (x.target as HTMLInputElement).value })} /></Feld>
            <Feld label="Mobil"><input type="tel" value={e.mobil} onInput={(x) => set({ mobil: (x.target as HTMLInputElement).value })} /></Feld>
            <Feld label="Straße" klasse="halb"><Text wert={e.strasse} setze={(v) => set({ strasse: v })} /></Feld>
            <Feld label="PLZ"><Text wert={e.plz} setze={(v) => set({ plz: v })} /></Feld>
            <Feld label="Ort"><Text wert={e.ort} setze={(v) => set({ ort: v })} /></Feld>
            <Feld label="Land"><Text wert={e.land} setze={(v) => set({ land: v })} /></Feld>
            <Feld label="Notiz" klasse="breit"><textarea value={e.notiz} onInput={(x) => set({ notiz: (x.target as HTMLTextAreaElement).value })} /></Feld>
          </div>
          <div class="speicherleiste">
            <button class="btn gefahr klein" onClick={loeschen} disabled={z.nurLesen}>Löschen</button>
            <div class="rechts"><button class="btn" disabled={!geaendert} onClick={() => setE(structuredClone(k))}>Verwerfen</button><button class="btn primaer" disabled={!geaendert || z.nurLesen} onClick={speichern}>Speichern</button></div>
          </div>
        </Karte>
        {(k.typ === "kunde" || k.typ === "partner" || vorgaenge.length > 0) && <Karte titel={`Anfragen & Angebote (${vorgaenge.length})`} ohnePadding>
          <table class="t"><tbody>
            {vorgaenge.map((v) => <tr class="klickbar" onClick={() => geheZu(`angebote/${v.id}`)}><td class="mono">{v.nummer}</td><td>{v.betreff || "–"}</td><td>{datum(v.datum)}</td><td><span class="marke">{VORGANG_STATUS[v.status]}</span></td><td class="num">{euro(summen(v, d.einstellungen.angebot.mwst_proz).netto)}</td></tr>)}
            {!vorgaenge.length && <tr><td class="leer">Noch keine Vorgänge.</td></tr>}
          </tbody></table>
        </Karte>}
        {k.typ === "hersteller" && k.hersteller_id && <HerstellerProdukte herstellerId={k.hersteller_id} />}
      </div>
      <div class="raster" style={{ alignContent: "start" }}>
        {k.typ === "kunde" && (() => { const q = datenqualitaet(k); return <Karte titel="Datenqualität" rechts={<QualitaetMarke q={q} />}>
          {q.stufe === "ok" ? <p class="muted" style={{ margin: 0 }}>Alle Angaben für Angebot und Lieferung vorhanden.</p>
            : <ul class="klein" style={{ margin: 0, paddingLeft: 18 }}>{[...q.verdacht, ...q.auffaellig, ...q.fehlt.map((f) => `fehlt: ${f}`)].map((x) => <li>{x}</li>)}</ul>}
        </Karte>; })()}
        <Karte titel="Aktivitäten">
          <div class="knopfreihe" style={{ marginBottom: 10, flexWrap: "nowrap" }}>
            <input type="text" placeholder="Telefonat, Besuch, Absprache…" value={notiz} onInput={(x) => setNotiz((x.target as HTMLInputElement).value)} onKeyDown={(x) => { if (x.key === "Enter") notieren(notiz); }} />
            <button class="btn" onClick={() => notieren(notiz)} disabled={!notiz.trim() || z.nurLesen}>Notieren</button>
          </div>
          <ul class="feed" style={{ margin: "0 -16px -14px" }}>
            {(k.aktivitaeten ?? []).map((x) => <li><span class="wer" title={x.von}>{initialen(x.von)}</span><span>{x.text}</span><span class="faint nowrap">{datumZeit(x.zeit)}</span></li>)}
            {!(k.aktivitaeten ?? []).length && <li style={{ display: "block" }} class="muted">Noch keine Aktivitäten.</li>}
          </ul>
        </Karte>
      </div>
    </div>
    {anfrage && <Preisanfrage k={k} onClose={() => setAnfrage(false)} notieren={notieren} />}
  </>;
}

function HerstellerProdukte({ herstellerId }: { herstellerId: number }) {
  const a = ab();
  const liste = z.daten.produkte.filter((p) => p.status !== "archiviert" && a.steine.get(p.stein_id ?? -1)?.hersteller_id === herstellerId);
  return <Karte titel={`Produkte von ${herstellerName(herstellerId)} (${liste.length})`} rechts={<a class="btn klein" href={`#/produkte?hersteller=${herstellerId}`}>Im Bestand öffnen</a>}>
    <div class="chips">{liste.slice(0, 80).map((p) => <a class="chip mono" style={{ textDecoration: "none" }} href={`#/produkte/${p.id}`}>{p.sku ?? p.name.slice(0, 20)}</a>)}{liste.length > 80 && <span class="muted">… {liste.length - 80} weitere</span>}</div>
  </Karte>;
}

/** Preisanfrage an Hersteller oder Lieferant: Produkte wählen, E-Mail vorbereiten, Aktivität vermerken. */
function Preisanfrage({ k, onClose, notieren }: { k: Kontakt; onClose: () => void; notieren: (t: string) => void }) {
  const a = ab(), d = z.daten;
  const kandidaten = d.produkte.filter((p) => p.status !== "archiviert" && p.art !== "nistklinker" && (!k.hersteller_id || a.steine.get(p.stein_id ?? -1)?.hersteller_id === k.hersteller_id));
  const [gewaehlt, setGewaehlt] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [menge, setMenge] = useState("");
  const anrede = k.nachname ? `${k.anrede === "Frau" ? "Sehr geehrte Frau" : k.anrede === "Herr" ? "Sehr geehrter Herr" : "Guten Tag"} ${k.nachname}` : "Sehr geehrte Damen und Herren";
  const zeilen = kandidaten.filter((p) => gewaehlt.has(p.id)).map((p) => { const s = a.steine.get(p.stein_id ?? -1); return `- ${s?.bezeichnung_hersteller || p.name}${s?.artikelnr_hersteller ? ` (Art.-Nr. ${s.artikelnr_hersteller})` : ""}, ${p.formate.join("/") || "Format?"}, unsere Nr. ${p.sku}`; });
  const text = `${anrede},\n\nbitte senden Sie uns Ihre aktuellen Preise und Lieferzeiten für folgende Artikel${menge ? ` (Menge ca. ${menge})` : ""}:\n\n${zeilen.join("\n") || "- …"}\n\nBitte geben Sie auch Steine je Paket/Palette und Frachtkosten nach Rhede an.\n\nMit freundlichen Grüßen\n${ich()}\n${d.einstellungen.firma.name}${d.einstellungen.firma.telefon ? "\nTel. " + d.einstellungen.firma.telefon : ""}`;
  const betreff = `Preisanfrage ${d.einstellungen.firma.name}${zeilen.length ? ` – ${zeilen.length} Artikel` : ""}`;
  const mailto = `mailto:${encodeURIComponent(k.email)}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`;
  const liste = kandidaten.filter((p) => !q || `${p.sku} ${p.name}`.toLowerCase().includes(q.toLowerCase()));
  return <Dialog titel={`Preisanfrage an ${kontaktName(k)}`} breit onClose={onClose} fuss={<>
    <span class="links muted klein">{k.email ? `An: ${k.email}` : "Keine E-Mail-Adresse hinterlegt – Text kopieren."}</span>
    <button class="btn" onClick={() => { navigator.clipboard?.writeText(text).then(() => melde("Text kopiert."), () => melde("Kopieren nicht möglich.", "fehler")); }}>Text kopieren</button>
    <a class={`btn primaer ${!k.email ? "disabled" : ""}`} href={k.email ? mailto : undefined} onClick={() => { notieren(`Preisanfrage gesendet: ${zeilen.length} Artikel`); onClose(); }}><Icon n="mail" />Im E-Mail-Programm öffnen</a>
  </>}>
    <div class="raster r2">
      <div>
        <div class="knopfreihe" style={{ marginBottom: 8 }}>
          <input type="search" placeholder="Produkte filtern" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          <button class="btn klein" onClick={() => setGewaehlt(new Set(liste.map((p) => p.id)))}>alle</button>
          <button class="btn klein" onClick={() => setGewaehlt(new Set())}>keine</button>
        </div>
        <div style={{ maxHeight: 340, overflow: "auto", border: "1px solid var(--line)", borderRadius: 6 }}>
          {liste.map((p) => <label class="check" style={{ display: "flex", padding: "4px 10px", borderBottom: "1px solid var(--line)" }}>
            <input type="checkbox" checked={gewaehlt.has(p.id)} onChange={() => { const n = new Set(gewaehlt); n.has(p.id) ? n.delete(p.id) : n.add(p.id); setGewaehlt(n); }} />
            <span class="mono">{p.sku ?? "–"}</span><span class="muted klein">{p.formate.join(", ")}</span>
          </label>)}
          {!liste.length && <p class="muted" style={{ padding: 10 }}>Keine Produkte{k.hersteller_id ? " für diesen Hersteller" : ""}.</p>}
        </div>
        <Feld label="Menge (optional)"><input type="text" value={menge} onInput={(e) => setMenge((e.target as HTMLInputElement).value)} placeholder="z. B. 250 m²" /></Feld>
      </div>
      <Feld label="Vorschau"><textarea readOnly rows={18} value={text} style={{ fontSize: 12.5 }} /></Feld>
    </div>
  </Dialog>;
}
