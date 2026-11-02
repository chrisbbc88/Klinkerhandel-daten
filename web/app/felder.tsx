// Formularfelder für Stein und Produkt (gemeinsam für Erfassen und Bearbeiten).
import { z } from "./store.ts";
import { Feld, Text, Zahl, Auswahl, Chips } from "./ui.tsx";
import { HERSTELLUNG, STATUS, OBERFLAECHEN, herstellerSichtbar, type Stein, type Produkt, type HerstellerImShop } from "../lib/modell.ts";

export function SteinStamm({ s, set }: { s: Stein; set: (p: Partial<Stein>) => void }) {
  const d = z.daten;
  return <div class="formular">
    <Feld label="Hersteller"><Auswahl wert={s.hersteller_id ? String(s.hersteller_id) : ""} setze={(v) => set({ hersteller_id: v ? Number(v) : null, hersteller_quelle: "manuell" })} optionen={d.hersteller.map((h) => [String(h.id), h.name] as [string, string])} leer="– wählen –" /></Feld>
    <Feld label="Herstellungsart *"><Auswahl wert={s.herstellungsart ?? ""} setze={(v) => set({ herstellungsart: (v || null) as Stein["herstellungsart"] })} optionen={HERSTELLUNG} leer="– wählen –" /></Feld>
    <Feld label="Bezeichnung beim Hersteller"><Text wert={s.bezeichnung_hersteller} setze={(v) => set({ bezeichnung_hersteller: v })} placeholder="z. B. Kolumba Hellgrau" /></Feld>
    <Feld label="Artikelnr. beim Hersteller"><Text wert={s.artikelnr_hersteller} setze={(v) => set({ artikelnr_hersteller: v })} /></Feld>
    <Feld label="Farben *" klasse="breit"><Chips farbe alle={d.farben.map((f) => f.schluessel)} gewaehlt={s.farben} setze={(v) => set({ farben: v })} /></Feld>
    <Feld label="Oberfläche" klasse="breit"><Chips alle={OBERFLAECHEN} gewaehlt={s.oberflaechen} setze={(v) => set({ oberflaechen: v })} /></Feld>
  </div>;
}

export function SteinTechnik({ s, set }: { s: Stein; set: (p: Partial<Stein>) => void }) {
  return <div class="formular">
    <Feld label="Länge mm"><Zahl wert={s.laenge_mm} setze={(v) => set({ laenge_mm: v })} /></Feld>
    <Feld label="Breite mm"><Zahl wert={s.breite_mm} setze={(v) => set({ breite_mm: v })} /></Feld>
    <Feld label="Höhe mm"><Zahl wert={s.hoehe_mm} setze={(v) => set({ hoehe_mm: v })} /></Feld>
    <Feld label="Gewicht kg/Stk"><Zahl wert={s.gewicht_kg} setze={(v) => set({ gewicht_kg: v })} /></Feld>
    <Feld label="Druckfestigkeit N/mm²"><Zahl wert={s.druckfestigkeit_nmm2} setze={(v) => set({ druckfestigkeit_nmm2: v })} /></Feld>
    <Feld label="Wasseraufnahme %"><Zahl wert={s.wasseraufnahme_proz} setze={(v) => set({ wasseraufnahme_proz: v })} /></Feld>
    <Feld label="Frostwiderstand"><Auswahl wert={s.frostwiderstand ?? ""} setze={(v) => set({ frostwiderstand: (v || null) as Stein["frostwiderstand"] })} optionen={[["F0", "F0"], ["F1", "F1"], ["F2", "F2"]]} leer="–" /></Feld>
    <Feld label="Bedarf Stk/m²" hinweis="bei 10 mm Fuge"><Zahl wert={s.bedarf_stk_m2} setze={(v) => set({ bedarf_stk_m2: v })} /></Feld>
    <Feld label="Text des Herstellers" klasse="breit"><textarea value={s.herstellertext} onInput={(e) => set({ herstellertext: (e.target as HTMLTextAreaElement).value })} /></Feld>
    <Feld label="Interne Notiz" klasse="breit" hinweis="wird nicht exportiert"><textarea value={s.notiz} onInput={(e) => set({ notiz: (e.target as HTMLTextAreaElement).value })} /></Feld>
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
    p.formate.length ? `Lieferbar im Format ${p.formate.join(", ")}${s.laenge_mm ? ` (${s.laenge_mm} × ${p.art === "riemchen" && p.riemchen_staerke_mm ? p.riemchen_staerke_mm : s.breite_mm} × ${s.hoehe_mm} mm)` : ""}.` : "",
    s.frostwiderstand === "F2" ? "Frostbeständig nach Kategorie F2 und damit für Fassaden in allen Lagen geeignet." : "",
    s.bedarf_stk_m2 ? `Bedarf: ca. ${s.bedarf_stk_m2} Stück je m².` : "",
  ];
  return teile.filter(Boolean).join(" ");
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
