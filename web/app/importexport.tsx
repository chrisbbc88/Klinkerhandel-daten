// Import & Export: Produkt-CSV, WooCommerce-Paket, neuer Shop-Stand.
import { useState } from "preact/hooks";
import { z, aendern, frage, melde, sichern, ich } from "./store.ts";
import { ab } from "./abgeleitet.ts";
import { Seitenkopf, Karte, Icon, datumZeit, geheZu } from "./ui.tsx";
import { produkteCsv, produktImportPlanen, produktImportAusfuehren, wertText, SPALTEN, type ImportPlan } from "../lib/produktcsv.ts";
import { csvText } from "../lib/csv.ts";
import { exportKandidaten, wooPaket, alsExportiertMarkieren } from "../lib/woo.ts";
import { shopVergleichen, shopNeueUebernehmen, type ShopVergleich } from "../lib/shopabgleich.ts";
import { herunterladen, dateiWaehlen } from "../lib/speicher.ts";
import { ART } from "../lib/modell.ts";
import type { Bestand } from "../../src/import/bestand.ts";

const AKTION = { neu: ["Neu", "info"], aendern: ["Änderung", "dunkel"], gleich: ["unverändert", ""], fehler: ["Fehler", "bad"] } as const;

export function ImportExport() {
  const d = z.daten;
  const a = ab();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [datei, setDatei] = useState<{ name: string; text: string } | null>(null);
  const [neueAnlegen, setNeueAnlegen] = useState(true);
  const [nurProbleme, setNurProbleme] = useState(true);
  const [paketIds, setPaketIds] = useState<number[] | null>(null);
  const [shop, setShop] = useState<{ v: ShopVergleich; b: Bestand; name: string } | null>(null);
  const exp = exportKandidaten(d);
  const heute = new Date().toISOString().slice(0, 10);

  async function csvWaehlen() {
    const f = await dateiWaehlen(".csv,text/csv,.txt");
    if (!f) return;
    let text = await f.text();
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(await f.arrayBuffer()); // ältere Excel-Exporte
    setDatei({ name: f.name, text });
    setPlan(produktImportPlanen(d, text, { neueAnlegen }));
  }
  async function uebernehmen() {
    if (!plan) return;
    const n = plan.zeilen.filter((x) => x.aktion === "neu" || x.aktion === "aendern").length;
    if (n > 50 && !(await frage(`${n} Produkte werden geändert oder angelegt. Fehlerhafte Zeilen werden übersprungen.`, "Großen Import übernehmen", "Übernehmen"))) return;
    if (z.ordner === "erlaubt") await sichern(true, "vor-import");
    let r = { geaendert: 0, neu: 0 };
    const ok = aendern((dd, von) => {
      r = produktImportAusfuehren(dd, plan, von);
      dd.aenderungen.push({ zeit: new Date().toISOString(), von, tabelle: "system", id: 0, aktion: "aendern", felder: null, text: `CSV-Import ${datei?.name}: ${r.geaendert} geändert, ${r.neu} neu` });
    });
    if (ok) { melde(`Import übernommen: ${r.geaendert} geändert, ${r.neu} neu.`); setPlan(null); setDatei(null); }
  }

  function paket() {
    const k = exp.offen;
    if (!k.length) return;
    herunterladen(`woocommerce-paket_${heute}.json`, JSON.stringify(wooPaket(d, k, ich()), null, 2));
    setPaketIds(k.map((x) => x.p.id));
  }
  async function markieren() {
    if (!paketIds) return;
    if (!(await frage(`Nur bestätigen, wenn das Paket mit ${paketIds.length} Produkten im Shop eingespielt wurde. Danach gelten diese Produkte als abgeglichen.`, "Im Shop eingespielt?", "Ja, eingespielt"))) return;
    aendern((dd, von) => alsExportiertMarkieren(dd, paketIds, von), `${paketIds.length} Produkte als abgeglichen markiert.`);
    setPaketIds(null);
  }

  async function shopWaehlen() {
    const f = await dateiWaehlen(".json,application/json");
    if (!f) return;
    try {
      const b = JSON.parse(await f.text());
      if (!Array.isArray(b?.produkte) || !Array.isArray(b?.kategorien)) { melde("Das ist keine Bestandsdatei aus dem Shop (erwartet: produkte und kategorien).", "fehler"); return; }
      if (b.produkte.length < 100) { melde(`Die Datei enthält nur ${b.produkte.length} Produkte – vermutlich unvollständig. Abgebrochen.`, "fehler"); return; }
      setShop({ v: shopVergleichen(d, b), b, name: f.name });
    } catch (e) { melde(`Datei nicht lesbar: ${(e as Error).message}`, "fehler"); }
  }
  function shopUebernehmen() {
    if (!shop) return;
    let r: ReturnType<typeof shopNeueUebernehmen> | null = null;
    aendern((dd, von) => { r = shopNeueUebernehmen(dd, shop.b, von); });
    if (r) { const x = r as ReturnType<typeof shopNeueUebernehmen>; melde(`${x.produkte} Produkte, ${x.steine} Steine, ${x.referenzen} Referenzen übernommen${x.uebersprungen.length ? `, ${x.uebersprungen.length} übersprungen` : ""}.`); if (x.uebersprungen.length) melde(x.uebersprungen.slice(0, 3).join(" · "), "info"); }
    setShop(null);
  }

  const zaehl = (k: string) => plan?.zeilen.filter((x) => x.aktion === k).length ?? 0;
  const zeilen = plan ? plan.zeilen.filter((x) => !nurProbleme || x.aktion !== "gleich") : [];

  return <>
    <Seitenkopf titel="Import & Export" text="Produkte mit Excel bearbeiten, Shop-Paket erzeugen, neuen Shop-Stand einlesen." />
    <div class="raster r3" style={{ marginBottom: 16 }}>
      <Karte titel="Produkte exportieren">
        <p class="muted" style={{ marginTop: 0 }}>CSV für Excel (Semikolon, UTF-8). Stein-Angaben wie Hersteller oder Maße stehen bei Verblender und Riemchen jeweils mit drin.</p>
        <div class="knopfreihe">
          <button class="btn dunkel" onClick={() => herunterladen(`produkte_${heute}.csv`, produkteCsv(d, d.produkte.filter((p) => p.status !== "archiviert")), "text/csv;charset=utf-8")}><Icon n="download" />Alle aktiven ({d.produkte.filter((p) => p.status !== "archiviert").length})</button>
          <button class="btn" onClick={() => herunterladen(`produkte-vorlage.csv`, csvText(SPALTEN.map((s) => s.kopf), [["HBR 11-150", "Verblender", "", "Entwurf", "Vandersanden Klinker", "Handform", "rot, braun", "WDF", "besandet", 210, 100, 65, 2.1, 25, 6.5, "F2", 73, "", "", 38.5, 59.9, "01.12.2026", "", "", "", "", "", "", "", ""]]), "text/csv;charset=utf-8")}>Vorlage für neue Produkte</button>
        </div>
      </Karte>
      <Karte titel="Produkte importieren">
        <p class="muted" style={{ marginTop: 0 }}>Zuordnung über die Artikelnummer. Leere Zellen bleiben unverändert, <code>LEEREN</code> löscht einen Wert. Neue Preise erhalten das Datum aus „preis_gueltig_ab“.</p>
        <label class="check" style={{ marginBottom: 10 }}><input type="checkbox" checked={neueAnlegen} onChange={(e) => { const v = (e.target as HTMLInputElement).checked; setNeueAnlegen(v); if (datei) setPlan(produktImportPlanen(d, datei.text, { neueAnlegen: v })); }} /> Unbekannte Artikelnummern als neue Produkte anlegen</label>
        <button class="btn dunkel" disabled={z.nurLesen} onClick={csvWaehlen}><Icon n="upload" />CSV-Datei wählen…</button>
      </Karte>
      <Karte titel="Neuer Shop-Stand">
        <p class="muted" style={{ marginTop: 0 }}>Bestandsdatei aus dem Lesezeichen „Bestand exportieren“. Übernimmt nur Produkte und Referenzen, die im ERP noch fehlen.</p>
        <button class="btn" disabled={z.nurLesen} onClick={shopWaehlen}><Icon n="shop" />Bestandsdatei wählen…</button>
      </Karte>
    </div>

    {plan && <Karte titel={`Vorschau: ${datei?.name}`} klasse="" rechts={<>
      <label class="check klein"><input type="checkbox" checked={nurProbleme} onChange={(e) => setNurProbleme((e.target as HTMLInputElement).checked)} /> unveränderte ausblenden</label>
      <button class="btn" onClick={() => { setPlan(null); setDatei(null); }}>Verwerfen</button>
      <button class="btn primaer" disabled={!(zaehl("neu") + zaehl("aendern")) || z.nurLesen} onClick={uebernehmen}>{zaehl("neu") + zaehl("aendern")} Zeilen übernehmen</button>
    </>} ohnePadding>
      <div class="karte-inhalt" style={{ borderBottom: "1px solid var(--line)" }}>
        {plan.fehlt.map((f) => <div class="hinweisbox bad">{f}</div>)}
        <div class="knopfreihe">
          <span class="marke info">{zaehl("neu")} neu</span><span class="marke dunkel">{zaehl("aendern")} geändert</span>
          <span class="marke">{zaehl("gleich")} unverändert</span><span class="marke bad">{zaehl("fehler")} mit Fehlern (werden übersprungen)</span>
          {plan.unbekannteSpalten.length > 0 && <span class="muted klein">Ignorierte Spalten: {plan.unbekannteSpalten.join(", ")}</span>}
        </div>
      </div>
      <div class="tabelle-wrap" style={{ maxHeight: "60vh" }}>
        <table class="t">
          <thead><tr><th>Zeile</th><th>Artikelnummer</th><th>Ergebnis</th><th>Details</th></tr></thead>
          <tbody>{zeilen.slice(0, 500).map((x) => <tr>
            <td class="num faint">{x.nr}</td>
            <td class="mono nowrap">{x.produkt_id ? <a href={`#/produkte/${x.produkt_id}`}>{x.sku || "–"}</a> : x.sku || "–"}</td>
            <td><span class={`marke ${AKTION[x.aktion][1]}`}>{AKTION[x.aktion][0]}</span></td>
            <td>
              {x.hinweis && <div class="muted klein">{x.hinweis}</div>}
              {x.fehler.map((f) => <div style={{ color: "var(--bad)" }}>{f}</div>)}
              {x.aenderungen.map((c) => <div class="klein"><b style={{ fontWeight: 500 }}>{c.label}{c.ziel === "stein" ? " (Stein)" : ""}:</b> <span class="diff-alt">{wertText(c.alt, d, c.spalte)}</span> → <span class="diff-neu">{wertText(c.neu, d, c.spalte)}</span>{c.ziel === "preis" ? ` ab ${x.gueltig_ab}` : ""}</div>)}
            </td>
          </tr>)}
          {zeilen.length > 500 && <tr><td colSpan={4} class="muted">… {zeilen.length - 500} weitere Zeilen</td></tr>}</tbody>
        </table>
      </div>
    </Karte>}

    {shop && <Karte titel={`Shop-Stand ${shop.v.stand ? datumZeit(shop.v.stand) : ""}`} rechts={<><button class="btn" onClick={() => setShop(null)}>Verwerfen</button><button class="btn primaer" disabled={!shop.v.neu.length && !shop.v.neueReferenzen} onClick={shopUebernehmen}>{shop.v.neu.length} Produkte und {shop.v.neueReferenzen} Referenzen übernehmen</button></>}>
      <div class="raster r2">
        <div><h3>Neu im Shop ({shop.v.neu.length})</h3><ul class="klein">{shop.v.neu.slice(0, 30).map((p) => <li><span class="mono">{p.sku ?? "–"}</span> {p.name}</li>)}</ul>{!shop.v.neu.length && <p class="muted">Keine neuen Produkte.</p>}</div>
        <div><h3>Im ERP, aber nicht mehr im Shop ({shop.v.fehltImShop.length})</h3><p class="muted klein">Nur zur Info – das ERP ändert daran nichts. Prüfen, ob archiviert werden soll.</p><ul class="klein">{shop.v.fehltImShop.slice(0, 30).map((p) => <li><a href={`#/produkte/${p.id}`} class="mono">{p.sku ?? p.name}</a></li>)}</ul></div>
      </div>
    </Karte>}

    <Karte titel="WooCommerce-Paket" rechts={<span class="marke">{exp.offen.length} offen</span>}>
      <div class="raster r-2-1">
        <div>
          <p style={{ marginTop: 0 }}>Enthält alle <b>freigegebenen</b> Produkte, die seit dem letzten Abgleich geändert oder neu angelegt wurden, und archivierte Shop-Produkte zum Ausblenden. Preise werden nicht übertragen (Shop im Katalogmodus).</p>
          {exp.offen.length > 0 && <table class="t" style={{ marginBottom: 12 }}>
            <thead><tr><th>Artikelnummer</th><th>Art</th><th>Aktion</th></tr></thead>
            <tbody>{exp.offen.slice(0, 15).map(({ p, grund }) => <tr class="klickbar" onClick={() => geheZu(`produkte/${p.id}`)}><td class="mono">{p.sku}</td><td>{ART[p.art]}</td><td><span class={`marke ${grund === "neu" ? "info" : grund === "ausblenden" ? "warn" : ""}`}>{grund === "neu" ? "anlegen (Entwurf)" : grund === "ausblenden" ? "ausblenden" : "aktualisieren"}</span></td></tr>)}</tbody>
          </table>}
          {exp.offen.length > 15 && <p class="muted klein">… und {exp.offen.length - 15} weitere</p>}
          {exp.zurueckgehalten.length > 0 && <p class="muted klein">{exp.zurueckgehalten.length} geänderte Produkte sind noch nicht freigegeben und werden zurückgehalten.</p>}
          <div class="knopfreihe">
            <button class="btn dunkel" disabled={!exp.offen.length} onClick={paket}><Icon n="download" />Paket herunterladen</button>
            {paketIds && <button class="btn primaer" onClick={markieren}><Icon n="check" />Im Shop eingespielt – als abgeglichen markieren</button>}
          </div>
        </div>
        <div class="hinweisbox" style={{ display: "block", alignSelf: "start" }}>
          <b>Warum kein „Veröffentlichen“-Knopf?</b>
          <p class="klein" style={{ margin: "4px 0 0" }}>Zum direkten Schreiben in WooCommerce braucht das ERP einen API-Schlüssel. Der darf nicht in einer öffentlich erreichbaren Seite wie GitHub Pages liegen. Das Paket wird deshalb bis zur Server-Version per Import im Shop eingespielt (z. B. durch Christian). Die Server-Version ist vorbereitet.</p>
        </div>
      </div>
    </Karte>
  </>;
}


