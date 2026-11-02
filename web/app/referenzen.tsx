// Referenzen: Objektfotos mit verbautem Stein – Liste, anlegen, bearbeiten.
import { useMemo, useState } from "preact/hooks";
import { z, aendern, frage, melde } from "./store.ts";
import { ab } from "./abgeleitet.ts";
import { Seitenkopf, Karte, Icon, Feld, Text, Auswahl, Chips, Seiten, geheZu, relZeit, datumZeit } from "./ui.tsx";
import { REFERENZ_RUBRIKEN, OBJEKTARTEN, HERSTELLUNG, ART, type Referenz } from "../lib/modell.ts";
import { aendere, lege_an, loesche, neueId } from "../lib/aendern.ts";
import { bildUrl } from "../lib/woo.ts";

const STATUS_R: Record<Referenz["status"], string> = { entwurf: "Entwurf", freigegeben: "Freigegeben", archiviert: "Archiviert" };

export function ReferenzListe() {
  const d = z.daten, a = ab();
  const [q, setQ] = useState(""); const [rubrik, setRubrik] = useState(""); const [nurOhne, setNurOhne] = useState(false); const [seite, setSeite] = useState(0);
  const [status, setStatus] = useState("");
  const liste = d.referenzen.filter((r) => (status ? r.status === status : r.status !== "archiviert") && (!nurOhne || !r.stein_id) && (!rubrik || r.rubriken.includes(rubrik))
    && (!q || `${r.name} ${r.hbr_code_shop ?? ""} ${r.objektart ?? ""} ${r.ort} ${a.steine.get(r.stein_id ?? -1)?.hbr_code ?? ""}`.toLowerCase().includes(q.toLowerCase())))
    .sort((x, y) => y.geaendert_am.localeCompare(x.geaendert_am) || x.name.localeCompare(y.name));
  return <>
    <Seitenkopf titel="Referenzen" text={`${liste.length} Referenzen · im Shop als Produkte der Kategorie „Referenzen“ mit Unterkategorien`}>
      <a class="btn primaer" href="#/produkte/referenzen/neu"><Icon n="plus" />Neue Referenz</a>
    </Seitenkopf>
    <Karte ohnePadding>
      <div class="filterleiste">
        <input type="search" placeholder="Suche: Name, HBR-Code, Ort…" value={q} onInput={(e) => { setQ((e.target as HTMLInputElement).value); setSeite(0); }} />
        <Auswahl wert={rubrik} setze={(v) => { setRubrik(v); setSeite(0); }} optionen={REFERENZ_RUBRIKEN.map((x) => [x, x] as [string, string])} leer="Alle Rubriken" />
        <Auswahl wert={status} setze={(v) => { setStatus(v); setSeite(0); }} optionen={STATUS_R} leer="Status (ohne Archiv)" />
        <label class="check"><input type="checkbox" checked={nurOhne} onChange={(e) => { setNurOhne((e.target as HTMLInputElement).checked); setSeite(0); }} /> nur ohne Stein ({d.referenzen.filter((r) => !r.stein_id).length})</label>
      </div>
      <div class="tabelle-wrap">
        <table class="t">
          <thead><tr><th style={{ width: 52 }}></th><th>Name</th><th>Rubriken</th><th>Stein</th><th class="num">Bilder</th><th>Status</th><th>Geändert</th></tr></thead>
          <tbody>{liste.slice(seite * 50, seite * 50 + 50).map((r) => {
            const b = r.bilder[0] ? a.bilder.get(r.bilder[0]) : undefined; const s = r.stein_id ? a.steine.get(r.stein_id) : undefined;
            return <tr class="klickbar" onClick={() => geheZu(`produkte/referenzen/${r.id}`)}>
              <td>{b ? <img class="bild" src={bildUrl(b.datei)} alt="" loading="lazy" /> : <span class="bild" />}</td>
              <td>{r.name}{r.ort && <div class="muted klein">{r.ort}</div>}</td>
              <td class="klein muted">{r.rubriken.join(", ") || "–"}</td>
              <td class="mono">{s?.hbr_code ?? <span class="marke warn">fehlt</span>}</td>
              <td class="num">{r.bilder.length}</td>
              <td><span class={`marke ${r.status === "freigegeben" ? "ok" : ""}`}>{STATUS_R[r.status]}</span>{!r.beschreibung && <span class="marke" style={{ marginLeft: 4 }}>ohne Text</span>}</td>
              <td class="faint klein nowrap">{relZeit(r.geaendert_am)}</td>
            </tr>;
          })}
          {!liste.length && <tr><td colSpan={7} class="leer">Keine Referenzen für diese Filter.</td></tr>}</tbody>
        </table>
      </div>
      <Seiten seite={seite} setSeite={setSeite} gesamt={liste.length} proSeite={50} />
    </Karte>
  </>;
}

export function ReferenzNeu() {
  const steinParam = Number(new URLSearchParams(location.hash.split("?")[1] ?? "").get("stein")) || null;
  function anlegen() {
    const id = neueId();
    const s = steinParam ? ab().steine.get(steinParam) : undefined;
    const ok = aendern((dd, von) => {
      const jetzt = new Date().toISOString();
      lege_an(dd, "referenzen", {
        id, version: 1, erstellt_am: jetzt, geaendert_am: jetzt, geaendert_von: von, woo_id: null, woo_slug: "", name: s ? `Einfamilienhaus – ${s.hbr_code}` : "Neue Referenz",
        objektart: "Einfamilienhaus", rubriken: ["EFH + DHH"], stein_id: s?.id ?? null, hbr_code_shop: null, bilder: [], status: "entwurf", ort: "", beschreibung: "", zuletzt_exportiert_version: null,
      }, von);
    });
    if (ok) geheZu(`produkte/referenzen/${id}`);
  }
  return <Karte titel="Neue Referenz">
    <p class="muted" style={{ marginTop: 0 }}>Die Referenz wird als Entwurf angelegt. Danach Name, Stein, Rubriken, Text und Bilder ergänzen und freigeben – dann kommt sie mit dem nächsten Shop-Paket in WooCommerce.</p>
    <div class="knopfreihe"><a class="btn" href="#/produkte/referenzen">Abbrechen</a><button class="btn primaer" disabled={z.nurLesen} onClick={anlegen}><Icon n="plus" />Entwurf anlegen</button></div>
  </Karte>;
}

export function ReferenzDetail({ id }: { id: number }) {
  const r = z.daten.referenzen.find((x) => x.id === id);
  if (!r) return <Karte><p>Referenz nicht gefunden. <a href="#/produkte/referenzen">Zur Liste</a></p></Karte>;
  return <RDetail key={id} r={r} />;
}

function RDetail({ r }: { r: Referenz }) {
  const d = z.daten, a = ab();
  const [patch, setPatch] = useState<{ x: Partial<Referenz>; v: number }>(() => ({ x: {}, v: r.version }));
  const e = { ...r, ...patch.x } as Referenz;
  const offen = Object.fromEntries(Object.entries(patch.x).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((r as any)[k])));
  const geaendert = Object.keys(offen).length > 0;
  if (!geaendert && r.version !== patch.v) patch.v = r.version;
  const fremd = geaendert && r.version !== patch.v;
  const set = (x: Partial<Referenz>) => setPatch({ ...patch, x: { ...patch.x, ...x } });
  const s = e.stein_id ? a.steine.get(e.stein_id) : undefined;
  const produkte = s ? a.geschwister.get(s.id) ?? [] : [];
  const [code, setCode] = useState(s?.hbr_code ?? "");
  const [neuBild, setNeuBild] = useState("");

  function steinSetzen(c: string) {
    const t = c.trim().toUpperCase();
    if (!t) { set({ stein_id: null }); return; }
    const st = d.steine.find((x) => x.hbr_code === t);
    if (!st) { melde(`Stein ${t} nicht gefunden.`, "fehler"); return; }
    set({ stein_id: st.id });
  }
  function nameVorschlag() {
    const h = s?.herstellungsart ? HERSTELLUNG[s.herstellungsart] : "";
    set({ name: [e.objektart, e.ort].filter(Boolean).join(" ") + (s ? ` – ${s.hbr_code}${h ? ` – ${h} Klinker` : ""}` : "") });
  }
  function bildHinzu() {
    const t = neuBild.trim();
    if (!t) return;
    const datei = t.replace(/^https?:\/\/(www\.)?klinkerhandel\.de\/wp-content\/uploads\//, "");
    if (!/^https?:\/\//.test(t) && !/^\d{4}\/\d{2}\/.+\.(jpe?g|png|webp)$/i.test(datei)) { melde("Bitte eine Bildadresse (https://…) oder einen Pfad wie 2024/05/bild.jpg angeben.", "fehler"); return; }
    let bid = d.bilder.find((x) => x.datei === datei)?.id;
    if (!bid) {
      bid = neueId();
      const neu = bid;
      if (!aendern((dd) => { dd.bilder.push({ id: neu, woo_media_id: null, datei, breite_px: 0, alt: "", geaendert_am: new Date().toISOString() }); })) return;
    }
    set({ bilder: [...e.bilder, bid] });
    setNeuBild("");
  }
  function speichern() {
    if (!e.name.trim()) { melde("Bitte einen Namen eingeben.", "fehler"); return; }
    if (e.status === "freigegeben" && (!e.stein_id || !e.bilder.length || !e.rubriken.length)) { melde("Zum Freigeben braucht die Referenz einen Stein, mindestens ein Bild und eine Rubrik.", "fehler"); return; }
    const ok = aendern((dd, von) => aendere(dd, "referenzen", r.id, offen as Partial<Referenz>, von, patch.v), "Referenz gespeichert.");
    if (ok) setPatch({ x: {}, v: z.daten.referenzen.find((x) => x.id === r.id)!.version });
  }
  async function loeschen() {
    if (r.woo_id) { if (await frage("Diese Referenz ist im Shop. Sie wird archiviert und beim nächsten Shop-Paket ausgeblendet.", "Archivieren", "Archivieren")) { aendern((dd, von) => aendere(dd, "referenzen", r.id, { status: "archiviert" }, von, r.version), "Archiviert."); } return; }
    if (!(await frage(`„${r.name}“ löschen?`, "Referenz löschen", "Löschen", true))) return;
    aendern((dd, von) => loesche(dd, "referenzen", r.id, von), "Gelöscht.");
    geheZu("produkte/referenzen");
  }
  const verlauf = d.aenderungen.filter((x) => x.tabelle === "referenzen" && x.id === r.id).slice(-8).reverse();

  return <>
    <Seitenkopf titel={r.name} text={<>Referenz · {STATUS_R[r.status]} · geändert {relZeit(r.geaendert_am)} von {r.geaendert_von}</>}>
      <a class="btn" href="#/produkte/referenzen">← Referenzen</a>
      {r.woo_id && <a class="btn" href={`https://www.klinkerhandel.de/?post_type=product&p=${r.woo_id}`} target="_blank" rel="noopener"><Icon n="shop" />Im Shop</a>}
    </Seitenkopf>
    {fremd && <div class="hinweisbox warn" style={{ marginBottom: 12 }}><span>Die Referenz wurde inzwischen anderweitig geändert. Speichern ist gesperrt.</span><div class="knopfreihe"><button class="btn klein" onClick={() => setPatch({ x: {}, v: r.version })}>Neu laden</button></div></div>}
    <div class="raster r-2-1">
      <div class="raster">
        <Karte titel="Angaben">
          <div class="formular">
            <Feld label="Name im Shop" klasse="breit"><div class="knopfreihe" style={{ flexWrap: "nowrap" }}><Text wert={e.name} setze={(v) => set({ name: v })} /><button class="btn klein" type="button" onClick={nameVorschlag}>Vorschlag</button></div></Feld>
            <Feld label="Objektart"><Auswahl wert={e.objektart ?? ""} setze={(v) => set({ objektart: v || null })} optionen={OBJEKTARTEN.map((x) => [x, x] as [string, string])} leer="–" /></Feld>
            <Feld label="Ort (optional)" hinweis="nur Ort, keine Adresse"><Text wert={e.ort} setze={(v) => set({ ort: v })} /></Feld>
            <Feld label="Status"><Auswahl wert={e.status} setze={(v) => set({ status: v })} optionen={STATUS_R} /></Feld>
            <Feld label="Verbauter Stein (HBR)" hinweis={s ? `${produkte.map((p) => ART[p.art]).join(" und ") || "keine Produkte"} verknüpft` : "z. B. HBR 21-110"}>
              <input type="text" class="mono" list="stein-codes" value={code} onInput={(x) => setCode((x.target as HTMLInputElement).value)} onBlur={() => steinSetzen(code)} onKeyDown={(x) => { if (x.key === "Enter") steinSetzen(code); }} />
            </Feld>
            <Feld label="Rubriken im Shop" klasse="breit"><Chips alle={REFERENZ_RUBRIKEN} gewaehlt={e.rubriken} setze={(v) => set({ rubriken: v })} /></Feld>
            <Feld label="Objekttext" klasse="breit" hinweis="Was wurde gebaut, wie wirkt der Stein, Besonderheiten. Keine Kundennamen oder Adressen ohne Einverständnis.">
              <textarea rows={5} value={e.beschreibung} onInput={(x) => set({ beschreibung: (x.target as HTMLTextAreaElement).value })} />
            </Feld>
          </div>
        </Karte>
        <Karte titel={`Bilder (${e.bilder.length})`} rechts={<span class="muted klein">Erstes Bild = Hauptbild</span>}>
          <div class="galerie">{e.bilder.map((bid, i) => { const b = a.bilder.get(bid); if (!b) return null; return <figure>
            <img src={bildUrl(b.datei)} alt={b.alt} loading="lazy" />
            <figcaption><div class="knopfreihe" style={{ gap: 4 }}>
              <button class="btn klein" disabled={i === 0} onClick={() => { const l = [...e.bilder]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; set({ bilder: l }); }} aria-label="Nach vorn">←</button>
              <button class="btn klein" disabled={i === e.bilder.length - 1} onClick={() => { const l = [...e.bilder]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; set({ bilder: l }); }} aria-label="Nach hinten">→</button>
              <button class="btn klein gefahr" onClick={() => set({ bilder: e.bilder.filter((x) => x !== bid) })}>Entfernen</button>
            </div>{!b.alt && <span class="marke warn">ohne Alt-Text</span>}</figcaption>
          </figure>; })}</div>
          <div class="knopfreihe" style={{ marginTop: 12 }}>
            <input type="text" style={{ maxWidth: 460 }} placeholder="Bildadresse aus der WordPress-Mediathek oder 2026/11/objekt.jpg" value={neuBild} onInput={(x) => setNeuBild((x.target as HTMLInputElement).value)} />
            <button class="btn" onClick={bildHinzu} disabled={z.nurLesen}><Icon n="plus" />Bild hinzufügen</button>
          </div>
        </Karte>
        <div class="karte" style={{ position: "sticky", bottom: 0, padding: "10px 16px", display: "flex", gap: 8, alignItems: "center" }}>
          <button class="btn gefahr klein" onClick={loeschen} disabled={z.nurLesen}>{r.woo_id ? "Archivieren" : "Löschen"}</button>
          <span class="muted klein" style={{ marginLeft: 8 }}>{geaendert ? "Ungespeicherte Änderungen" : "Alles gespeichert"}</span>
          <div class="knopfreihe" style={{ marginLeft: "auto" }}>
            <button class="btn" disabled={!geaendert} onClick={() => setPatch({ x: {}, v: r.version })}>Verwerfen</button>
            <button class="btn primaer" disabled={!geaendert || z.nurLesen || !!fremd} onClick={speichern}><Icon n="sichern" />Speichern</button>
          </div>
        </div>
      </div>
      <div class="raster" style={{ alignContent: "start" }}>
        <Karte titel="Verknüpfte Produkte">
          {produkte.length ? <div class="chips">{produkte.map((p) => <a class="chip mono" style={{ textDecoration: "none" }} href={`#/produkte/${p.id}`}>{ART[p.art]} {p.sku}</a>)}</div> : <p class="muted" style={{ margin: 0 }}>Noch kein Stein gewählt.</p>}
          {s && <p class="muted klein" style={{ marginBottom: 0 }}>Im Shop entstehen daraus die Links „Hier geht es zum Verblender/Riemchen“ sowie Farbe und Format: {s.farben.join(", ") || "–"} · {[...new Set(produkte.flatMap((p) => p.formate))].join(", ") || "–"}.</p>}
        </Karte>
        <Karte titel="Shop-Abgleich">
          <p style={{ margin: 0 }} class="klein">{r.woo_id ? `Im Shop als Produkt ${r.woo_id}.` : "Noch nicht im Shop."} {r.zuletzt_exportiert_version === r.version ? "Abgeglichen." : r.status === "freigegeben" ? "Kommt mit dem nächsten Shop-Paket." : "Wird erst nach Freigabe übertragen."}</p>
        </Karte>
        <Karte titel="Verlauf" ohnePadding>
          <ul class="feed">{verlauf.map((x) => <li><span class="wer">{x.von.slice(0, 2).toUpperCase()}</span><span>{x.aktion === "anlegen" ? "angelegt" : x.felder ? Object.keys(x.felder).join(", ") : x.aktion}</span><span class="faint nowrap">{datumZeit(x.zeit)}</span></li>)}
            {!verlauf.length && <li style={{ display: "block" }} class="muted">Seit der Übernahme nicht geändert.</li>}</ul>
        </Karte>
      </div>
    </div>
  </>;
}

/** Karte für das Produktdetail: Referenzen mit diesem Stein. */
export function ReferenzenZumStein({ steinId }: { steinId: number }) {
  const a = ab();
  const liste = useMemo(() => z.daten.referenzen.filter((r) => r.stein_id === steinId && r.status !== "archiviert"), [z.rev, steinId]);
  return <Karte titel={`Referenzen (${liste.length})`} rechts={<a class="btn klein" href={`#/produkte/referenzen/neu?stein=${steinId}`}><Icon n="plus" />Neu</a>}>
    {liste.length ? <div class="galerie" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))" }}>{liste.slice(0, 9).map((r) => { const b = r.bilder[0] ? a.bilder.get(r.bilder[0]) : undefined; return <a href={`#/produkte/referenzen/${r.id}`} title={r.name}><figure>{b ? <img src={bildUrl(b.datei)} alt={r.name} loading="lazy" /> : <div style={{ aspectRatio: "1" }} />}</figure></a>; })}</div>
      : <p class="muted" style={{ margin: 0 }}>Noch keine Referenz mit diesem Stein.</p>}
  </Karte>;
}
