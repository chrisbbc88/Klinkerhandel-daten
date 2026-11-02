// Produkt erfassen: neuer Stein mit nächster freier HBR-Nummer oder neues Produkt zu vorhandenem Stein.
import { useState } from "preact/hooks";
import { z, aendern, melde } from "./store.ts";
import { ab, herstellerName } from "./abgeleitet.ts";
import { Seitenkopf, Karte, Feld, Auswahl, Zahl, Icon, queryParam, geheZu, Chips } from "./ui.tsx";
import { SteinStamm, SteinTechnik, textVorschlag, HerstellerImShopFeld } from "./felder.tsx";
import { HBR, ART, naechsterCode, steinLeer, skuFuer, produktName, heute, type Produkt, type ProduktArt, type Stein } from "../lib/modell.ts";
import { pruefeStein, pruefeProdukt } from "../lib/pruefung.ts";
import { lege_an, neueId, aendere } from "../lib/aendern.ts";
import { KiDatenblatt, type GeladeneDatei } from "./ki.tsx";
import type { KiVorschlag } from "../lib/ki.ts";

export function Erfassen() {
  const d = z.daten, a = ab();
  const vorhandenId = Number(queryParam("stein")) || null;
  const vorhanden = vorhandenId ? a.steine.get(vorhandenId) : undefined;
  const praefixe = [...new Set(d.steine.map((s) => s.hbr_code.slice(4, 6)))].sort();
  const praefixName = (pr: string) => { const h = d.hersteller.find((x) => x.hbr_praefix === pr); return h ? `${pr} – ${h.name}` : `${pr} – ohne Hersteller`; };

  const [praefix, setPraefix] = useState(praefixe[0] ?? "10");
  const [code, setCode] = useState(() => vorhanden?.hbr_code ?? naechsterCode(d, praefixe[0] ?? "10"));
  const [art, setArt] = useState<ProduktArt>((queryParam("art") as ProduktArt) ?? "verblender");
  const [auchRiemchen, setAuchRiemchen] = useState(false);
  const [stein, setStein] = useState<Stein>(() => vorhanden ? structuredClone(vorhanden) : { ...steinLeer(0, code, "", ""), hersteller_id: d.hersteller.find((h) => h.hbr_praefix === praefix)?.id ?? null, hersteller_quelle: "praefix" });
  const [formate, setFormate] = useState<string[]>([]);
  const [staerke, setStaerke] = useState<number | null>(null);
  const [beschreibung, setBeschreibung] = useState("");
  const [vk, setVk] = useState<number | null>(null);
  const [ek, setEk] = useState<number | null>(null);
  const [status, setStatus] = useState<"entwurf" | "pruefung">("entwurf");
  const [himshop, setHimshop] = useState<Produkt["hersteller_im_shop"]>("standard");
  const [datenblatt, setDatenblatt] = useState<{ name: string; sha: string; felder: string[] } | null>(null);

  function aktuellerWert(feld: string): unknown {
    if (feld === "formate") return formate;
    if (feld === "riemchen_staerke_mm") return staerke;
    if (feld === "beschreibung") return beschreibung;
    if (feld === "art") return art;
    return (stein as any)[feld] ?? null;
  }
  function ausDatenblatt(gewaehlt: KiVorschlag[], datei: GeladeneDatei) {
    let st: Stein = { ...stein };
    const uebernommen: string[] = [];
    for (const v of gewaehlt) {
      if (v.ziel === "stein") { if (vorhanden) continue; (st as any)[v.feld] = v.wert; }
      else if (v.feld === "formate") setFormate(v.wert as string[]);
      else if (v.feld === "riemchen_staerke_mm") setStaerke(v.wert as number);
      else if (v.feld === "beschreibung") setBeschreibung(v.wert as string);
      else if (v.feld === "art" && !vorhanden) setArt(v.wert as ProduktArt);
      uebernommen.push(v.feld);
    }
    if (!vorhanden && gewaehlt.some((v) => v.feld === "hersteller_id")) {
      st.hersteller_quelle = "datenblatt";
      const h = d.hersteller.find((x) => x.id === st.hersteller_id);
      if (h?.hbr_praefix && h.hbr_praefix !== praefix) { // Nummer aus dem Präfix des Herstellers vergeben
        const c = naechsterCode(d, h.hbr_praefix);
        setPraefix(h.hbr_praefix); setCode(c); st.hbr_code = c;
      }
    }
    if (!vorhanden && !st.laenge_mm) { const mm = d.formate.find((f) => f.kuerzel === (gewaehlt.find((v) => v.feld === "formate")?.wert as string[] | undefined)?.[0])?.mm; if (mm) { st.laenge_mm = mm[0]; st.breite_mm = mm[1]; st.hoehe_mm = mm[2]; } }
    setStein(st);
    setDatenblatt({ name: datei.name, sha: datei.sha, felder: uebernommen });
    melde(`${uebernommen.length} Werte ins Formular übernommen. Bitte prüfen und dann anlegen.`);
  }

  function praefixWaehlen(pr: string) {
    setPraefix(pr);
    const c = naechsterCode(d, pr);
    setCode(c);
    const h = d.hersteller.find((x) => x.hbr_praefix === pr);
    setStein({ ...stein, hbr_code: c, hersteller_id: h?.id ?? stein.hersteller_id, hersteller_quelle: h ? "praefix" : stein.hersteller_quelle });
  }
  function formateSetzen(f: string[]) {
    setFormate(f);
    const neu = f.find((x) => !formate.includes(x));
    const mm = d.formate.find((x) => x.kuerzel === neu)?.mm;
    if (mm && !stein.laenge_mm) setStein({ ...stein, laenge_mm: mm[0], breite_mm: mm[1], hoehe_mm: mm[2] });
  }

  const codeFehler = vorhanden ? null : !HBR.test(code) ? "Format: HBR 12-345" : d.steine.some((s) => s.hbr_code === code) ? "Diese Nummer ist bereits vergeben" : null;
  const vorschauP: Produkt = {
    id: 0, version: 1, erstellt_am: "", geaendert_am: "", geaendert_von: "", stein_id: 0, art, sku: skuFuer(code, art), name: produktName(code, art, stein.herstellungsart),
    hersteller_id: stein.hersteller_id, woo_id: null, woo_slug: "", status, formate, bilder: [], riemchen_staerke_mm: art === "riemchen" ? staerke : null, eckriemchen: null,
    kurztext: "", beschreibung, kurztext_shop_alt: "", preise: [], hersteller_im_shop: himshop, zuletzt_exportiert_version: null,
  };
  const pruef = [...pruefeStein(stein), ...pruefeProdukt(vorschauP, d)].filter((x) => x.regel !== "bild" && x.regel !== "bilder3" && x.regel !== "alt");
  const doppeltArt = vorhanden && (a.geschwister.get(vorhanden.id) ?? []).some((p) => p.art === art);

  function anlegen() {
    if (codeFehler) { melde(codeFehler, "fehler"); return; }
    if (doppeltArt) { melde(`Zu ${code} gibt es bereits ein ${ART[art]}.`, "fehler"); return; }
    let neueId_: number | null = null;
    const ok = aendern((dd, von) => {
      const jetzt = new Date().toISOString();
      let sid = vorhanden?.id;
      if (!sid) {
        const s = lege_an(dd, "steine", { ...stein, id: neueId(), hbr_code: code, version: 1, erstellt_am: jetzt, geaendert_am: jetzt, geaendert_von: von,
          datenblaetter: datenblatt ? [{ dateiname: datenblatt.name, sha256: datenblatt.sha, geprueft_am: jetzt, geprueft_von: von, felder: datenblatt.felder }] : [] }, von);
        sid = s.id;
      } else if (datenblatt) {
        const s = dd.steine.find((x) => x.id === sid)!;
        aendere(dd, "steine", sid, { datenblaetter: [...s.datenblaetter.filter((x) => x.sha256 !== datenblatt.sha), { dateiname: datenblatt.name, sha256: datenblatt.sha, geprueft_am: jetzt, geprueft_von: von, felder: datenblatt.felder }] }, von);
      }
      const preise = [
        ...(vk ? [{ id: neueId(), preisart: "vk" as const, betrag: vk, einheit: "m2" as const, gueltig_ab: heute(), quelle: "manuell" as const, erfasst_von: von, erfasst_am: jetzt }] : []),
        ...(ek ? [{ id: neueId(), preisart: "ek" as const, betrag: ek, einheit: "m2" as const, gueltig_ab: heute(), quelle: "lieferant" as const, erfasst_von: von, erfasst_am: jetzt }] : []),
      ];
      const arten: ProduktArt[] = [art, ...(auchRiemchen && art === "verblender" && !vorhanden ? ["riemchen" as const] : [])];
      for (const ar of arten) {
        if (dd.produkte.some((p) => p.sku === skuFuer(code, ar))) throw new Error(`Artikelnummer ${skuFuer(code, ar)} existiert bereits`);
        const p = lege_an(dd, "produkte", {
          ...vorschauP, id: neueId(), art: ar, sku: skuFuer(code, ar), name: produktName(code, ar, stein.herstellungsart), stein_id: sid,
          riemchen_staerke_mm: ar === "riemchen" ? staerke : null, preise: ar === art ? preise : [], erstellt_am: jetzt, geaendert_am: jetzt, geaendert_von: von,
        }, von);
        if (neueId_ === null) neueId_ = p.id;
      }
    }, `${code} angelegt.`);
    if (ok && neueId_) geheZu(`produkte/${neueId_}/bilder`);
  }

  return <>
    <Seitenkopf titel={vorhanden ? `${ART[art]} zu ${vorhanden.hbr_code} anlegen` : "Produkt erfassen"} text={vorhanden ? "Die Steindaten werden übernommen und gelten für beide Produkte." : "Vergibt die nächste freie HBR-Nummer des gewählten Präfixes."}>
      <a class="btn" href="#/produkte">Abbrechen</a>
      <button class="btn primaer" disabled={!!codeFehler || !!doppeltArt || z.nurLesen} onClick={anlegen}><Icon n="check" />Anlegen</button>
    </Seitenkopf>
    <div style={{ marginBottom: 16 }}>
      <KiDatenblatt titel="Datenblatt einlesen (optional)" knopfText="Ins Formular übernehmen" aktuell={aktuellerWert} onUebernehmen={ausDatenblatt} />
      {datenblatt && <p class="muted klein" style={{ margin: "6px 0 0" }}>Datenblatt „{datenblatt.name}“ wird beim Anlegen als geprüft am Stein vermerkt.</p>}
    </div>
    <div class="raster r-2-1">
      <div class="raster">
        <Karte titel="1 · Nummer und Art">
          <div class="formular">
            {!vorhanden && <Feld label="Präfix / Hersteller"><Auswahl wert={praefix} setze={praefixWaehlen} optionen={praefixe.map((p) => [p, praefixName(p)] as [string, string])} /></Feld>}
            <Feld label="HBR-Nummer" hinweis={codeFehler ?? (vorhanden ? "vorhandener Stein" : "nächste freie Nummer, änderbar")}>
              <input type="text" class={`mono ${codeFehler ? "fehler" : ""}`} value={code} disabled={!!vorhanden} onInput={(e) => { const v = (e.target as HTMLInputElement).value.toUpperCase(); setCode(v); setStein({ ...stein, hbr_code: v }); }} />
            </Feld>
            <Feld label="Art"><Auswahl wert={art} setze={setArt} optionen={[["verblender", "Verblender"], ["riemchen", "Riemchen"], ["daemmklinker", "Dämmklinker"]]} /></Feld>
            <HerstellerImShopFeld wert={himshop} herstellerId={stein.hersteller_id} setze={setHimshop} />
            <Feld label="Status nach dem Anlegen"><Auswahl wert={status} setze={setStatus} optionen={[["entwurf", "Entwurf"], ["pruefung", "Zur Prüfung"]]} /></Feld>
            {art === "verblender" && !vorhanden && <label class="check breit"><input type="checkbox" checked={auchRiemchen} onChange={(e) => setAuchRiemchen((e.target as HTMLInputElement).checked)} /> Zusätzlich als Riemchen ({code} R) anlegen</label>}
            {doppeltArt && <div class="hinweisbox bad breit">Zu {code} gibt es bereits ein {ART[art]}.</div>}
          </div>
        </Karte>
        {!vorhanden && <Karte titel="2 · Stein"><SteinStamm s={stein} set={(x) => setStein({ ...stein, ...x })} /></Karte>}
        <Karte titel={vorhanden ? "2 · Format" : "3 · Format und Technik"}>
          <div class="formular" style={{ marginBottom: vorhanden ? 0 : 16 }}>
            <Feld label="Formate *" klasse="breit" hinweis="Beim ersten Format werden die Normmaße eingetragen, wenn noch keine Maße erfasst sind."><Chips alle={d.formate.map((f) => f.kuerzel)} gewaehlt={formate} setze={formateSetzen} /></Feld>
            {(art === "riemchen" || auchRiemchen) && <Feld label="Riemchenstärke mm"><Zahl wert={staerke} setze={setStaerke} /></Feld>}
          </div>
          {!vorhanden && <SteinTechnik s={stein} set={(x) => setStein({ ...stein, ...x })} />}
        </Karte>
        <Karte titel={`${vorhanden ? 3 : 4} · Text und Preis`}>
          <div class="formular">
            <Feld label="Produktbeschreibung" klasse="breit"><textarea rows={5} value={beschreibung} onInput={(e) => setBeschreibung((e.target as HTMLTextAreaElement).value)} /></Feld>
            <div class="breit"><button class="btn klein" onClick={() => setBeschreibung(textVorschlag(vorschauP, stein, herstellerName(stein.hersteller_id)))}>Aus Stammdaten vorschlagen</button></div>
            <Feld label="VK netto €/m²"><Zahl wert={vk} setze={setVk} /></Feld>
            <Feld label="EK netto €/m²" hinweis="nur intern"><Zahl wert={ek} setze={setEk} /></Feld>
          </div>
        </Karte>
      </div>
      <div class="raster" style={{ alignContent: "start", position: "sticky", top: 72 }}>
        <Karte titel="Vorschau">
          <div class="mono" style={{ fontSize: 18, color: "var(--ink)" }}>{skuFuer(code, art)}</div>
          <div style={{ margin: "4px 0 10px" }}>{produktName(code, art, stein.herstellungsart)}</div>
          <dl class="dl">
            <dt>Hersteller</dt><dd>{herstellerName(stein.hersteller_id) || "–"}</dd>
            <dt>Farben</dt><dd>{stein.farben.join(", ") || "–"}</dd>
            <dt>Format</dt><dd>{formate.join(", ") || "–"}{stein.laenge_mm ? ` · ${stein.laenge_mm}×${stein.breite_mm}×${stein.hoehe_mm} mm` : ""}</dd>
          </dl>
        </Karte>
        <Karte titel="Noch offen">
          {pruef.length ? <ul class="pruefliste">{pruef.map((x) => <li><span class={`marke ${x.schwere === "pflicht" ? "bad" : "warn"}`}>{x.schwere === "pflicht" ? "Pflicht" : "Empf."}</span>{x.text}</li>)}</ul> : <p class="muted" style={{ margin: 0 }}>Alles Nötige ausgefüllt.</p>}
          <p class="muted klein" style={{ marginBottom: 0 }}>Bilder ergänzen Sie nach dem Anlegen. Freigeben lässt sich das Produkt erst ohne Pflichtlücken.</p>
        </Karte>
      </div>
    </div>
  </>;
}
