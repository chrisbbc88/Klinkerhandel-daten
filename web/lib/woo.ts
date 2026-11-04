// WooCommerce-Paket: Datei mit allen seit dem letzten Export geänderten Produkten und Referenzen.
// Die Browser-Version veröffentlicht nicht selbst (der API-Schlüssel darf nicht in eine öffentliche Seite).
import { HERSTELLUNG, ART, herstellerSichtbar, type Daten, type Produkt, type Referenz } from "./modell.ts";
import { protokolliere } from "./aendern.ts";
import { formatWerte } from "./formate.ts";

export const BILD_BASIS = "https://www.klinkerhandel.de/wp-content/uploads/";
export const bildUrl = (datei: string) => (/^(https?:|data:|blob:)/.test(datei) ? datei : BILD_BASIS + datei);

export type ExportGrund = "neu" | "geaendert" | "ausblenden";
export interface ExportKandidat { p: Produkt; grund: ExportGrund }
export interface ReferenzKandidat { r: Referenz; grund: ExportGrund }

export function exportKandidaten(d: Daten): { offen: ExportKandidat[]; zurueckgehalten: Produkt[]; referenzen: ReferenzKandidat[]; referenzenZurueck: Referenz[] } {
  const steine = new Map(d.steine.map((s) => [s.id, s]));
  const hersteller = new Map(d.hersteller.map((h) => [h.id, h]));
  const offen: ExportKandidat[] = [], zurueckgehalten: Produkt[] = [];
  for (const p of d.produkte) {
    const s = p.stein_id ? steine.get(p.stein_id) : undefined;
    const steinGeaendert = !!s && s.version > 1 && (!p.zuletzt_exportiert_am || s.geaendert_am > p.zuletzt_exportiert_am);
    const hz = s?.hersteller_id ? hersteller.get(s.hersteller_id)?.sichtbarkeit_geaendert_am : undefined;
    const sichtbarkeitGeaendert = p.hersteller_im_shop === "standard" && !!hz && (!p.zuletzt_exportiert_am || hz > p.zuletzt_exportiert_am);
    const geaendert = p.zuletzt_exportiert_version !== p.version || steinGeaendert || sichtbarkeitGeaendert;
    if (!geaendert) continue;
    if (p.status === "archiviert") { if (p.woo_id) offen.push({ p, grund: "ausblenden" }); continue; }
    if (p.status !== "freigegeben") { zurueckgehalten.push(p); continue; }
    offen.push({ p, grund: p.woo_id ? "geaendert" : "neu" });
  }
  const referenzen: ReferenzKandidat[] = [], referenzenZurueck: Referenz[] = [];
  for (const r of d.referenzen) {
    if (r.zuletzt_exportiert_version === r.version) continue;
    if (r.status === "archiviert") { if (r.woo_id) referenzen.push({ r, grund: "ausblenden" }); continue; }
    if (r.status !== "freigegeben") { referenzenZurueck.push(r); continue; }
    referenzen.push({ r, grund: r.woo_id ? "geaendert" : "neu" });
  }
  return { offen, zurueckgehalten, referenzen, referenzenZurueck };
}

export function wooPaket(d: Daten, kandidaten: ExportKandidat[], von: string, jetzt = new Date().toISOString(), referenzen: ReferenzKandidat[] = []) {
  const steine = new Map(d.steine.map((s) => [s.id, s]));
  const bilder = new Map(d.bilder.map((b) => [b.id, b]));
  const hersteller = new Map(d.hersteller.map((h) => [h.id, h]));
  const bildListe = (ids: number[]) => ids.map((id, i) => { const b = bilder.get(id); return b ? { media_id: b.woo_media_id, datei: b.datei, alt: b.alt, rolle: i === 0 ? "hauptbild" : "galerie" } : null; }).filter(Boolean);
  const produkteZuStein = (sid: number | null) => d.produkte.filter((p) => sid && p.stein_id === sid && p.status !== "archiviert");
  return {
    format: "klinkerhandel-woo-paket", version: 3, erstellt_am: jetzt, von, anzahl: kandidaten.length + referenzen.length,
    hinweise: [
      "Preise werden nicht übertragen (Shop im Katalogmodus). Neue Produkte und Referenzen werden als Entwurf angelegt.",
      "hersteller_anzeigen = false: Herstellerkategorie und Marke am Produkt entfernen; der Hersteller wird bewusst nicht mitgeliefert.",
    ],
    eintraege: [
      ...kandidaten.map(({ p, grund }) => {
        const s = p.stein_id ? steine.get(p.stein_id) : undefined;
        if (grund === "ausblenden") return { typ: "produkt", aktion: "ausblenden", id: p.woo_id, sku: p.sku };
        const h = s?.hersteller_id ? hersteller.get(s.hersteller_id) : undefined;
        const sichtbar = herstellerSichtbar(p, h);
        return {
          typ: "produkt", aktion: grund === "neu" ? "anlegen" : "aktualisieren",
          id: p.woo_id, sku: p.sku, name: p.name, slug: p.woo_slug || undefined,
          status: grund === "neu" ? "draft" : "publish",
          produkttyp: ART[p.art], hbr_code: s?.hbr_code ?? null,
          hersteller_anzeigen: sichtbar, hersteller: sichtbar ? h?.name ?? null : null,
          herstellungsart: s?.herstellungsart ? HERSTELLUNG[s.herstellungsart] : null,
          farben: s?.farben ?? [], formate: p.formate, oberflaechen: s?.oberflaechen ?? [],
          technik: { riemchen_staerke_mm: p.riemchen_staerke_mm, eckriemchen: p.eckriemchen },
          // Je Format: Maße (bei Riemchen Stärke statt Breite), Technik, Bedarf. Grundlage für Varianten im Shop.
          varianten: p.formate.map((f) => {
            const w = formatWerte(d, s, f);
            return {
              format: f, format_name: w.name,
              laenge_mm: w.laenge_mm, breite_mm: p.art === "riemchen" ? p.riemchen_staerke_mm : w.breite_mm, hoehe_mm: w.hoehe_mm,
              masse_normmass: w.masse_quelle !== null && w.masse_quelle !== "eingetragen",
              gewicht_kg: p.art === "riemchen" ? null : w.gewicht_kg, druckfestigkeit_nmm2: w.druckfestigkeit_nmm2,
              wasseraufnahme_proz: w.wasseraufnahme_proz, frostwiderstand: w.frostwiderstand, bedarf_stk_m2: w.bedarf_stk_m2,
            };
          }),
          kurztext: p.kurztext, beschreibung: p.beschreibung, bilder: bildListe(p.bilder),
        };
      }),
      ...referenzen.map(({ r, grund }) => {
        if (grund === "ausblenden") return { typ: "referenz", aktion: "ausblenden", id: r.woo_id, name: r.name };
        const s = r.stein_id ? steine.get(r.stein_id) : undefined;
        const zu = produkteZuStein(r.stein_id);
        return {
          typ: "referenz", aktion: grund === "neu" ? "anlegen" : "aktualisieren", id: r.woo_id, name: r.name, slug: r.woo_slug || undefined,
          status: grund === "neu" ? "draft" : "publish",
          kategorien: ["Referenzen", ...r.rubriken.map((x) => `Referenzen ${x}`)],
          objektart: r.objektart, hbr_code: s?.hbr_code ?? r.hbr_code_shop,
          farben: s?.farben ?? [], formate: [...new Set(zu.flatMap((p) => p.formate))],
          herstellungsart: s?.herstellungsart ? HERSTELLUNG[s.herstellungsart] : null,
          verlinkt: zu.map((p) => ({ art: ART[p.art], sku: p.sku, woo_id: p.woo_id, slug: p.woo_slug || null })),
          beschreibung: r.beschreibung, bilder: bildListe(r.bilder),
        };
      }),
    ],
  };
}

/** Nach erfolgreichem Einspielen im Shop: als exportiert markieren (ohne neue Version). */
export function alsExportiertMarkieren(d: Daten, ids: number[], von: string, jetzt = new Date().toISOString(), referenzIds: number[] = []) {
  const set = new Set(ids), rset = new Set(referenzIds);
  for (const p of d.produkte) if (set.has(p.id)) { p.zuletzt_exportiert_version = p.version; p.zuletzt_exportiert_am = jetzt; }
  for (const r of d.referenzen) if (rset.has(r.id)) { r.zuletzt_exportiert_version = r.version; r.zuletzt_exportiert_am = jetzt; }
  protokolliere(d, { zeit: jetzt, von, tabelle: "produkte", id: 0, aktion: "aendern", felder: null, text: `${ids.length} Produkte${referenzIds.length ? ` und ${referenzIds.length} Referenzen` : ""} als im Shop eingespielt markiert` });
}
