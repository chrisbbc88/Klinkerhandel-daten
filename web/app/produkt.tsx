// Produktdetail: Daten, Bilder, Preise, Datenblatt-Abgleich, Hinweise, Verlauf.
import { useState, useMemo } from "preact/hooks";
import { z, aendern, frage, melde, ich } from "./store.ts";
import { ab, herstellerName, feldLabel, aenderungZeile } from "./abgeleitet.ts";
import { Seitenkopf, Karte, Icon, Feld, Zahl, Auswahl, Score, geheZu, datum, datumZeit, relZeit, Text, initialen } from "./ui.tsx";
import { SteinStamm, SteinTechnik, ProduktStamm, textVorschlag } from "./felder.tsx";
import { GepruefteDatenblaetter } from "./datenblatt.tsx";
import { KiDatenblatt, type GeladeneDatei } from "./ki.tsx";
import { aufSteinAnwenden, type KiVorschlag } from "../lib/ki.ts";
import { ReferenzenZumStein } from "./referenzen.tsx";
import { ART, STATUS, aktuellerPreis, heute, type Produkt, type Stein, type Preis } from "../lib/modell.ts";
import { pruefeProdukt, pruefeStein } from "../lib/pruefung.ts";
import { aendere, neueId, loesche } from "../lib/aendern.ts";
import { bildUrl } from "../lib/woo.ts";
import { euro } from "../lib/angebot.ts";

type Reiter = "daten" | "bilder" | "preise" | "datenblatt" | "hinweise" | "verlauf";
const gleich = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function ProduktDetail({ id, reiter }: { id: number; reiter?: string }) {
  const a = ab();
  const p = a.produkte.get(id);
  if (!p) return <Karte><p>Produkt nicht gefunden. Es wurde eventuell gelöscht oder stammt aus einem anderen Datenstand. <a href="#/produkte">Zum Bestand</a></p></Karte>;
  return <Detail key={id} p={p} reiter={(reiter as Reiter) ?? "daten"} />;
}

function Detail({ p, reiter }: { p: Produkt; reiter: Reiter }) {
  const d = z.daten, a = ab();
  const s = p.stein_id ? a.steine.get(p.stein_id) : undefined;
  // Entwurf = nur die eigenen, noch nicht gespeicherten Eingaben. Änderungen aus anderen Reitern (Bilder, Preise,
  // Datenblatt) erscheinen sofort; nur wenn eigene Eingaben offen sind UND der Datensatz sich geändert hat, gibt es einen Konflikt.
  const [patch, setPatch] = useState<{ p: Partial<Produkt>; s: Partial<Stein>; pv: number; sv?: number }>(() => ({ p: {}, s: {}, pv: p.version, sv: s?.version }));
  const offenP = Object.fromEntries(Object.entries(patch.p).filter(([k, v]) => !gleich(v, (p as any)[k])));
  const offenS = s ? Object.fromEntries(Object.entries(patch.s).filter(([k, v]) => !gleich(v, (s as any)[k]))) : {};
  const geaendert = Object.keys(offenP).length + Object.keys(offenS).length > 0;
  const entwurf = { p: { ...p, ...patch.p } as Produkt, s: s ? ({ ...s, ...patch.s } as Stein) : undefined };
  const fremdGeaendert = geaendert && (p.version !== patch.pv || (s && s.version !== patch.sv));
  if (!geaendert && (p.version !== patch.pv || s?.version !== patch.sv)) patch.pv = p.version, patch.sv = s?.version; // still nachziehen
  const geschwister = (p.stein_id ? a.geschwister.get(p.stein_id) ?? [] : []).filter((x) => x.id !== p.id);
  const setP = (x: Partial<Produkt>) => setPatch({ ...patch, p: { ...patch.p, ...x } });
  const setS = (x: Partial<Stein>) => setPatch({ ...patch, s: { ...patch.s, ...x } });
  const neuLaden = () => setPatch({ p: {}, s: {}, pv: p.version, sv: s?.version });

  const pruef = [...(entwurf.s ? pruefeStein(entwurf.s) : []), ...pruefeProdukt(entwurf.p, d)];
  const pflicht = pruef.filter((x) => x.schwere === "pflicht");
  const score = a.bewertung.get(p.id)!.score;

  function speichern() {
    if (entwurf.p.status === "freigegeben" && p.status !== "freigegeben" && pflicht.length) {
      melde(`Freigabe nicht möglich, es fehlen Pflichtangaben: ${pflicht.map((x) => x.text).join(", ")}.`, "fehler"); return;
    }
    const patchP = offenP as Partial<Produkt>;
    const patchS = offenS as Partial<Stein>;
    const ok = aendern((dd, von) => {
      if (Object.keys(patchS).length && s) {
        aendere(dd, "steine", s.id, patchS, von, patch.sv);
        if ("hersteller_id" in patchS) for (const g of dd.produkte) if (g.stein_id === s.id) aendere(dd, "produkte", g.id, { hersteller_id: patchS.hersteller_id ?? null }, von);
        if ("herstellungsart" in patchS) for (const g of dd.produkte) if (g.stein_id === s.id && g.name.includes(s.hbr_code)) {
          const neuName = g.name.replace(/(Handform|Strangpress|Wasserstrich)(?= Klinker)/, patchS.herstellungsart ? { handform: "Handform", strangpress: "Strangpress", wasserstrich: "Wasserstrich" }[patchS.herstellungsart] : "$1");
          if (neuName !== g.name && g.id !== p.id) aendere(dd, "produkte", g.id, { name: neuName }, von);
        }
      }
      if (Object.keys(patchP).length) aendere(dd, "produkte", p.id, patchP, von, patch.pv);
    }, "Gespeichert.");
    if (ok) {
      const np = z.daten.produkte.find((x) => x.id === p.id)!, ns = s ? z.daten.steine.find((x) => x.id === s.id) : undefined;
      setPatch({ p: {}, s: {}, pv: np.version, sv: ns?.version });
    }
  }

  async function archivieren() {
    if (!(await frage(`${p.sku ?? p.name} archivieren? Das Produkt verschwindet aus dem Bestand und wird beim nächsten Shop-Export ausgeblendet. Es bleibt im ERP erhalten.`, "Archivieren", "Archivieren"))) return;
    aendern((dd, von) => aendere(dd, "produkte", p.id, { status: "archiviert" }, von, p.version), "Archiviert.");
    neuLaden();
  }
  async function loeschen() {
    if (p.woo_id) { melde("Produkte, die im Shop existieren, werden archiviert statt gelöscht.", "fehler"); return; }
    if (!(await frage(`${p.sku ?? p.name} endgültig löschen? Das geht nur bei Produkten, die noch nie im Shop waren.`, "Löschen", "Löschen", true))) return;
    aendern((dd, von) => {
      loesche(dd, "produkte", p.id, von);
      if (p.stein_id && !dd.produkte.some((x) => x.stein_id === p.stein_id)) loesche(dd, "steine", p.stein_id, von);
    }, "Gelöscht.");
    geheZu("produkte");
  }

  const tab = (r: Reiter) => geheZu(`produkte/${p.id}/${r}`);
  const offeneHinweise = d.hinweise.filter((h) => h.status === "offen" && ((p.woo_id && h.woo_id === p.woo_id) || (s && h.hbr_code === s.hbr_code && h.objekt === "stein"))).length;
  const b0 = p.bilder[0] ? a.bilder.get(p.bilder[0]) : undefined;

  return <>
    <Seitenkopf titel={<span class="knopfreihe" style={{ gap: 10 }}>
      {b0 && <img src={bildUrl(b0.datei)} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />}
      <span><span class="mono" style={{ fontSize: 20 }}>{p.sku ?? "ohne Artikelnummer"}</span> <span class={`marke ${p.status === "freigegeben" ? "ok" : p.status === "pruefung" ? "warn" : ""}`}>{STATUS[p.status]}</span></span>
    </span>} text={<>{ART[p.art]} · {herstellerName(s?.hersteller_id) || "Hersteller fehlt"} · geändert {relZeit(p.geaendert_am)} von {p.geaendert_von}</>}>
      <a class="btn" href="#/produkte">← Bestand</a>
      {geschwister.map((g) => <a class="btn" href={`#/produkte/${g.id}`}>{ART[g.art]} {g.sku}</a>)}
      {p.woo_id && <a class="btn" href={`https://www.klinkerhandel.de/?post_type=product&p=${p.woo_id}`} target="_blank" rel="noopener"><Icon n="shop" />Im Shop</a>}
      {s && !geschwister.some((g) => g.art === (p.art === "riemchen" ? "verblender" : "riemchen")) && p.art !== "nistklinker" &&
        <a class="btn" href={`#/produkte/neu?stein=${s.id}&art=${p.art === "riemchen" ? "verblender" : "riemchen"}`}><Icon n="plus" />{p.art === "riemchen" ? "Verblender" : "Riemchen"} anlegen</a>}
    </Seitenkopf>

    <div class="reiter" role="tablist">
      {([["daten", "Daten"], ["bilder", `Bilder`, p.bilder.length], ["preise", "Preise", p.preise.length], ["datenblatt", "Datenblatt", s?.datenblaetter.length], ["hinweise", "Prüfung", pruef.length + offeneHinweise], ["verlauf", "Verlauf"]] as [Reiter, string, number?][]).map(([k, l, n]) =>
        <button role="tab" aria-selected={reiter === k} class={reiter === k ? "an" : ""} onClick={() => tab(k)}>{l}{n ? <span class="zahl">{n}</span> : null}</button>)}
    </div>

    {fremdGeaendert && <div class="hinweisbox warn" style={{ marginBottom: 12 }}><span>Dieser Datensatz wurde inzwischen geändert (z. B. durch Übernahme einer Sicherung). Speichern würde fremde Änderungen überschreiben und wird deshalb abgelehnt.</span><div class="knopfreihe"><button class="btn klein" onClick={neuLaden}>Neu laden (eigene Eingaben verwerfen)</button></div></div>}

    {reiter === "daten" && <div class="raster r-2-1">
      <div class="raster">
        <Karte titel="Produkt">
          <ProduktStamm p={entwurf.p} set={setP} />
          <div class="knopfreihe" style={{ marginTop: 8 }}>
            <button class="btn klein" onClick={() => setP({ beschreibung: textVorschlag(entwurf.p, entwurf.s, herstellerName(entwurf.s?.hersteller_id)) })} disabled={!entwurf.s}>Beschreibung aus Stammdaten vorschlagen</button>
            <span class="muted klein">Erzeugt einen sachlichen Grundtext zum Weiterschreiben.</span>
          </div>
        </Karte>
        {entwurf.s && <Karte titel={<h2>Stein {s!.hbr_code}</h2>} rechts={geschwister.length ? <span class="marke info">gilt auch für {geschwister.map((g) => g.sku).join(", ")}</span> : undefined}>
          <SteinStamm s={entwurf.s} set={setS} />
          <h3 style={{ margin: "18px 0 10px" }}>Technische Daten</h3>
          <SteinTechnik s={entwurf.s} set={setS} />
        </Karte>}
        <div class="karte" style={{ position: "sticky", bottom: 0, padding: "10px 16px", display: "flex", gap: 8, alignItems: "center", boxShadow: geaendert ? "0 -6px 20px rgba(0,0,0,.06)" : undefined }}>
          <span class="muted klein">{geaendert ? "Ungespeicherte Änderungen" : "Alles gespeichert"}</span>
          <div style={{ marginLeft: "auto" }} class="knopfreihe">
            <button class="btn" disabled={!geaendert} onClick={neuLaden}>Verwerfen</button>
            <button class="btn primaer" disabled={!geaendert || z.nurLesen || !!fremdGeaendert} onClick={speichern}><Icon n="sichern" />Speichern</button>
          </div>
        </div>
      </div>
      <div class="raster" style={{ alignContent: "start" }}>
        <Karte titel="Vollständigkeit" rechts={<Score wert={score} />}>
          {pruef.length === 0 ? <p class="muted" style={{ margin: 0 }}>Alles vollständig.</p> :
            <ul class="pruefliste">{pruef.map((x) => <li><span class={`marke ${x.schwere === "pflicht" ? "bad" : "warn"}`}>{x.schwere === "pflicht" ? "Pflicht" : "Empfohlen"}</span>{x.text}</li>)}</ul>}
        </Karte>
        <Karte titel="Preise je m²" rechts={<button class="btn klein" onClick={() => tab("preise")}>Pflegen</button>}>
          <dl class="dl">
            <dt>EK</dt><dd>{aktuellerPreis(p, "ek") ? euro(aktuellerPreis(p, "ek")!.betrag) : "–"}</dd>
            <dt>VK</dt><dd>{aktuellerPreis(p, "vk") ? euro(aktuellerPreis(p, "vk")!.betrag) : "–"}</dd>
          </dl>
        </Karte>
        {s && <ReferenzenZumStein steinId={s.id} />}
        <Karte titel="Aktionen">
          <div class="knopfreihe">
            <a class="btn klein" href={`#/angebote/neu?produkt=${p.id}`}><Icon n="angebote" />In neues Angebot</a>
            {p.status !== "archiviert" && <button class="btn klein" disabled={z.nurLesen} onClick={archivieren}>Archivieren</button>}
            {!p.woo_id && <button class="btn klein gefahr" disabled={z.nurLesen} onClick={loeschen}>Löschen</button>}
          </div>
        </Karte>
      </div>
    </div>}

    {reiter === "bilder" && <Bilder p={p} />}
    {reiter === "preise" && <Preise p={p} />}
    {reiter === "datenblatt" && (s ? <DatenblattReiter p={p} s={s} /> : <Karte><p>Diesem Produkt ist kein Stein zugeordnet.</p></Karte>)}
    {reiter === "hinweise" && <Hinweise p={p} s={s} pruef={pruef} />}
    {reiter === "verlauf" && <Verlauf p={p} s={s} />}
  </>;
}

function Bilder({ p }: { p: Produkt }) {
  const a = ab();
  const [neu, setNeu] = useState("");
  const verwendung = useMemo(() => { const m = new Map<number, number>(); for (const x of z.daten.produkte) for (const b of x.bilder) m.set(b, (m.get(b) ?? 0) + 1); return m; }, [z.rev]);
  const setBilder = (bilder: number[]) => aendern((dd, von) => aendere(dd, "produkte", p.id, { bilder }, von));
  const altSetzen = (id: number, alt: string) => aendern((dd, von) => aendere(dd, "bilder", id, { alt }, von));
  function hinzufuegen() {
    const t = neu.trim();
    if (!t) return;
    const datei = t.replace(/^https?:\/\/(www\.)?klinkerhandel\.de\/wp-content\/uploads\//, "");
    if (!/^https?:\/\//.test(t) && !/^\d{4}\/\d{2}\/.+\.(jpe?g|png|webp)$/i.test(datei)) { melde("Bitte eine Bildadresse (https://…) oder einen Pfad wie 2024/05/bild.jpg angeben.", "fehler"); return; }
    aendern((dd, von) => {
      let b = dd.bilder.find((x) => x.datei === datei);
      if (!b) { b = { id: neueId(), woo_media_id: null, datei, breite_px: 0, alt: "", geaendert_am: new Date().toISOString() }; dd.bilder.push(b); }
      aendere(dd, "produkte", p.id, { bilder: [...p.bilder, b.id] }, von);
    }, "Bild hinzugefügt.");
    setNeu("");
  }
  const sku = p.sku ?? "";
  return <Karte titel={`${p.bilder.length} Bilder`} rechts={<span class="muted klein">Erstes Bild = Hauptbild im Shop</span>}>
    <div class="galerie">
      {p.bilder.map((id, i) => { const b = a.bilder.get(id); if (!b) return null; const n = verwendung.get(id) ?? 1; return <figure>
        <a href={bildUrl(b.datei)} target="_blank" rel="noopener"><img src={bildUrl(b.datei)} alt={b.alt} loading="lazy" /></a>
        <figcaption>
          <AltText wert={b.alt} vorschlag={`${sku} ${i === 0 ? "Klinker Ansicht" : "Detail"}`.trim()} speichern={(v) => altSetzen(b.id, v)} />
          <div class="knopfreihe" style={{ gap: 4 }}>
            <button class="btn klein" disabled={i === 0} onClick={() => { const l = [...p.bilder]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; setBilder(l); }} aria-label="Nach vorn">←</button>
            <button class="btn klein" disabled={i === p.bilder.length - 1} onClick={() => { const l = [...p.bilder]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; setBilder(l); }} aria-label="Nach hinten">→</button>
            <button class="btn klein gefahr" onClick={() => setBilder(p.bilder.filter((x) => x !== id))} title="Nur aus diesem Produkt entfernen">Entfernen</button>
          </div>
          {n > 1 && <span class="faint klein">auch in {n - 1} weiteren Produkten</span>}
          {!b.alt && <span class="marke warn">ohne Alt-Text</span>}
        </figcaption>
      </figure>; })}
    </div>
    <div class="knopfreihe" style={{ marginTop: 16 }}>
      <input type="text" style={{ maxWidth: 480 }} placeholder="Bildadresse aus der WordPress-Mediathek oder Pfad 2024/05/bild.jpg" value={neu} onInput={(e) => setNeu((e.target as HTMLInputElement).value)} />
      <button class="btn" onClick={hinzufuegen} disabled={z.nurLesen}><Icon n="plus" />Bild hinzufügen</button>
    </div>
    <p class="muted klein">Bilddateien selbst werden in WordPress hochgeladen; das ERP verwaltet Reihenfolge, Zuordnung und Alt-Texte.</p>
  </Karte>;
}

function AltText({ wert, vorschlag, speichern }: { wert: string; vorschlag: string; speichern: (v: string) => void }) {
  const [t, setT] = useState(wert);
  return <input type="text" value={t} placeholder={`Alt-Text, z. B. ${vorschlag}`} onInput={(e) => setT((e.target as HTMLInputElement).value)} onBlur={() => { if (t.trim() !== wert) speichern(t.trim()); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Alt-Text" />;
}

function Preise({ p }: { p: Produkt }) {
  const [art, setArt] = useState<"ek" | "vk">("vk");
  const [einheit, setEinheit] = useState<Preis["einheit"]>("m2");
  const [betrag, setBetrag] = useState<number | null>(null);
  const [ab_, setAb] = useState(heute());
  const [quelle, setQuelle] = useState<Preis["quelle"]>("manuell");
  const [aufschlag, setAufschlag] = useState<number | null>(null);
  const ek = aktuellerPreis(p, "ek"), vk = aktuellerPreis(p, "vk");
  const EINHEIT = { m2: "m²", stk: "Stück", pal: "Palette" };
  function hinzu() {
    if (!betrag || betrag <= 0) { melde("Bitte einen Betrag größer 0 eingeben.", "fehler"); return; }
    aendern((dd, von) => aendere(dd, "produkte", p.id, { preise: [...p.preise, { id: neueId(), preisart: art, betrag: Math.round(betrag * 100) / 100, einheit, gueltig_ab: ab_, quelle, erfasst_von: von, erfasst_am: new Date().toISOString() }] }, von), "Preis gespeichert.");
    setBetrag(null);
  }
  async function entfernen(x: Preis) {
    if (!(await frage(`Preis ${x.preisart.toUpperCase()} ${euro(x.betrag)} ab ${datum(x.gueltig_ab)} löschen? Nur für Tippfehler gedacht – ein neuer Preis wird sonst einfach mit neuem Datum erfasst.`, "Preis löschen", "Löschen", true))) return;
    aendern((dd, von) => aendere(dd, "produkte", p.id, { preise: p.preise.filter((y) => y.id !== x.id) }, von), "Preis gelöscht.");
  }
  const h = heute();
  return <div class="raster r-2-1">
    <Karte titel="Preisverlauf" ohnePadding>
      <div class="tabelle-wrap"><table class="t">
        <thead><tr><th>Art</th><th>Einheit</th><th class="num">Betrag netto</th><th>gültig ab</th><th>Quelle</th><th>erfasst</th><th></th></tr></thead>
        <tbody>
          {[...p.preise].sort((x, y) => y.gueltig_ab.localeCompare(x.gueltig_ab) || y.erfasst_am.localeCompare(x.erfasst_am)).map((x) => {
            const aktuell = aktuellerPreis(p, x.preisart, x.einheit)?.id === x.id;
            return <tr>
              <td><span class={`marke ${x.preisart === "vk" ? "dunkel" : ""}`}>{x.preisart.toUpperCase()}</span></td>
              <td>{EINHEIT[x.einheit]}</td>
              <td class="num">{euro(x.betrag)}</td>
              <td>{datum(x.gueltig_ab)} {x.gueltig_ab > h ? <span class="marke info">geplant</span> : aktuell ? <span class="marke ok">aktuell</span> : null}</td>
              <td class="muted">{x.quelle === "lieferant" ? "Lieferant" : "manuell"}</td>
              <td class="muted klein">{x.erfasst_von}, {datum(x.erfasst_am)}</td>
              <td><button class="btn klein link" onClick={() => entfernen(x)}>löschen</button></td>
            </tr>;
          })}
          {!p.preise.length && <tr><td colSpan={7} class="leer">Noch keine Preise erfasst.</td></tr>}
        </tbody>
      </table></div>
    </Karte>
    <div class="raster" style={{ alignContent: "start" }}>
      <Karte titel="Neuer Preis">
        <div class="formular zwei">
          <Feld label="Preisart"><Auswahl wert={art} setze={setArt} optionen={[["vk", "Verkauf (VK)"], ["ek", "Einkauf (EK)"]]} /></Feld>
          <Feld label="Einheit"><Auswahl wert={einheit} setze={setEinheit} optionen={[["m2", "je m²"], ["stk", "je Stück"], ["pal", "je Palette"]]} /></Feld>
          <Feld label="Betrag netto €"><Zahl wert={betrag} setze={setBetrag} /></Feld>
          <Feld label="gültig ab"><input type="date" value={ab_} onInput={(e) => setAb((e.target as HTMLInputElement).value)} /></Feld>
          <Feld label="Quelle"><Auswahl wert={quelle} setze={setQuelle} optionen={[["manuell", "manuell"], ["lieferant", "Preisliste Lieferant"]]} /></Feld>
        </div>
        {art === "vk" && ek && einheit === "m2" && <div class="knopfreihe" style={{ marginTop: 10 }}>
          <span class="muted klein">Aus EK {euro(ek.betrag)} mit Aufschlag</span>
          <span style={{ width: 70 }}><Zahl wert={aufschlag} setze={setAufschlag} aria-label="Aufschlag in Prozent" /></span><span>%</span>
          <button class="btn klein" disabled={aufschlag == null} onClick={() => setBetrag(Math.round(ek.betrag * (1 + (aufschlag ?? 0) / 100) * 100) / 100)}>übernehmen</button>
        </div>}
        <button class="btn primaer" style={{ marginTop: 12 }} onClick={hinzu} disabled={z.nurLesen}>Preis speichern</button>
      </Karte>
      {ek && vk && <Karte titel="Kalkulation je m²">
        <dl class="dl"><dt>EK</dt><dd>{euro(ek.betrag)}</dd><dt>VK</dt><dd>{euro(vk.betrag)}</dd>
          <dt>Rohertrag</dt><dd>{euro(vk.betrag - ek.betrag)}</dd>
          <dt>Aufschlag</dt><dd>{((vk.betrag / ek.betrag - 1) * 100).toFixed(1).replace(".", ",")} %</dd>
          <dt>Spanne</dt><dd>{(((vk.betrag - ek.betrag) / vk.betrag) * 100).toFixed(1).replace(".", ",")} %</dd></dl>
      </Karte>}
    </div>
  </div>;
}

function Hinweise({ p, s, pruef }: { p: Produkt; s?: Stein; pruef: { regel: string; schwere: string; text: string }[] }) {
  const liste = z.daten.hinweise.filter((h) => (p.woo_id && h.woo_id === p.woo_id) || (s && h.hbr_code === s.hbr_code));
  const setStatus = (id: number, status: "erledigt" | "ignoriert" | "offen") => aendern((dd, von) => {
    const h = dd.hinweise.find((x) => x.id === id)!;
    h.status = status; h.erledigt_von = status === "offen" ? null : von; h.erledigt_am = status === "offen" ? null : new Date().toISOString();
    dd.aenderungen.push({ zeit: new Date().toISOString(), von, tabelle: "hinweise", id, aktion: "aendern", felder: { status: ["", status] }, text: h.text });
  });
  return <div class="raster r2">
    <Karte titel="Laufende Prüfung">
      {pruef.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{pruef.map((x) => <li>{x.text} <span class="muted klein">({x.schwere})</span></li>)}</ul> : <p class="muted">Keine Lücken.</p>}
      <p class="muted klein">Diese Punkte verschwinden automatisch, sobald die Angabe gepflegt ist.</p>
    </Karte>
    <Karte titel="Hinweise aus dem Shop-Abgleich" ohnePadding>
      <table class="t"><tbody>
        {liste.map((h) => <tr>
          <td><span class={`marke ${h.schwere === "pflicht" ? "bad" : h.schwere === "info" ? "info" : "warn"}`}>{h.schwere}</span></td>
          <td>{h.text}{h.status !== "offen" && <div class="faint klein">{h.status} von {h.erledigt_von}, {datum(h.erledigt_am)}</div>}</td>
          <td class="nowrap">{h.status === "offen" ? <>
            <button class="btn klein" onClick={() => setStatus(h.id, "erledigt")}>Erledigt</button> <button class="btn klein" onClick={() => setStatus(h.id, "ignoriert")}>Ignorieren</button>
          </> : <button class="btn klein link" onClick={() => setStatus(h.id, "offen")}>wieder öffnen</button>}</td>
        </tr>)}
        {!liste.length && <tr><td class="leer">Keine Hinweise.</td></tr>}
      </tbody></table>
    </Karte>
  </div>;
}

function Verlauf({ p, s }: { p: Produkt; s?: Stein }) {
  const eintraege = z.daten.aenderungen.filter((e) => (e.tabelle === "produkte" && e.id === p.id) || (s && e.tabelle === "steine" && e.id === s.id)).reverse();
  const wert = (v: unknown) => v === null || v === undefined || v === "" ? "–" : Array.isArray(v) ? (v.length && typeof v[0] === "object" ? `${v.length} Einträge` : v.join(", ") || "–") : typeof v === "object" ? "…" : String(v).slice(0, 120);
  return <Karte titel={`Verlauf (${eintraege.length})`} ohnePadding>
    <table class="t">
      <thead><tr><th>Wann</th><th>Wer</th><th>Was</th><th>Änderung</th></tr></thead>
      <tbody>
        {eintraege.map((e) => <tr>
          <td class="nowrap">{datumZeit(e.zeit)}</td>
          <td class="nowrap"><span class="wer" style={{ marginRight: 6 }}>{initialen(e.von)}</span>{e.von}</td>
          <td>{e.tabelle === "steine" ? "Stein" : "Produkt"} {e.aktion === "anlegen" ? "angelegt" : e.aktion === "loeschen" ? "gelöscht" : ""}</td>
          <td>{e.felder ? Object.entries(e.felder).map(([f, [alt, neu]]) => <div><b style={{ fontWeight: 500 }}>{feldLabel(f)}:</b> <span class="diff-alt">{wert(alt)}</span> → <span class="diff-neu">{wert(neu)}</span></div>) : aenderungZeile(e).text}</td>
        </tr>)}
        {!eintraege.length && <tr><td colSpan={4} class="leer">Seit der Übernahme nicht geändert.</td></tr>}
      </tbody>
    </table>
  </Karte>;
}



function DatenblattReiter({ p, s }: { p: Produkt; s: Stein }) {
  const aktuell = (feld: string): unknown => feld === "art" ? p.art : ["formate", "riemchen_staerke_mm", "beschreibung"].includes(feld) ? (p as any)[feld] : (s as any)[feld] ?? null;
  function uebernehmen(gewaehlt: KiVorschlag[], datei: GeladeneDatei) {
    const steinPatch = aufSteinAnwenden(s, gewaehlt);
    const prodPatch: Partial<Produkt> = {};
    for (const v of gewaehlt) if (v.ziel === "produkt" && !(v.feld === "riemchen_staerke_mm" && p.art !== "riemchen")) (prodPatch as any)[v.feld] = v.wert;
    const felder = gewaehlt.filter((v) => v.ziel !== "art").map((v) => v.feld);
    aendern((dd, von) => {
      aendere(dd, "steine", s.id, { ...steinPatch, datenblaetter: [...s.datenblaetter.filter((x) => x.sha256 !== datei.sha), { dateiname: datei.name, sha256: datei.sha, geprueft_am: new Date().toISOString(), geprueft_von: von, felder }] }, von, s.version);
      if (steinPatch.hersteller_id !== undefined) for (const g of dd.produkte) if (g.stein_id === s.id) aendere(dd, "produkte", g.id, { hersteller_id: steinPatch.hersteller_id }, von);
      if (Object.keys(prodPatch).length) aendere(dd, "produkte", p.id, prodPatch, von, p.version);
    }, felder.length ? `${felder.length} Werte übernommen, Datenblatt als geprüft vermerkt.` : "Datenblatt als geprüft vermerkt.");
  }
  return <div class="raster">
    <KiDatenblatt titel={`Datenblatt abgleichen – Stein ${s.hbr_code}`} knopfText="Übernehmen und als geprüft vermerken" aktuell={aktuell} onUebernehmen={uebernehmen} />
    <p class="muted klein" style={{ margin: 0 }}>Werte am Stein gelten für Verblender und Riemchen gemeinsam. Formate und Beschreibung werden nur bei diesem Produkt ({p.sku}) gesetzt.</p>
    <GepruefteDatenblaetter stein={s} />
  </div>;
}
