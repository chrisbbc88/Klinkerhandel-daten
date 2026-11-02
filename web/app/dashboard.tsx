// Dashboard: Lage auf einen Blick, mit Sprungzielen.
import { z, sichern, sicherungFaellig, ich } from "./store.ts";
import { ab, aenderungZeile } from "./abgeleitet.ts";
import { Karte, Seitenkopf, Icon, relZeit, initialen, geheZu, Score } from "./ui.tsx";
import { REGELN } from "../lib/pruefung.ts";
import { ART, STATUS, VORGANG_STATUS, type ProduktStatus, type VorgangStatus } from "../lib/modell.ts";
import { summen, euro } from "../lib/angebot.ts";

const STATUS_FARBE: Record<ProduktStatus, string> = { freigegeben: "var(--ok)", pruefung: "#d39a2c", entwurf: "#8b929a", archiviert: "#cfd4d8" };

export function Dashboard() {
  const d = z.daten, a = ab();
  const aktive = d.produkte.filter((p) => p.status !== "archiviert");
  const scores = aktive.map((p) => a.bewertung.get(p.id)!.score);
  const schnitt = scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : 0;
  const mitPflicht = aktive.filter((p) => a.bewertung.get(p.id)!.punkte.some((x) => x.schwere === "pflicht")).length;
  const nachArt = Object.keys(ART).map((k) => [k, aktive.filter((p) => p.art === k).length] as const).filter(([, n]) => n);

  const regelZahl = new Map<string, number>();
  for (const p of aktive) for (const x of a.bewertung.get(p.id)!.punkte) regelZahl.set(x.regel, (regelZahl.get(x.regel) ?? 0) + 1);
  const wo = [...regelZahl].sort((x, y) => (REGELN[y[0]].schwere === "pflicht" ? 1e6 : 0) + y[1] - ((REGELN[x[0]].schwere === "pflicht" ? 1e6 : 0) + x[1]));
  const maxWo = Math.max(1, ...regelZahl.values());

  const stufen = [
    { name: "≥ 80 %", n: scores.filter((s) => s >= 80).length, farbe: "var(--ok)", filter: "gut" },
    { name: "55–79 %", n: scores.filter((s) => s >= 55 && s < 80).length, farbe: "#d39a2c", filter: "mittel" },
    { name: "< 55 %", n: scores.filter((s) => s < 55).length, farbe: "var(--bad)", filter: "schlecht" },
  ];
  const status = (Object.keys(STATUS) as ProduktStatus[]).map((s) => ({ s, n: d.produkte.filter((p) => p.status === s).length }));

  const herst = d.hersteller.map((h) => {
    const l = aktive.filter((p) => a.steine.get(p.stein_id ?? -1)?.hersteller_id === h.id);
    return { h, n: l.length, score: l.length ? Math.round(l.reduce((s, p) => s + a.bewertung.get(p.id)!.score, 0) / l.length) : 0 };
  }).filter((x) => x.n).sort((x, y) => y.n - x.n);
  const ohneH = aktive.filter((p) => p.stein_id && !a.steine.get(p.stein_id)?.hersteller_id).length;
  const maxH = Math.max(1, ohneH, ...herst.map((x) => x.n));

  const offen = d.vorgaenge.filter((v) => !["angenommen", "abgelehnt", "archiviert"].includes(v.status));
  const volumen = offen.reduce((s, v) => s + summen(v, d.einstellungen.angebot.mwst_proz).netto, 0);
  const pipeline = (["neu", "in_bearbeitung", "angebot_erstellt", "gesendet"] as VorgangStatus[]).map((s) => ({ s, n: d.vorgaenge.filter((v) => v.status === s).length }));
  const ohneVk = aktive.filter((p) => a.bewertung.get(p.id)!.punkte.some((x) => x.regel === "vk")).length;

  const heute = new Date().toISOString().slice(0, 10);
  const feed = d.aenderungen.slice(-14).reverse();
  const heuteN = d.aenderungen.filter((e) => e.zeit.startsWith(heute)).length;
  const g = z.geraet;

  return <>
    <Seitenkopf titel={`Guten ${new Date().getHours() < 11 ? "Morgen" : new Date().getHours() < 18 ? "Tag" : "Abend"}, ${ich()}`} text={`${heuteN} ${heuteN === 1 ? "Änderung" : "Änderungen"} heute · Datenstand ${new Date(d.gespeichert_am).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}`}>
      <a class="btn" href="#/angebote/neu"><Icon n="angebote" />Neue Anfrage</a>
      <a class="btn primaer" href="#/produkte/neu"><Icon n="plus" />Produkt erfassen</a>
    </Seitenkopf>

    <div class="raster r4" style={{ marginBottom: 16 }}>
      <a class="karte kpi" href="#/produkte" style={{ textDecoration: "none" }}>
        <span class="titel">Produkte aktiv</span><span class="wert">{aktive.length}</span>
        <span class="unter">{nachArt.map(([k, n]) => `${n} ${ART[k as keyof typeof ART]}`).join(" · ")}</span>
      </a>
      <a class="karte kpi" href="#/produkte?sort=score" style={{ textDecoration: "none" }}>
        <span class="titel">Ø Vollständigkeit</span><span class="wert">{schnitt} %</span>
        <div class="balken" style={{ marginTop: 6 }}>{stufen.map((s) => <span style={{ width: `${(s.n / Math.max(1, scores.length)) * 100}%`, background: s.farbe }} title={`${s.name}: ${s.n}`} />)}</div>
      </a>
      <a class="karte kpi" href="#/produkte?pflicht=1" style={{ textDecoration: "none" }}>
        <span class="titel">Mit Pflichtlücken</span><span class="wert" style={{ color: mitPflicht ? "var(--bad)" : undefined }}>{mitPflicht}</span>
        <span class="unter">dürfen so nicht in den Shop · {a.hinweiseOffen} offene Hinweise</span>
      </a>
      <a class="karte kpi" href="#/angebote" style={{ textDecoration: "none" }}>
        <span class="titel">Offene Anfragen & Angebote</span><span class="wert">{offen.length}</span>
        <span class="unter">{offen.length ? `${euro(volumen)} netto im Angebot` : "keine offenen Vorgänge"}</span>
      </a>
    </div>

    <div class="raster r-2-1" style={{ marginBottom: 16 }}>
      <Karte titel="Wo ansetzen" rechts={<span class="muted klein">Anzahl Produkte · Klick filtert den Bestand</span>}>
        {wo.length === 0 && <p class="muted">Keine Lücken – alle Produkte vollständig.</p>}
        {wo.map(([regel, n]) => <div class="leiste klickbar" onClick={() => geheZu(`produkte?regel=${regel}`)} role="link" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") geheZu(`produkte?regel=${regel}`); }}>
          <span>{REGELN[regel].text} {REGELN[regel].schwere === "pflicht" && <span class="marke bad">Pflicht</span>}</span>
          <span class="spur"><b style={{ width: `${(n / maxWo) * 100}%`, background: REGELN[regel].schwere === "pflicht" ? "var(--signal)" : "var(--ink)" }} /></span>
          <span class="num">{n}</span>
        </div>)}
      </Karte>
      <div class="raster" style={{ alignContent: "start" }}>
        <Karte titel="Produktstatus">
          <div class="balken" style={{ height: 10 }}>{status.map((x) => <span style={{ width: `${(x.n / Math.max(1, d.produkte.length)) * 100}%`, background: STATUS_FARBE[x.s] }} />)}</div>
          <div class="legende">{status.map((x) => <a href={`#/produkte?status=${x.s}`} style={{ color: "inherit", textDecoration: "none" }}><span><i style={{ background: STATUS_FARBE[x.s] }} />{STATUS[x.s]} {x.n}</span></a>)}</div>
        </Karte>
        <Karte titel="Shop-Abgleich" rechts={<a class="btn klein" href="#/produkte/export">Zum Export</a>}>
          <div class="knopfreihe"><span style={{ fontSize: 22, fontWeight: 600 }}>{a.exportOffen}</span><span class="muted">Produkte seit dem letzten Export geändert</span></div>
          <p class="muted klein" style={{ margin: "6px 0 0" }}>{ohneVk} aktive Produkte ohne Verkaufspreis je m² (für Angebote nötig).</p>
        </Karte>
        <Karte titel="Datensicherung" rechts={<a class="btn klein" href="#/einstellungen/sicherung">Einstellungen</a>}>
          <div class="knopfreihe" style={{ marginBottom: 6 }}>
            <span class={`punkt ${!sicherungFaellig() ? "ok" : z.ordner === "erlaubt" && g.auto_an ? "ok" : "warn"}`} />
            <span>{g.letzte_sicherung ? `Zuletzt gesichert ${relZeit(g.letzte_sicherung)}` : "Noch nie gesichert"}</span>
          </div>
          <p class="muted klein" style={{ margin: "0 0 8px" }}>{z.ordner === "erlaubt" ? (g.auto_an ? `Automatisch alle ${g.intervall_min} Minuten in den Sicherungsordner.` : "Automatische Sicherung ist ausgeschaltet.") : z.ordner === "freigeben" ? "Sicherungsordner muss freigegeben werden." : "Kein Sicherungsordner verbunden."}</p>
          <button class="btn klein" disabled={z.sicherungLaeuft} onClick={() => sichern(false)}><Icon n="sichern" />Jetzt sichern</button>
        </Karte>
      </div>
    </div>

    <div class="raster r-2-1">
      <Karte titel="Hersteller" rechts={<span class="muted klein">aktive Produkte · Ø Vollständigkeit</span>}>
        {herst.map((x) => <div class="leiste klickbar" onClick={() => geheZu(`produkte?hersteller=${x.h.id}`)}>
          <span>{x.h.name}</span><span class="spur"><b style={{ width: `${(x.n / maxH) * 100}%` }} /></span><span class="num">{x.n}</span>
        </div>)}
        {ohneH > 0 && <div class="leiste klickbar" onClick={() => geheZu("produkte?regel=hersteller")}>
          <span style={{ color: "var(--bad)" }}>Ohne Hersteller</span><span class="spur"><b style={{ width: `${(ohneH / maxH) * 100}%`, background: "var(--signal)" }} /></span><span class="num">{ohneH}</span>
        </div>}
        <p class="muted klein" style={{ marginBottom: 0 }}>Hersteller für HBR-Präfixe ohne Zuordnung legen Sie unter Einstellungen › Stammdaten fest – alle Steine mit diesem Präfix werden dann zugeordnet.</p>
      </Karte>
      <div class="raster" style={{ alignContent: "start" }}>
        <Karte titel="Anfragen & Angebote" rechts={<a class="btn klein" href="#/angebote">Alle</a>}>
          {pipeline.map((x) => <div class="leiste klickbar" style={{ gridTemplateColumns: "1fr 48px" }} onClick={() => geheZu(`angebote?status=${x.s}`)}><span>{VORGANG_STATUS[x.s]}</span><span class="num">{x.n}</span></div>)}
        </Karte>
        <Karte titel="Letzte Änderungen" ohnePadding rechts={<span class="muted klein">alle Bearbeiter</span>}>
          <ul class="feed">{feed.map((e) => { const r = aenderungZeile(e); return <li>
            <span class="wer" title={e.von}>{initialen(e.von)}</span>
            <span>{r.link ? <a href={`#/${r.link}`} style={{ color: "var(--ink)", fontWeight: 500, textDecoration: "none" }}>{r.titel}</a> : <b style={{ fontWeight: 500 }}>{r.titel}</b>} <span class="muted">{r.text}</span></span>
            <span class="faint nowrap">{relZeit(e.zeit)}</span>
          </li>; })}</ul>
        </Karte>
      </div>
    </div>
  </>;
}


