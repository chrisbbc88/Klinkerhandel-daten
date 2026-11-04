// Produktbereiche: Preispflege, Hinweise, Referenzen.
import { useMemo, useState } from "preact/hooks";
import { z, aendern, frage, melde } from "./store.ts";
import { ab, herstellerName } from "./abgeleitet.ts";
import { Seitenkopf, Karte, Auswahl, Zahl, Seiten, useSortierung, geheZu, datum, Feld } from "./ui.tsx";
import { ART, aktuellerPreis, heute, type Produkt, type Preis, type Hinweis } from "../lib/modell.ts";
import { aendere, neueId } from "../lib/aendern.ts";
import { bildUrl } from "../lib/woo.ts";
import { euro } from "../lib/angebot.ts";

// ---------- Preise ----------
/** Eine Zeile je Produkt und Format. Bei Produkten mit nur einem Format gilt der Preis allgemein (ohne Format). */
interface PreisZeile { k: string; p: Produkt; format: string; eigen: boolean }

export function PreisPflege() {
  const d = z.daten, a = ab();
  const [q, setQ] = useState(""); const [herst, setHerst] = useState(""); const [art, setArt] = useState(""); const [fmt, setFmt] = useState(""); const [nurOhne, setNurOhne] = useState(false);
  const [neu, setNeu] = useState<Record<string, { vk?: number | null; ek?: number | null }>>({});
  const [abDatum, setAbDatum] = useState(heute());
  const [regel, setRegel] = useState<"aufschlag" | "erhoehen">("aufschlag");
  const [prozent, setProzent] = useState<number | null>(null);
  const [seite, setSeite] = useState(0);
  const pr = (z_: PreisZeile, art_: "ek" | "vk") => aktuellerPreis(z_.p, art_, "m2", undefined, z_.eigen ? z_.format : undefined);

  const liste = useMemo(() => {
    const out: PreisZeile[] = [];
    for (const p of d.produkte) {
      if (p.status === "archiviert" || p.art === "nistklinker") continue;
      const s = p.stein_id ? a.steine.get(p.stein_id) : undefined;
      if (herst && String(s?.hersteller_id) !== herst) continue;
      if (art && p.art !== art) continue;
      if (q && !`${p.sku} ${p.name}`.toLowerCase().includes(q.toLowerCase())) continue;
      const formate = p.formate.length > 1 ? p.formate : [p.formate[0] ?? ""];
      for (const f of formate) {
        if (fmt && f !== fmt) continue;
        const zz: PreisZeile = { k: `${p.id}:${f}`, p, format: f, eigen: p.formate.length > 1 };
        const v = pr(zz, "vk");
        if (nurOhne && (zz.eigen ? v?.format === f : !!v)) continue;
        out.push(zz);
      }
    }
    return out;
  }, [z.rev, q, herst, art, fmt, nurOhne]);
  const { sortiert, Kopf } = useSortierung<PreisZeile>(liste, "sku", {
    sku: (x) => `${x.p.sku ?? ""} ${x.format}`, ek: (x) => pr(x, "ek")?.betrag ?? null, vk: (x) => pr(x, "vk")?.betrag ?? null,
    auf: (x) => { const e = pr(x, "ek"), v = pr(x, "vk"); return e && v ? v.betrag / e.betrag : null; },
  });
  const offen = Object.entries(neu).filter(([, v]) => v.vk || v.ek);

  function vorschlagRegel() {
    if (prozent == null) return;
    const n: typeof neu = { ...neu };
    let k = 0;
    for (const x of liste) {
      const e = pr(x, "ek")?.betrag, v = pr(x, "vk")?.betrag;
      const basis = regel === "aufschlag" ? e : v;
      if (!basis) continue;
      n[x.k] = { ...n[x.k], vk: Math.round(basis * (1 + prozent / 100) * 100) / 100 }; k++;
    }
    setNeu(n);
    melde(`${k} neue VK-Preise vorgeschlagen. Bitte prüfen und dann speichern.`, "info");
  }

  async function speichern() {
    if (offen.length > 50 && !(await frage(`${offen.length} Preiszeilen erhalten neue Preise ab ${datum(abDatum)}.`, "Preise speichern", "Speichern"))) return;
    aendern((dd, von) => {
      const jetzt = new Date().toISOString();
      const jeProdukt = new Map<number, Preis[]>();
      for (const [k, v] of offen) {
        const [id, f] = [Number(k.split(":")[0]), k.slice(k.indexOf(":") + 1)];
        const p = dd.produkte.find((x) => x.id === id)!;
        const format = p.formate.length > 1 && f ? { format: f } : {};
        const add = jeProdukt.get(id) ?? [];
        if (v.vk) add.push({ id: neueId(), preisart: "vk", betrag: v.vk, einheit: "m2", gueltig_ab: abDatum, quelle: "manuell", erfasst_von: von, erfasst_am: jetzt, ...format });
        if (v.ek) add.push({ id: neueId(), preisart: "ek", betrag: v.ek, einheit: "m2", gueltig_ab: abDatum, quelle: "lieferant", erfasst_von: von, erfasst_am: jetzt, ...format });
        jeProdukt.set(id, add);
      }
      for (const [id, add] of jeProdukt) { const p = dd.produkte.find((x) => x.id === id)!; aendere(dd, "produkte", id, { preise: [...p.preise, ...add] }, von); }
    }, `${offen.length} Preise gespeichert.`);
    setNeu({});
  }

  const sichtbar = sortiert.slice(seite * 50, seite * 50 + 50);
  return <>
    <Seitenkopf titel="Preise" text="Einkaufs- und Verkaufspreise je m², bei mehreren Formaten je Format. Neue Preise werden mit Gültigkeitsdatum ergänzt, alte bleiben im Verlauf.">
      <span class="muted">gültig ab</span><input type="date" style={{ width: 150 }} value={abDatum} onInput={(e) => setAbDatum((e.target as HTMLInputElement).value)} />
      <button class="btn primaer" disabled={!offen.length || z.nurLesen} onClick={speichern}>{offen.length} Preise speichern</button>
    </Seitenkopf>
    <Karte ohnePadding>
      <div class="filterleiste">
        <input type="search" placeholder="Suche" value={q} onInput={(e) => { setQ((e.target as HTMLInputElement).value); setSeite(0); }} />
        <Auswahl wert={herst} setze={(v) => { setHerst(v); setSeite(0); }} optionen={d.hersteller.map((h) => [String(h.id), h.name] as [string, string])} leer="Alle Hersteller" />
        <Auswahl wert={art} setze={(v) => { setArt(v); setSeite(0); }} optionen={[["verblender", "Verblender"], ["riemchen", "Riemchen"], ["daemmklinker", "Dämmklinker"]]} leer="Alle Arten" />
        <Auswahl wert={fmt} setze={(v) => { setFmt(v); setSeite(0); }} optionen={d.formate.map((f) => [f.kuerzel, f.kuerzel] as [string, string])} leer="Alle Formate" aria-label="Format" />
        <label class="check"><input type="checkbox" checked={nurOhne} onChange={(e) => { setNurOhne((e.target as HTMLInputElement).checked); setSeite(0); }} /> nur ohne eigenen VK</label>
        <span style={{ marginLeft: "auto" }} class="knopfreihe">
          <Auswahl wert={regel} setze={setRegel} optionen={[["aufschlag", "VK = EK + Aufschlag"], ["erhoehen", "VK erhöhen um"]]} />
          <span style={{ width: 70 }}><Zahl wert={prozent} setze={setProzent} aria-label="Prozent" /></span>%
          <button class="btn klein" disabled={prozent == null} onClick={vorschlagRegel}>Für {liste.length} vorschlagen</button>
        </span>
      </div>
      <div class="tabelle-wrap">
        <table class="t">
          <thead><tr><Kopf feld="sku">Artikelnummer</Kopf><th>Format</th><th>Art</th><th>Hersteller</th><Kopf feld="ek" klasse="num">EK/m²</Kopf><th style={{ width: 110 }}>neuer EK</th><Kopf feld="vk" klasse="num">VK/m²</Kopf><th style={{ width: 110 }}>neuer VK</th><Kopf feld="auf" klasse="num">Aufschlag</Kopf></tr></thead>
          <tbody>{sichtbar.map((x) => {
            const p = x.p, e = pr(x, "ek"), v = pr(x, "vk"), n = neu[x.k] ?? {};
            const ee = n.ek ?? e?.betrag, vv = n.vk ?? v?.betrag;
            const allg = (y: Preis | null) => (x.eigen && y && !y.format ? <span class="faint klein"> allg.</span> : null);
            return <tr>
              <td><a class="mono" href={`#/produkte/${p.id}/preise`}>{p.sku ?? p.name.slice(0, 30)}</a></td>
              <td class="mono">{x.format || "–"}</td>
              <td>{ART[p.art]}</td><td>{herstellerName(a.steine.get(p.stein_id ?? -1)?.hersteller_id)}</td>
              <td class="num">{e ? euro(e.betrag) : "–"}{allg(e)}</td>
              <td><Zahl wert={n.ek ?? null} setze={(y) => setNeu({ ...neu, [x.k]: { ...n, ek: y } })} aria-label={`Neuer EK ${p.sku} ${x.format}`} /></td>
              <td class="num">{v ? euro(v.betrag) : "–"}{allg(v)}</td>
              <td><Zahl wert={n.vk ?? null} setze={(y) => setNeu({ ...neu, [x.k]: { ...n, vk: y } })} aria-label={`Neuer VK ${p.sku} ${x.format}`} /></td>
              <td class="num">{ee && vv ? `${((vv / ee - 1) * 100).toFixed(0)} %` : "–"}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <Seiten seite={seite} setSeite={setSeite} gesamt={sortiert.length} proSeite={50} />
      <p class="muted klein" style={{ padding: "0 16px 12px" }}>„allg.“ = für dieses Format gilt noch der allgemeine Preis des Produkts. Ein hier eingetragener Preis gilt nur für das Format der Zeile.</p>
    </Karte>
  </>;
}

// ---------- Hinweise ----------
const REGEL_TITEL: Record<string, string> = {
  kategorie_falsch: "Riemchen in Kategorie Verblender", code_doppelt: "HBR-Code doppelt im Shop", keine_kategorie: "Ohne Kategorie", herstellungsart_mehrere: "Mehrere Herstellungsarten",
  code_schreibweise: "HBR-Code falsch geschrieben", kurztext_farbe: "Kurztext widerspricht Farbe", kurztext_format: "Kurztext widerspricht Format", bild_doppelt: "Bild mehrfach im selben Produkt",
  referenz_ohne_text: "Referenz ohne Objekttext", referenz_link_alt: "Referenz verlinkt auf alte Adresse", referenz_ohne_stein: "Referenz ohne Stein", farben_verblender_riemchen: "Farben Verblender/Riemchen verschieden",
  kein_gegenstueck: "Kein Gegenstück Verblender/Riemchen", referenz_ohne_link: "Referenz ohne Produktlink", referenz_ohne_rubrik: "Referenz ohne Rubrik",
};
export function HinweisListe() {
  const d = z.daten, a = ab();
  const [status, setStatus] = useState<"offen" | "erledigt" | "ignoriert">("offen");
  const [regel, setRegel] = useState("");
  const nachWoo = new Map(d.produkte.filter((p) => p.woo_id).map((p) => [p.woo_id!, p]));
  const nachCode = new Map(d.steine.map((s) => [s.hbr_code, s]));
  const liste = d.hinweise.filter((h) => h.status === status && (!regel || h.regel === regel));
  const gruppen = new Map<string, number>();
  for (const h of d.hinweise) if (h.status === status) gruppen.set(h.regel, (gruppen.get(h.regel) ?? 0) + 1);
  const ziel = (h: Hinweis) => {
    const p = h.woo_id ? nachWoo.get(h.woo_id) : undefined;
    if (p) return `produkte/${p.id}/hinweise`;
    const s = h.hbr_code ? nachCode.get(h.hbr_code) : undefined;
    const g = s ? a.geschwister.get(s.id)?.[0] : undefined;
    if (g) return `produkte/${g.id}/hinweise`;
    if (h.objekt === "referenz") return "produkte/referenzen";
    return null;
  };
  const setze = (ids: number[], st: Hinweis["status"]) => aendern((dd, von) => {
    const jetzt = new Date().toISOString();
    for (const id of ids) { const h = dd.hinweise.find((x) => x.id === id)!; h.status = st; h.erledigt_von = st === "offen" ? null : von; h.erledigt_am = st === "offen" ? null : jetzt; }
    dd.aenderungen.push({ zeit: jetzt, von, tabelle: "hinweise", id: ids.length === 1 ? ids[0] : 0, aktion: "aendern", felder: null, text: `${ids.length} Hinweise: ${st}` });
  });
  return <>
    <Seitenkopf titel="Hinweise aus dem Shop-Abgleich" text="Befunde, die sich nicht automatisch aus den Daten prüfen lassen. Laufende Lücken (Hersteller, Bilder, Texte …) stehen direkt am Produkt und im Dashboard." />
    <div class="raster r-nav">
      <Karte ohnePadding>
        <div class="filterleiste"><Auswahl wert={status} setze={(v) => { setStatus(v); setRegel(""); }} optionen={[["offen", "Offen"], ["erledigt", "Erledigt"], ["ignoriert", "Ignoriert"]]} /></div>
        <div style={{ padding: 6 }}>
          <div class={`leiste klickbar`} style={{ gridTemplateColumns: "1fr 40px", padding: "6px 8px", fontWeight: regel ? 400 : 600 }} onClick={() => setRegel("")}><span>Alle</span><span class="num">{[...gruppen.values()].reduce((x, y) => x + y, 0)}</span></div>
          {[...gruppen].sort((x, y) => y[1] - x[1]).map(([r, n]) => <div class="leiste klickbar" style={{ gridTemplateColumns: "1fr 40px", padding: "6px 8px", fontWeight: regel === r ? 600 : 400 }} onClick={() => setRegel(r)}><span>{REGEL_TITEL[r] ?? r}</span><span class="num">{n}</span></div>)}
        </div>
      </Karte>
      <Karte ohnePadding titel={`${liste.length} Hinweise`} rechts={status === "offen" && regel && liste.length > 0 ? <button class="btn klein" onClick={async () => { if (await frage(`Alle ${liste.length} Hinweise „${REGEL_TITEL[regel] ?? regel}“ als ignoriert markieren?`, "Ignorieren", "Ignorieren")) setze(liste.map((h) => h.id), "ignoriert"); }}>Alle ignorieren</button> : undefined}>
        <div class="tabelle-wrap" style={{ maxHeight: "70vh" }}>
          <table class="t"><tbody>
            {liste.slice(0, 300).map((h) => { const zl = ziel(h); return <tr>
              <td><span class={`marke ${h.schwere === "pflicht" ? "bad" : h.schwere === "info" ? "info" : "warn"}`}>{h.schwere}</span></td>
              <td class="mono nowrap">{h.hbr_code ?? "–"}</td>
              <td>{h.text}</td>
              <td class="nowrap">{zl && <button class="btn klein" onClick={() => geheZu(zl)}>Öffnen</button>} {status === "offen" ? <><button class="btn klein" onClick={() => setze([h.id], "erledigt")}>Erledigt</button> <button class="btn klein" onClick={() => setze([h.id], "ignoriert")}>Ignorieren</button></> : <button class="btn klein link" onClick={() => setze([h.id], "offen")}>wieder öffnen</button>}</td>
            </tr>; })}
            {liste.length > 300 && <tr><td colSpan={4} class="muted">… {liste.length - 300} weitere – bitte links eine Gruppe wählen.</td></tr>}
            {!liste.length && <tr><td class="leer">Keine Hinweise.</td></tr>}
          </tbody></table>
        </div>
      </Karte>
    </div>
  </>;
}

export function SteinCodes() {
  return <datalist id="stein-codes">{z.daten.steine.map((s) => <option value={s.hbr_code} />)}</datalist>;
}
