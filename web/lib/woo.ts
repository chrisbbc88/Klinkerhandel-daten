// WooCommerce-Paket: Datei mit allen seit dem letzten Export geänderten Produkten.
// Die Browser-Version veröffentlicht nicht selbst (der API-Schlüssel darf nicht in eine öffentliche Seite).
import { HERSTELLUNG, ART, type Daten, type Produkt } from "./modell.ts";
import { protokolliere } from "./aendern.ts";

export const BILD_BASIS = "https://www.klinkerhandel.de/wp-content/uploads/";
export const bildUrl = (datei: string) => (/^(https?:|data:|blob:)/.test(datei) ? datei : BILD_BASIS + datei);

export type ExportGrund = "neu" | "geaendert" | "ausblenden";
export interface ExportKandidat { p: Produkt; grund: ExportGrund }

export function exportKandidaten(d: Daten): { offen: ExportKandidat[]; zurueckgehalten: Produkt[] } {
  const steine = new Map(d.steine.map((s) => [s.id, s]));
  const offen: ExportKandidat[] = [], zurueckgehalten: Produkt[] = [];
  for (const p of d.produkte) {
    const s = p.stein_id ? steine.get(p.stein_id) : undefined;
    const steinGeaendert = !!s && s.version > 1 && (!p.zuletzt_exportiert_am || s.geaendert_am > p.zuletzt_exportiert_am);
    const geaendert = p.zuletzt_exportiert_version !== p.version || steinGeaendert;
    if (!geaendert) continue;
    if (p.status === "archiviert") { if (p.woo_id) offen.push({ p, grund: "ausblenden" }); continue; }
    if (p.status !== "freigegeben") { zurueckgehalten.push(p); continue; }
    offen.push({ p, grund: p.woo_id ? "geaendert" : "neu" });
  }
  return { offen, zurueckgehalten };
}

export function wooPaket(d: Daten, kandidaten: ExportKandidat[], von: string, jetzt = new Date().toISOString()) {
  const steine = new Map(d.steine.map((s) => [s.id, s]));
  const bilder = new Map(d.bilder.map((b) => [b.id, b]));
  const hersteller = new Map(d.hersteller.map((h) => [h.id, h]));
  return {
    format: "klinkerhandel-woo-paket", version: 1, erstellt_am: jetzt, von, anzahl: kandidaten.length,
    hinweis: "Preise werden nicht übertragen (Shop im Katalogmodus). Neue Produkte werden als Entwurf angelegt.",
    eintraege: kandidaten.map(({ p, grund }) => {
      const s = p.stein_id ? steine.get(p.stein_id) : undefined;
      if (grund === "ausblenden") return { aktion: "ausblenden", id: p.woo_id, sku: p.sku };
      return {
        aktion: grund === "neu" ? "anlegen" : "aktualisieren",
        id: p.woo_id, sku: p.sku, name: p.name, slug: p.woo_slug || undefined,
        status: grund === "neu" ? "draft" : "publish",
        produkttyp: ART[p.art], hbr_code: s?.hbr_code ?? null,
        hersteller: s?.hersteller_id ? hersteller.get(s.hersteller_id)?.name ?? null : null,
        herstellungsart: s?.herstellungsart ? HERSTELLUNG[s.herstellungsart] : null,
        farben: s?.farben ?? [], formate: p.formate, oberflaechen: s?.oberflaechen ?? [],
        technik: s ? {
          laenge_mm: s.laenge_mm, breite_mm: s.breite_mm, hoehe_mm: s.hoehe_mm, gewicht_kg: s.gewicht_kg,
          druckfestigkeit_nmm2: s.druckfestigkeit_nmm2, wasseraufnahme_proz: s.wasseraufnahme_proz, frostwiderstand: s.frostwiderstand,
          bedarf_stk_m2: s.bedarf_stk_m2, riemchen_staerke_mm: p.riemchen_staerke_mm, eckriemchen: p.eckriemchen,
        } : null,
        kurztext: p.kurztext, beschreibung: p.beschreibung,
        bilder: p.bilder.map((id, i) => { const b = bilder.get(id); return b ? { media_id: b.woo_media_id, datei: b.datei, alt: b.alt, rolle: i === 0 ? "hauptbild" : "galerie" } : null; }).filter(Boolean),
      };
    }),
  };
}

/** Nach erfolgreichem Einspielen im Shop: Produkte als exportiert markieren (ohne neue Version). */
export function alsExportiertMarkieren(d: Daten, ids: number[], von: string, jetzt = new Date().toISOString()) {
  const set = new Set(ids);
  for (const p of d.produkte) if (set.has(p.id)) { p.zuletzt_exportiert_version = p.version; p.zuletzt_exportiert_am = jetzt; }
  protokolliere(d, { zeit: jetzt, von, tabelle: "produkte", id: 0, aktion: "aendern", felder: null, text: `${ids.length} Produkte als im Shop eingespielt markiert` });
}
