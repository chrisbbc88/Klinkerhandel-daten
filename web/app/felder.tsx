// Formularfelder für Stein und Produkt (gemeinsam für Erfassen und Bearbeiten).
import { z, melde } from "./store.ts";
import { Feld, Text, Zahl, Auswahl, Chips } from "./ui.tsx";
import { steinFormate, formatSortierung, formatSetzen, formatWerte, formatText, formatTextSetzen, textAehnlichkeit, AEHNLICH_AB, FORMAT_CHARAKTER, MASS_QUELLE, type FormatWerte } from "../lib/formate.ts";
import { useState, useEffect } from "preact/hooks";
import { kiFormatTexte, KiFehler, type FormatTextEingabe } from "../lib/ki.ts";
import { kiSchluessel } from "./ki.tsx";
import { HERSTELLUNG, STATUS, OBERFLAECHEN, herstellerSichtbar, type Stein, type Produkt, type HerstellerImShop, type SteinFormat } from "../lib/modell.ts";

export function SteinStamm({ s, set }: { s: Stein; set: (p: Partial<Stein>) => void }) {
  const d = z.daten;
  return <div class="formular">
    <Feld label="Hersteller"><Auswahl wert={s.hersteller_id ? String(s.hersteller_id) : ""} setze={(v) => set({ hersteller_id: v ? Number(v) : null, hersteller_quelle: "manuell" })} optionen={d.hersteller.map((h) => [String(h.id), h.name] as [string, string])} leer="– wählen –" /></Feld>
    <Feld label="Herstellungsart *"><Auswahl wert={s.herstellungsart ?? ""} setze={(v) => set({ herstellungsart: (v || null) as Stein["herstellungsart"] })} optionen={HERSTELLUNG} leer="– wählen –" /></Feld>
    <Feld label="Bezeichnung beim Hersteller"><Text wert={s.bezeichnung_hersteller} setze={(v) => set({ bezeichnung_hersteller: v })} placeholder="z. B. Kolumba Hellgrau" /></Feld>
    <Feld label="Artikelnr. beim Hersteller" hinweis="je Format abweichend: unten beim Format"><Text wert={s.artikelnr_hersteller} setze={(v) => set({ artikelnr_hersteller: v })} /></Feld>
    <Feld label="Farben *" klasse="breit"><Chips farbe alle={d.farben.map((f) => f.schluessel)} gewaehlt={s.farben} setze={(v) => set({ farben: v })} /></Feld>
    <Feld label="Oberfläche" klasse="breit"><Chips alle={OBERFLAECHEN} gewaehlt={s.oberflaechen} setze={(v) => set({ oberflaechen: v })} /></Feld>
  </div>;
}

/** Texte am Stein (gelten für alle Formate). */
export function SteinTexte({ s, set }: { s: Stein; set: (p: Partial<Stein>) => void }) {
  return <div class="formular">
    <Feld label="Text des Herstellers" klasse="breit"><textarea value={s.herstellertext} onInput={(e) => set({ herstellertext: (e.target as HTMLTextAreaElement).value })} /></Feld>
    <Feld label="Interne Notiz" klasse="breit" hinweis="wird nicht exportiert"><textarea value={s.notiz} onInput={(e) => set({ notiz: (e.target as HTMLTextAreaElement).value })} /></Feld>
  </div>;
}

const zahlText = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

/**
 * Formate des Steins mit Maßen und Technik je Format. Leere Maßfelder zeigen das Normmaß als Platzhalter;
 * eingetragen wird nur, was abweicht oder im Datenblatt steht. produkte = Produkte des Steins (mit Entwurf).
 */
export function FormatDaten({ s, set, produkte }: { s: Stein; set: (p: Partial<Stein>) => void; produkte: Produkt[] }) {
  const d = z.daten;
  const zeilen = steinFormate(d, s, produkte.filter((p) => p.status !== "archiviert"));
  const setzen = (format: string, patch: Partial<SteinFormat>) => set({ format_daten: formatSetzen(s, format, { quelle: "manuell", ...patch }) });
  function technikAufAlle(von: FormatWerte) {
    let fd = s.format_daten;
    for (const w of zeilen) if (w.format !== von.format)
      fd = formatSetzen({ format_daten: fd }, w.format, { druckfestigkeit_nmm2: von.druckfestigkeit_nmm2, wasseraufnahme_proz: von.wasseraufnahme_proz, frostwiderstand: von.frostwiderstand, quelle: "manuell" });
    set({ format_daten: fd });
  }
  if (!zeilen.length) return <p class="muted" style={{ margin: 0 }}>Noch kein Format gewählt. Formate werden am Produkt gewählt; Normmaße und Bedarf je m² stehen dann sofort hier.</p>;
  const fugen = d.einstellungen.fugen;
  return <div class="formatliste">
    {zeilen.map((w) => {
      const g = w.gespeichert;
      const imSortiment = w.verblender || w.riemchen || w.andere;
      const norm = d.formate.find((f) => f.kuerzel === w.format)?.mm ?? null;
      return <section class="formatblock" aria-label={`Format ${w.format}`}>
        <header>
          <b class="mono">{w.format}</b> <span class="muted">{w.name}</span>
          {w.verblender && <span class="marke">Verblender</span>}{w.riemchen && <span class="marke">Riemchen</span>}
          {!imSortiment && <span class="marke warn">in keinem Produkt</span>}
          {g?.quelle === "alt" && <span class="marke warn" title="Stammt aus einer Version mit nur einem Wertesatz je Stein">aus alten Steindaten – prüfen</span>}
          <span class="formatmass">{w.laenge_mm && w.hoehe_mm ? `${w.laenge_mm} × ${w.breite_mm ?? "?"} × ${w.hoehe_mm} mm` : "Maße fehlen"}
            {w.masse_quelle && <span class={`marke ${w.masse_quelle === "eingetragen" ? "ok" : "info"}`}>{MASS_QUELLE[w.masse_quelle]}</span>}</span>
        </header>
        <div class="formular vier">
          <Feld label="Länge mm"><Zahl wert={g?.laenge_mm ?? null} placeholder={norm ? String(norm[0]) : ""} setze={(v) => setzen(w.format, { laenge_mm: v })} /></Feld>
          <Feld label="Breite mm"><Zahl wert={g?.breite_mm ?? null} placeholder={norm ? String(norm[1]) : ""} setze={(v) => setzen(w.format, { breite_mm: v })} /></Feld>
          <Feld label="Höhe mm"><Zahl wert={g?.hoehe_mm ?? null} placeholder={norm ? String(norm[2]) : ""} setze={(v) => setzen(w.format, { hoehe_mm: v })} /></Feld>
          <Feld label="Bedarf Stk/m²" hinweis={g?.bedarf_stk_m2 ? "eingetragen" : w.bedarf_stk_m2 ? `berechnet, Fugen ${fugen.stoss_mm}/${fugen.lager_mm} mm` : undefined}>
            <Zahl wert={g?.bedarf_stk_m2 ?? null} placeholder={zahlText(w.bedarf_quelle === "berechnet" ? w.bedarf_stk_m2 : null)} setze={(v) => setzen(w.format, { bedarf_stk_m2: v })} /></Feld>
          <Feld label="Druckfestigkeit N/mm²"><Zahl wert={w.druckfestigkeit_nmm2} setze={(v) => setzen(w.format, { druckfestigkeit_nmm2: v })} /></Feld>
          <Feld label="Wasseraufnahme %"><Zahl wert={w.wasseraufnahme_proz} setze={(v) => setzen(w.format, { wasseraufnahme_proz: v })} /></Feld>
          <Feld label="Frostwiderstand"><Auswahl wert={w.frostwiderstand ?? ""} setze={(v) => setzen(w.format, { frostwiderstand: (v || null) as SteinFormat["frostwiderstand"] })} optionen={[["F0", "F0"], ["F1", "F1"], ["F2", "F2"]]} leer="–" /></Feld>
          <Feld label="Gewicht kg/Stk"><Zahl wert={w.gewicht_kg} setze={(v) => setzen(w.format, { gewicht_kg: v })} /></Feld>
          <Feld label="Artikelnr. Hersteller" klasse="zwei-spalten"><Text wert={w.artikelnr_hersteller} setze={(v) => setzen(w.format, { artikelnr_hersteller: v })} /></Feld>
        </div>
        <div class="knopfreihe">
          {zeilen.length > 1 && (w.druckfestigkeit_nmm2 || w.wasseraufnahme_proz != null || w.frostwiderstand) &&
            <button type="button" class="btn klein umbruch" title="Druckfestigkeit, Wasseraufnahme und Frost dieses Formats bei allen anderen Formaten eintragen" onClick={() => technikAufAlle(w)}>Prüfwerte auf alle Formate übertragen</button>}
          {g?.quelle === "alt" && <button type="button" class="btn klein" onClick={() => setzen(w.format, { quelle: "manuell" })}>Werte geprüft</button>}
          {!imSortiment && g && <button type="button" class="btn klein gefahr" onClick={() => set({ format_daten: s.format_daten.filter((x) => x.format !== w.format) })}>Werte dieses Formats entfernen</button>}
        </div>
      </section>;
    })}
    <p class="muted klein" style={{ margin: 0 }}>Leere Maßfelder: es gilt das grau angezeigte Normmaß. Nur eintragen, was laut Datenblatt abweicht. Formate wählen Sie oben am Produkt.</p>
  </div>;
}

export function ProduktStamm({ p, set }: { p: Produkt; set: (x: Partial<Produkt>) => void }) {
  const d = z.daten;
  return <div class="formular">
    <Feld label="Name im Shop" klasse="breit"><Text wert={p.name} setze={(v) => set({ name: v })} /></Feld>
    <Feld label="Status"><Auswahl wert={p.status} setze={(v) => set({ status: v })} optionen={STATUS} /></Feld>
    <HerstellerImShopFeld wert={p.hersteller_im_shop} herstellerId={p.hersteller_id} setze={(v) => set({ hersteller_im_shop: v })} />
    <Feld label="Artikelnummer" hinweis="wird aus dem HBR-Code gebildet"><input type="text" value={p.sku ?? ""} disabled /></Feld>
    {p.art === "riemchen" && <>
      <Feld label="Riemchenstärke mm"><Zahl wert={p.riemchen_staerke_mm} setze={(v) => set({ riemchen_staerke_mm: v })} /></Feld>
      <Feld label="Eckriemchen"><Auswahl wert={p.eckriemchen == null ? "" : p.eckriemchen ? "ja" : "nein"} setze={(v: string) => set({ eckriemchen: v === "" ? null : v === "ja" })} optionen={[["ja", "lieferbar"], ["nein", "nicht lieferbar"]]} leer="unbekannt" /></Feld>
    </>}
    {p.art !== "nistklinker" && <Feld label="Formate *" klasse="breit"><Chips alle={d.formate.map((f) => f.kuerzel)} gewaehlt={p.formate} setze={(v) => set({ formate: v })} /></Feld>}
    <Feld label="Kurztext" klasse="breit" hinweis={p.kurztext_shop_alt ? `Bisher im Shop: ${p.kurztext_shop_alt}` : undefined}><textarea value={p.kurztext} rows={2} onInput={(e) => set({ kurztext: (e.target as HTMLTextAreaElement).value })} /></Feld>
    <Feld label="Produktbeschreibung" klasse="breit"><textarea value={p.beschreibung} rows={6} onInput={(e) => set({ beschreibung: (e.target as HTMLTextAreaElement).value })} placeholder="Optik, Wirkung, Einsatz, Besonderheiten…" /></Feld>
  </div>;
}

/** Vorschlag für einen Beschreibungstext aus den Stammdaten (zum Weiterbearbeiten, keine KI). */
export function textVorschlag(p: Produkt, s: Stein | undefined, hersteller: string): string {
  if (!s) return "";
  if (!herstellerSichtbar(p, z.daten.hersteller.find((h) => h.id === s.hersteller_id))) hersteller = ""; // Hersteller im Shop ausgeblendet → nicht im Text nennen
  const art = p.art === "riemchen" ? "Klinkerriemchen" : "Klinker";
  const h = s.herstellungsart ? { handform: "handgeformte", strangpress: "stranggepresste", wasserstrich: "wasserstrichgeformte" }[s.herstellungsart] : "";
  const farben = s.farben.length ? s.farben.join(", ").replace(/, ([^,]*)$/, " und $1") : "";
  const teile = [
    `Der ${s.hbr_code}${p.art === "riemchen" ? " R" : ""} ist ein${h ? " " + h + "r" : ""} ${art}${hersteller ? ` von ${hersteller}` : ""}${farben ? ` in ${farben}` : ""}.`,
    s.oberflaechen.length ? `Die Oberfläche ist ${s.oberflaechen.join(" und ")}.` : "",
    formatSatz(p, s),
    frostSatz(p, s),
    bedarfSatz(p, s),
  ];
  return teile.filter(Boolean).join(" ");
}

const liste = (t: string[]) => t.join(", ").replace(/, ([^,]*)$/, " und $1");
function formatSatz(p: Produkt, s: Stein): string {
  if (!p.formate.length) return "";
  const teile = p.formate.map((f) => { const w = formatWerte(z.daten, s, f); const m = w.laenge_mm && w.hoehe_mm ? ` (${w.laenge_mm} × ${p.art === "riemchen" && p.riemchen_staerke_mm ? p.riemchen_staerke_mm : w.breite_mm ?? "?"} × ${w.hoehe_mm} mm)` : ""; return f + m; });
  return `Lieferbar im Format ${liste(teile)}.`.replace("im Format", p.formate.length > 1 ? "in den Formaten" : "im Format");
}
function frostSatz(p: Produkt, s: Stein): string {
  const w = p.formate.map((f) => formatWerte(z.daten, s, f).frostwiderstand);
  return w.length && w.every((x) => x === "F2") ? "Frostbeständig nach Kategorie F2 und damit für Fassaden in allen Lagen geeignet." : "";
}
function bedarfSatz(p: Produkt, s: Stein): string {
  const w = p.formate.map((f) => [f, formatWerte(z.daten, s, f).bedarf_stk_m2] as const).filter(([, b]) => b);
  if (!w.length) return "";
  return w.length === 1 ? `Bedarf: ca. ${w[0][1]} Stück je m².` : `Bedarf je m²: ${liste(w.map(([f, b]) => `${f} ca. ${b} Stück`))}.`;
}

/** Auswahl, ob der Hersteller im Shop erscheint. Standard folgt der Einstellung beim Hersteller (Einstellungen › Stammdaten). */
export function HerstellerImShopFeld({ wert, herstellerId, setze }: { wert: HerstellerImShop; herstellerId: number | null; setze: (v: HerstellerImShop) => void }) {
  const h = z.daten.hersteller.find((x) => x.id === herstellerId);
  const standard = h ? (h.im_shop_anzeigen ? "anzeigen" : "ausblenden") : "kein Hersteller";
  const effektiv = herstellerSichtbar({ hersteller_im_shop: wert, hersteller_id: herstellerId }, h);
  return <Feld label="Hersteller im Shop" hinweis={h ? (effektiv ? `${h.name} wird im Shop angezeigt` : "Hersteller bleibt intern, Kunden sehen ihn nicht") : undefined}>
    <Auswahl wert={wert} setze={setze} optionen={[["standard", `Standard (${standard})`], ["anzeigen", "anzeigen"], ["ausblenden", "ausblenden"]]} />
  </Feld>;
}

// ---------- Texte je Format ----------

const zahlDe = (n: number) => String(n).replace(".", ",");

/** Kurztext-Vorschlag für ein Format. */
export function kurztextVorschlag(p: Produkt, s: Stein | undefined, f: string): string {
  if (!s) return "";
  const w = formatWerte(z.daten, s, f);
  const m = masseTextFuer(p, w);
  const h = s.herstellungsart ? HERSTELLUNG[s.herstellungsart] : "";
  return [`${p.sku ?? s.hbr_code} im ${w.name} (${f})`, m, h, s.farben.join("/")].filter(Boolean).join(" · ");
}
function masseTextFuer(p: Produkt, w: FormatWerte) {
  if (!w.laenge_mm || !w.hoehe_mm) return "";
  return `${w.laenge_mm} × ${p.art === "riemchen" && p.riemchen_staerke_mm ? p.riemchen_staerke_mm : w.breite_mm ?? "?"} × ${w.hoehe_mm} mm`;
}

/** Beschreibungs-Vorschlag für ein Format: eigener Aufbau mit den Werten dieses Formats (keine KI). */
export function formatTextVorschlag(p: Produkt, s: Stein | undefined, f: string, hersteller: string): string {
  if (!s) return "";
  if (!herstellerSichtbar(p, z.daten.hersteller.find((h) => h.id === s.hersteller_id))) hersteller = "";
  const w = formatWerte(z.daten, s, f);
  const art = p.art === "riemchen" ? "Klinkerriemchen" : "Verblendklinker";
  const h = s.herstellungsart ? { handform: "handgeformte", strangpress: "stranggepresste", wasserstrich: "wasserstrichgeformte" }[s.herstellungsart] : "";
  const farben = s.farben.length ? s.farben.join(", ").replace(/, ([^,]*)$/, " und $1") : "";
  const m = masseTextFuer(p, w);
  const technik = [w.druckfestigkeit_nmm2 ? `eine Druckfestigkeit von ${zahlDe(w.druckfestigkeit_nmm2)} N/mm²` : "", w.wasseraufnahme_proz != null ? `eine Wasseraufnahme von ${zahlDe(w.wasseraufnahme_proz)} %` : "",
    w.frostwiderstand ? `Frostwiderstand ${w.frostwiderstand}` : ""].filter(Boolean);
  return [
    `Im ${w.name} (${f})${m ? ` mit ${m}` : ""} ist der ${p.sku ?? s.hbr_code} ein${h ? " " + h + "r" : ""} ${art}${hersteller ? ` von ${hersteller}` : ""}${farben ? ` in ${farben}` : ""}.`,
    FORMAT_CHARAKTER[f] ?? "",
    w.bedarf_stk_m2 ? `Für einen Quadratmeter Fassade rechnen Sie in diesem Format mit rund ${w.bedarf_stk_m2} Steinen.` : "",
    technik.length ? `Laut Herstellerangaben hat das Format ${f} ${technik.join(", ").replace(/, ([^,]*)$/, " und $1")}.` : "",
  ].filter(Boolean).join(" ");
}

/** Kurztext und Beschreibung je Format, mit Ähnlichkeitsprüfung und optionalem KI-Entwurf. */
export function FormatTexte({ p, s, set, hersteller }: { p: Produkt; s: Stein | undefined; set: (x: Partial<Produkt>) => void; hersteller: string }) {
  const reihe = [...p.formate].sort(formatSortierung(z.daten));
  const [aktiv, setAktiv] = useState(reihe[0] ?? "");
  const [laeuft, setLaeuft] = useState(false);
  const f = p.formate.includes(aktiv) ? aktiv : reihe[0];
  if (!f) return null;
  const t = formatText(p, f);
  const setzen = (x: Partial<{ kurztext: string; beschreibung: string }>) => set({ format_texte: formatTextSetzen(p, f, x) });
  // Ähnlichkeit zu den anderen Texten
  const vergleich = [["allgemeiner Text", p.beschreibung] as [string, string], ...reihe.filter((x) => x !== f).map((x) => [x, formatText(p, x).beschreibung] as [string, string])]
    .filter(([, b]) => b.trim().length > 40 && t.beschreibung.trim().length > 40).map(([n, b]) => ({ n, w: textAehnlichkeit(t.beschreibung, b) })).sort((a, b) => b.w - a.w);
  async function mitKi() {
    const schluessel = await kiSchluessel();
    if (!schluessel || !s) return;
    const eingabe: FormatTextEingabe = {
      produkt: { hbr: p.sku ?? s.hbr_code, art: p.art === "riemchen" ? "Riemchen" : "Verblender", herstellungsart: s.herstellungsart ? HERSTELLUNG[s.herstellungsart] : "", farben: s.farben, oberflaechen: s.oberflaechen,
        hersteller: herstellerSichtbar(p, z.daten.hersteller.find((h) => h.id === s.hersteller_id)) ? hersteller : "", allgemeiner_text: p.beschreibung },
      formate: reihe.map((x) => { const w = formatWerte(z.daten, s, x); return { format: x, name: w.name, masse: masseTextFuer(p, w), bedarf_stk_m2: w.bedarf_stk_m2, druckfestigkeit_nmm2: w.druckfestigkeit_nmm2, wasseraufnahme_proz: w.wasseraufnahme_proz, frostwiderstand: w.frostwiderstand, gewicht_kg: p.art === "riemchen" ? null : w.gewicht_kg }; }),
    };
    setLaeuft(true);
    try {
      const r = await kiFormatTexte(schluessel, z.daten.einstellungen.ki.modell, eingabe);
      let liste = p.format_texte ?? [];
      for (const x of r.texte) liste = formatTextSetzen({ format_texte: liste }, x.format, { kurztext: x.kurztext, beschreibung: x.beschreibung });
      set({ format_texte: liste });
      melde(`${r.texte.length} Textentwürfe eingesetzt – bitte lesen und dann speichern.`, "info");
    } catch (e) { melde(e instanceof KiFehler ? e.message : `KI-Entwurf fehlgeschlagen: ${(e as Error).message}`, "fehler"); }
    setLaeuft(false);
  }
  const [hatKi, setHatKi] = useState(false);
  useEffect(() => { kiSchluessel().then((k) => setHatKi(!!k)); }, []);
  return <div class="formattexte">
    <div class="chips" role="tablist" aria-label="Format für Texte">{reihe.map((x) => { const tx = formatText(p, x); return <button type="button" role="tab" aria-selected={x === f}
      class={`chip ${x === f ? "an" : ""}`} onClick={() => setAktiv(x)}>{x}{tx.beschreibung.trim() ? " ✓" : ""}</button>; })}</div>
    <div class="formular">
      <Feld label={`Kurztext ${f}`} klasse="breit"><textarea rows={2} value={t.kurztext} onInput={(e) => setzen({ kurztext: (e.target as HTMLTextAreaElement).value })} placeholder={p.kurztext || "leer = allgemeiner Kurztext"} /></Feld>
      <Feld label={`Beschreibung ${f}`} klasse="breit" hinweis={vergleich[0] ? <span class={vergleich[0].w >= AEHNLICH_AB ? "warn-text" : ""}>Ähnlichkeit zu {vergleich[0].n}: {Math.round(vergleich[0].w * 100)} %{vergleich[0].w >= AEHNLICH_AB ? " – bitte stärker unterscheiden" : ""}</span> : undefined}>
        <textarea rows={6} value={t.beschreibung} onInput={(e) => setzen({ beschreibung: (e.target as HTMLTextAreaElement).value })} placeholder="leer = allgemeine Produktbeschreibung" /></Feld>
    </div>
    <div class="knopfreihe">
      <button type="button" class="btn klein" disabled={!s} onClick={() => setzen({ kurztext: t.kurztext || kurztextVorschlag(p, s, f), beschreibung: formatTextVorschlag(p, s, f, hersteller) })}>Vorschlag für {f} aus Stammdaten</button>
      {hatKi && <button type="button" class="btn klein" disabled={laeuft || !s || z.nurLesen} onClick={mitKi}>{laeuft ? "KI schreibt…" : `Mit KI für alle ${p.formate.length} Formate entwerfen`}</button>}
      <span class="muted klein">Jedes Format bekommt einen eigenen Text, damit im Shop keine doppelten Inhalte entstehen.</span>
    </div>
  </div>;
}
