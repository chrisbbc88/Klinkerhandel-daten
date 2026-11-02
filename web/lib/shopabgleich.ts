// Neuen Shop-Stand einlesen: nur Produkte übernehmen, die im ERP noch fehlen. Vorhandenes bleibt unberührt.
import { datenAusBestand, type Daten } from "./modell.ts";
import { lege_an, neueId } from "./aendern.ts";
import type { Bestand } from "../../src/import/bestand.ts";

export interface ShopVergleich { neu: { woo_id: number; name: string; sku: string | null }[]; fehltImShop: { id: number; sku: string | null; name: string }[]; neueReferenzen: number; stand: string | null }

export function shopVergleichen(d: Daten, b: Bestand): ShopVergleich {
  const f = datenAusBestand(b, new Date().toISOString(), "Shop");
  const bekannt = new Set(d.produkte.map((p) => p.woo_id).filter(Boolean));
  const imShop = new Set(f.produkte.map((p) => p.woo_id));
  const refBekannt = new Set(d.referenzen.map((r) => r.woo_id));
  return {
    neu: f.produkte.filter((p) => !bekannt.has(p.woo_id)).map((p) => ({ woo_id: p.woo_id!, name: p.name, sku: p.sku })),
    fehltImShop: d.produkte.filter((p) => p.woo_id && !imShop.has(p.woo_id) && p.status !== "archiviert").map((p) => ({ id: p.id, sku: p.sku, name: p.name })),
    neueReferenzen: f.referenzen.filter((r) => !refBekannt.has(r.woo_id)).length,
    stand: f.shop_stand,
  };
}

export function shopNeueUebernehmen(d: Daten, b: Bestand, von: string): { produkte: number; steine: number; referenzen: number; uebersprungen: string[] } {
  const jetzt = new Date().toISOString();
  const f = datenAusBestand(b, jetzt, von);
  const bekannt = new Set(d.produkte.map((p) => p.woo_id).filter(Boolean));
  const skus = new Set(d.produkte.map((p) => p.sku).filter(Boolean));
  const bildNachMedia = new Map(d.bilder.filter((x) => x.woo_media_id).map((x) => [x.woo_media_id, x.id]));
  const fBild = new Map(f.bilder.map((x) => [x.id, x]));
  const fStein = new Map(f.steine.map((s) => [s.id, s]));
  const steinNachCode = new Map(d.steine.map((s) => [s.hbr_code, s.id]));
  const herstNachName = new Map(d.hersteller.map((h) => [h.name, h.id]));
  const fHerst = new Map(f.hersteller.map((h) => [h.id, h.name]));
  const r = { produkte: 0, steine: 0, referenzen: 0, uebersprungen: [] as string[] };
  const bildId = (fid: number) => {
    const x = fBild.get(fid)!;
    const vorhanden = x.woo_media_id ? bildNachMedia.get(x.woo_media_id) : undefined;
    if (vorhanden) return vorhanden;
    const id = neueId();
    d.bilder.push({ ...x, id, geaendert_am: jetzt });
    if (x.woo_media_id) bildNachMedia.set(x.woo_media_id, id);
    return id;
  };
  const steinId = (fid: number | null) => {
    if (!fid) return null;
    const s = fStein.get(fid)!;
    const vorhanden = steinNachCode.get(s.hbr_code);
    if (vorhanden) return vorhanden;
    const h = s.hersteller_id ? herstNachName.get(fHerst.get(s.hersteller_id)!) ?? null : null;
    const neu = lege_an(d, "steine", { ...s, id: neueId(), hersteller_id: h }, von, jetzt);
    steinNachCode.set(s.hbr_code, neu.id); r.steine++;
    return neu.id;
  };
  for (const p of f.produkte) {
    if (bekannt.has(p.woo_id)) continue;
    if (p.sku && skus.has(p.sku)) { r.uebersprungen.push(`${p.sku}: Artikelnummer existiert im ERP bereits (anderes Shop-Produkt) – bitte prüfen`); continue; }
    const sid = steinId(p.stein_id);
    lege_an(d, "produkte", { ...p, id: neueId(), stein_id: sid, hersteller_id: sid ? d.steine.find((s) => s.id === sid)!.hersteller_id : null, bilder: p.bilder.map(bildId), status: p.sku ? "pruefung" : "entwurf" }, von, jetzt);
    if (p.sku) skus.add(p.sku);
    r.produkte++;
  }
  const refBekannt = new Set(d.referenzen.map((x) => x.woo_id));
  for (const x of f.referenzen) {
    if (refBekannt.has(x.woo_id)) continue;
    lege_an(d, "referenzen", { ...x, id: neueId(), stein_id: x.stein_id ? steinNachCode.get(fStein.get(x.stein_id)!.hbr_code) ?? null : null, bilder: x.bilder.map(bildId) }, von, jetzt);
    r.referenzen++;
  }
  return r;
}
