// Produktbestand: Tabelle mit Filtern, Sortierung und Sammelbearbeitung.
import { useMemo, useState } from "preact/hooks";
import { z, aendern, frage } from "./store.ts";
import { ab, herstellerName } from "./abgeleitet.ts";
import { Seitenkopf, Karte, Icon, Farbpunkt, Score, Seiten, useSortierung, queryParam, geheZu, Auswahl, relZeit } from "./ui.tsx";
import { ART, STATUS, HERSTELLUNG, aktuellerPreis, type Produkt, type ProduktStatus, type Herstellungsart } from "../lib/modell.ts";
import { REGELN } from "../lib/pruefung.ts";
import { aendere } from "../lib/aendern.ts";
import { produkteCsv } from "../lib/produktcsv.ts";
import { herunterladen } from "../lib/speicher.ts";
import { bildUrl } from "../lib/woo.ts";
import { euro } from "../lib/angebot.ts";

const PRO_SEITE = 50;

export function Bestand() {
  const d = z.daten, a = ab();
  const [q, setQ] = useState("");
  const [art, setArt] = useState("");
  const [status, setStatus] = useState(queryParam("status") ?? "");
  const [hersteller, setHersteller] = useState(queryParam("hersteller") ?? "");
  const [herstellung, setHerstellung] = useState("");
  const [farbe, setFarbe] = useState("");
  const [format, setFormat] = useState("");
  const [regel, setRegel] = useState(queryParam("regel") ?? (queryParam("pflicht") ? "_pflicht" : ""));
  const [seite, setSeite] = useState(0);
  const [auswahl, setAuswahl] = useState<Set<number>>(new Set());

  const gefiltert = useMemo(() => {
    const such = q.trim().toLowerCase();
    return d.produkte.filter((p) => {
      const s = p.stein_id ? a.steine.get(p.stein_id) : undefined;
      if (status ? p.status !== status : p.status === "archiviert") return false;
      if (art && p.art !== art) return false;
      if (hersteller === "ohne" ? !!s?.hersteller_id : hersteller && String(s?.hersteller_id ?? p.hersteller_id) !== hersteller) return false;
      if (herstellung && s?.herstellungsart !== herstellung) return false;
      if (farbe && !s?.farben.includes(farbe)) return false;
      if (format && !p.formate.includes(format)) return false;
      if (regel) {
        const pk = a.bewertung.get(p.id)!.punkte;
        if (regel === "_pflicht" ? !pk.some((x) => x.schwere === "pflicht") : !pk.some((x) => x.regel === regel)) return false;
      }
      if (such) {
        const t = `${p.sku ?? ""} ${p.name} ${s?.hbr_code ?? ""} ${herstellerName(s?.hersteller_id)} ${s?.bezeichnung_hersteller ?? ""} ${s?.artikelnr_hersteller ?? ""}`.toLowerCase();
        if (!such.split(/\s+/).every((w) => t.includes(w))) return false;
      }
      return true;
    });
  }, [z.rev, q, art, status, hersteller, herstellung, farbe, format, regel]);

  const { sortiert, Kopf } = useSortierung<Produkt>(gefiltert, queryParam("sort") ?? "sku", {
    sku: (p) => p.sku ?? p.name, hersteller: (p) => herstellerName(a.steine.get(p.stein_id ?? -1)?.hersteller_id),
    vk: (p) => aktuellerPreis(p, "vk")?.betrag ?? null, score: (p) => a.bewertung.get(p.id)!.score, geaendert: (p) => p.geaendert_am, status: (p) => p.status,
  });
  const sichtbar = sortiert.slice(seite * PRO_SEITE, (seite + 1) * PRO_SEITE);
  const alleSichtbarGewaehlt = sichtbar.length > 0 && sichtbar.every((p) => auswahl.has(p.id));
  const toggle = (id: number) => { const n = new Set(auswahl); n.has(id) ? n.delete(id) : n.add(id); setAuswahl(n); };
  const filterAktiv = !!(q || art || status || hersteller || herstellung || farbe || format || regel);
  const zuruecksetzen = () => { setQ(""); setArt(""); setStatus(""); setHersteller(""); setHerstellung(""); setFarbe(""); setFormat(""); setRegel(""); setSeite(0); if (location.hash.includes("?")) geheZu("produkte"); };
  const f = <T,>(set: (v: T) => void) => (v: T) => { set(v); setSeite(0); };

  return <>
    <Seitenkopf titel="Produktbestand" text={`${gefiltert.length} von ${d.produkte.filter((p) => p.status !== "archiviert").length} aktiven Produkten`}>
      <button class="btn" onClick={() => herunterladen(`produkte_${new Date().toISOString().slice(0, 10)}.csv`, produkteCsv(d, sortiert), "text/csv;charset=utf-8")}><Icon n="download" />CSV ({gefiltert.length})</button>
      <a class="btn" href="#/produkte/export"><Icon n="upload" />CSV importieren</a>
      <a class="btn primaer" href="#/produkte/neu"><Icon n="plus" />Produkt erfassen</a>
    </Seitenkopf>
    <Karte ohnePadding>
      <div class="filterleiste">
        <input type="search" placeholder="Suche: HBR-Code, Name, Hersteller…" value={q} onInput={(e) => { setQ((e.target as HTMLInputElement).value); setSeite(0); }} aria-label="Suche" />
        <Auswahl wert={art} setze={f(setArt)} optionen={ART} leer="Alle Arten" aria-label="Art" />
        <Auswahl wert={hersteller} setze={f(setHersteller)} optionen={[["ohne", "– ohne Hersteller –"], ...d.hersteller.map((h) => [String(h.id), h.name] as [string, string])]} leer="Alle Hersteller" aria-label="Hersteller" />
        <Auswahl wert={herstellung} setze={f(setHerstellung)} optionen={HERSTELLUNG} leer="Herstellungsart" aria-label="Herstellungsart" />
        <Auswahl wert={farbe} setze={f(setFarbe)} optionen={d.farben.map((x) => [x.schluessel, x.schluessel] as [string, string])} leer="Farbe" aria-label="Farbe" />
        <Auswahl wert={format} setze={f(setFormat)} optionen={d.formate.map((x) => [x.kuerzel, x.kuerzel] as [string, string])} leer="Format" aria-label="Format" />
        <Auswahl wert={status} setze={f(setStatus)} optionen={STATUS} leer="Status (ohne Archiv)" aria-label="Status" />
        <Auswahl wert={regel} setze={f(setRegel)} optionen={[["_pflicht", "– alle Pflichtlücken –"], ...Object.entries(REGELN).map(([k, v]) => [k, v.text] as [string, string])]} leer="Lücke" aria-label="Lücke" />
        {filterAktiv && <button class="btn link" onClick={zuruecksetzen}>Filter zurücksetzen</button>}
      </div>
      {auswahl.size > 0 && <Sammel auswahl={auswahl} setAuswahl={setAuswahl} gefiltert={sortiert} />}
      <div class="tabelle-wrap">
        <table class="t">
          <thead><tr>
            <th style={{ width: 32 }}><input type="checkbox" aria-label="Alle auf dieser Seite wählen" checked={alleSichtbarGewaehlt} onChange={() => { const n = new Set(auswahl); sichtbar.forEach((p) => (alleSichtbarGewaehlt ? n.delete(p.id) : n.add(p.id))); setAuswahl(n); }} /></th>
            <th style={{ width: 52 }}></th>
            <Kopf feld="sku">Artikelnummer</Kopf><th>Art</th><Kopf feld="hersteller">Hersteller</Kopf><th>Herstellung</th><th>Farben</th><th>Formate</th>
            <Kopf feld="vk" klasse="num">VK/m²</Kopf><Kopf feld="status">Status</Kopf><Kopf feld="score">Vollst.</Kopf><Kopf feld="geaendert">Geändert</Kopf>
          </tr></thead>
          <tbody>
            {sichtbar.map((p) => {
              const s = p.stein_id ? a.steine.get(p.stein_id) : undefined;
              const b = p.bilder[0] ? a.bilder.get(p.bilder[0]) : undefined;
              const vk = aktuellerPreis(p, "vk");
              return <tr class={`klickbar ${auswahl.has(p.id) ? "gewaehlt" : ""}`} onClick={(e) => { if ((e.target as HTMLElement).closest("input")) return; geheZu(`produkte/${p.id}`); }}>
                <td><input type="checkbox" checked={auswahl.has(p.id)} onChange={() => toggle(p.id)} aria-label={`${p.sku} wählen`} /></td>
                <td>{b ? <img class="bild" src={bildUrl(b.datei)} alt="" loading="lazy" /> : <span class="bild" />}</td>
                <td><span class="mono">{p.sku ?? <span class="marke bad">ohne Nr.</span>}</span>{!p.sku && <div class="klein muted">{p.name.slice(0, 50)}</div>}</td>
                <td>{ART[p.art]}</td>
                <td>{herstellerName(s?.hersteller_id) || <span class="faint">–</span>}</td>
                <td>{s?.herstellungsart ? HERSTELLUNG[s.herstellungsart] : <span class="faint">–</span>}</td>
                <td><span class="chips" style={{ gap: 3 }}>{s?.farben.map((x) => <Farbpunkt f={x} />)}</span></td>
                <td class="klein">{p.formate.join(", ")}</td>
                <td class="num">{vk ? euro(vk.betrag) : <span class="faint">–</span>}</td>
                <td><span class={`marke ${p.status === "freigegeben" ? "ok" : p.status === "pruefung" ? "warn" : ""}`}>{STATUS[p.status]}</span></td>
                <td><Score wert={a.bewertung.get(p.id)!.score} /></td>
                <td class="faint nowrap klein" title={`${p.geaendert_von}, ${new Date(p.geaendert_am).toLocaleString("de-DE")}`}>{relZeit(p.geaendert_am)}</td>
              </tr>;
            })}
            {!sichtbar.length && <tr><td colSpan={12} class="leer">Keine Produkte für diese Filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <Seiten seite={seite} setSeite={setSeite} gesamt={sortiert.length} proSeite={PRO_SEITE} />
    </Karte>
  </>;
}

function Sammel({ auswahl, setAuswahl, gefiltert }: { auswahl: Set<number>; setAuswahl: (s: Set<number>) => void; gefiltert: Produkt[] }) {
  const d = z.daten, a = ab();
  const [aktion, setAktion] = useState("");
  const [wert, setWert] = useState("");
  const gewaehlt = d.produkte.filter((p) => auswahl.has(p.id));
  const steinIds = [...new Set(gewaehlt.map((p) => p.stein_id).filter((x): x is number => !!x))];
  const betroffeneGeschwister = steinIds.flatMap((id) => a.geschwister.get(id) ?? []).filter((p) => !auswahl.has(p.id)).length;

  const OPT: Record<string, { label: string; werte: [string, string][]; stein: boolean }> = {
    hersteller: { label: "Hersteller setzen", werte: d.hersteller.map((h) => [String(h.id), h.name]), stein: true },
    herstellungsart: { label: "Herstellungsart setzen", werte: Object.entries(HERSTELLUNG), stein: true },
    farbe_plus: { label: "Farbe hinzufügen", werte: d.farben.map((f) => [f.schluessel, f.schluessel]), stein: true },
    farbe_minus: { label: "Farbe entfernen", werte: d.farben.map((f) => [f.schluessel, f.schluessel]), stein: true },
    format_plus: { label: "Format hinzufügen", werte: d.formate.map((f) => [f.kuerzel, f.kuerzel]), stein: false },
    status: { label: "Status setzen", werte: Object.entries(STATUS), stein: false },
  };

  async function anwenden() {
    const o = OPT[aktion];
    if (!o || !wert) return;
    const n = o.stein ? steinIds.length : gewaehlt.length;
    let text = `${o.label}: „${o.werte.find((x) => x[0] === wert)?.[1]}“ für ${gewaehlt.length} Produkte.`;
    if (o.stein && betroffeneGeschwister) text += ` Das betrifft auch ${betroffeneGeschwister} zugehörige Verblender/Riemchen, weil diese Angaben am Stein hängen.`;
    if (n > 50 && !(await frage(text + " Das ist eine größere Sammeländerung.", "Sammeländerung bestätigen", "Ändern"))) return;
    aendern((dd, von) => {
      for (const sid of o.stein ? steinIds : []) {
        const s = dd.steine.find((x) => x.id === sid)!;
        if (aktion === "hersteller") {
          aendere(dd, "steine", sid, { hersteller_id: Number(wert), hersteller_quelle: "manuell" }, von);
          for (const p of dd.produkte) if (p.stein_id === sid) aendere(dd, "produkte", p.id, { hersteller_id: Number(wert) }, von);
        }
        if (aktion === "herstellungsart") aendere(dd, "steine", sid, { herstellungsart: wert as Herstellungsart }, von);
        if (aktion === "farbe_plus" && !s.farben.includes(wert)) aendere(dd, "steine", sid, { farben: [...s.farben, wert] }, von);
        if (aktion === "farbe_minus" && s.farben.includes(wert)) aendere(dd, "steine", sid, { farben: s.farben.filter((x) => x !== wert) }, von);
      }
      for (const p of o.stein ? [] : gewaehlt) {
        if (aktion === "status") aendere(dd, "produkte", p.id, { status: wert as ProduktStatus }, von);
        if (aktion === "format_plus" && !p.formate.includes(wert)) aendere(dd, "produkte", p.id, { formate: [...p.formate, wert] }, von);
      }
    }, `${o.label}: erledigt.`);
    setWert("");
  }

  return <div class="sammel">
    <b>{auswahl.size} gewählt</b>
    {auswahl.size < gefiltert.length && <button class="btn klein" onClick={() => setAuswahl(new Set(gefiltert.map((p) => p.id)))}>Alle {gefiltert.length} gefilterten wählen</button>}
    <Auswahl wert={aktion} setze={(v) => { setAktion(v); setWert(""); }} optionen={Object.entries(OPT).map(([k, v]) => [k, v.label] as [string, string])} leer="Aktion wählen…" aria-label="Sammelaktion" />
    {aktion && <Auswahl wert={wert} setze={setWert} optionen={OPT[aktion].werte} leer="Wert…" aria-label="Wert" />}
    <button class="btn klein" disabled={!aktion || !wert || z.nurLesen} onClick={anwenden}>Anwenden</button>
    <button class="btn klein" onClick={() => herunterladen(`produkte-auswahl_${new Date().toISOString().slice(0, 10)}.csv`, produkteCsv(d, gewaehlt), "text/csv;charset=utf-8")}>CSV der Auswahl</button>
    <button class="btn klein" style={{ marginLeft: "auto" }} onClick={() => setAuswahl(new Set())}>Auswahl aufheben</button>
  </div>;
}
