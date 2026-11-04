// Schreibt einen Übernahmeplan in die Datenbank. Alles in einer Transaktion:
// Entweder der ganze Plan wird übernommen oder nichts.
import type { Db, Abfrage } from "../db.ts";
import type { Plan } from "./bestand.ts";

export type Modus = "erstuebernahme" | "nur_neue";

export interface Ergebnis {
  import_lauf_id: number;
  hersteller: number; steine: number; produkte: number; referenzen: number; bilder: number;
  befunde: number; uebersprungen_vorhanden: number;
}

export async function systemBenutzerId(db: Abfrage): Promise<number> {
  const r = await db.query<{ id: string }>("SELECT id FROM benutzer WHERE rolle = 'system' ORDER BY id LIMIT 1");
  if (!r.length) throw new Error("Systembenutzer fehlt – wurden die Migrationen ausgeführt?");
  return Number(r[0].id);
}

export async function planSchreiben(db: Db, plan: Plan, modus: Modus, quelle: string): Promise<Ergebnis> {
  const sys = await systemBenutzerId(db);
  return db.transaktion(sys, async (tx) => {
    const vorhanden = Number((await tx.query<{ n: string }>("SELECT count(*) n FROM produkt"))[0].n);
    if (modus === "erstuebernahme" && vorhanden > 0)
      throw new Error(`Erstübernahme abgebrochen: Es sind bereits ${vorhanden} Produkte im ERP. ` +
        "Das ERP ist führend; Shop-Daten überschreiben keine ERP-Daten. Für neue Shop-Einträge Modus „nur_neue“ verwenden.");

    const lauf = await tx.query<{ id: string }>(
      "INSERT INTO import_lauf (quelle, stand, modus) VALUES ($1, $2, $3) RETURNING id", [quelle, plan.stand, modus]);
    const laufId = Number(lauf[0].id);
    const z = { hersteller: 0, steine: 0, produkte: 0, referenzen: 0, bilder: 0, befunde: 0, uebersprungen_vorhanden: 0 };
    const zeilen = (r: unknown[]) => r.length;
    // Was in diesem Lauf neu angelegt wurde – nur dafür werden Befunde geschrieben.
    const neu = { woo: new Set<number>(), steine: new Set<string>(), bilder: new Set<number>() };

    // Stammdaten (bestehende Einträge bleiben unverändert)
    for (const h of plan.hersteller)
      z.hersteller += zeilen(await tx.query(
        "INSERT INTO hersteller (name, hbr_praefix, woo_kategorie_id) VALUES ($1,$2,$3) ON CONFLICT (name) DO NOTHING RETURNING id",
        [h.name, h.hbr_praefix, h.woo_kategorie_id]));
    for (const [i, f] of plan.farben.entries())
      await tx.query("INSERT INTO farbe (schluessel, woo_kategorie_id, sortierung) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [f.schluessel, f.woo_kategorie_id, i]);
    for (const f of plan.formate)
      await tx.query(
        "INSERT INTO format (kuerzel, name, laenge_mm, breite_mm, hoehe_mm, woo_kategorie_id, mm_art) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
        [f.kuerzel, f.name, f.mm?.[0] ?? null, f.mm?.[1] ?? null, f.mm?.[2] ?? null, f.woo_kategorie_id,
          f.mm ? (["LDF", "XLDF"].includes(f.kuerzel) ? "ueblich" : "norm") : null]);

    const herstellerId = new Map((await tx.query<{ id: string; name: string }>("SELECT id, name FROM hersteller")).map((r) => [r.name, Number(r.id)]));

    // Bilder
    for (const b of plan.bilder) {
      const r = await tx.query(
        "INSERT INTO bild (woo_media_id, datei, breite_px, alt) VALUES ($1,$2,$3,$4) ON CONFLICT (woo_media_id) DO NOTHING RETURNING id",
        [b.woo_media_id, b.datei, b.breite_px, b.alt]);
      if (r.length) { z.bilder++; neu.bilder.add(b.woo_media_id); }
    }
    const bildId = new Map((await tx.query<{ id: string; woo_media_id: string }>("SELECT id, woo_media_id FROM bild WHERE woo_media_id IS NOT NULL"))
      .map((r) => [Number(r.woo_media_id), Number(r.id)]));

    // Steine
    for (const s of plan.steine) {
      const r = await tx.query<{ id: string }>(
        `INSERT INTO stein (hbr_code, hersteller_id, hersteller_quelle, herstellungsart) VALUES ($1,$2,$3,$4)
         ON CONFLICT (hbr_code) DO NOTHING RETURNING id`,
        [s.hbr_code, s.hersteller ? herstellerId.get(s.hersteller) ?? null : null, s.hersteller_quelle, s.herstellungsart]);
      if (!r.length) continue;
      z.steine++;
      neu.steine.add(s.hbr_code);
      for (const [pos, f] of s.farben.entries())
        await tx.query("INSERT INTO stein_farbe (stein_id, farbe, position) VALUES ($1,$2,$3)", [r[0].id, f, pos]);
    }
    const steinId = new Map((await tx.query<{ id: string; hbr_code: string }>("SELECT id, hbr_code FROM stein")).map((r) => [r.hbr_code, Number(r.id)]));

    // Produkte (Status „freigegeben“: sie sind bereits im Shop sichtbar; ohne SKU bleiben sie Entwurf)
    for (const p of plan.produkte) {
      const r = await tx.query<{ id: string }>(
        `INSERT INTO produkt (stein_id, art, sku, name, hersteller_id, woo_id, woo_slug, status, kurztext_shop_alt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (woo_id) DO NOTHING RETURNING id`,
        [p.stein ? steinId.get(p.stein) ?? null : null, p.art, p.sku, p.name, p.hersteller ? herstellerId.get(p.hersteller) ?? null : null,
          p.woo_id, p.woo_slug, p.sku ? "freigegeben" : "entwurf", p.kurztext_shop_alt]);
      if (!r.length) { z.uebersprungen_vorhanden++; continue; }
      z.produkte++;
      neu.woo.add(p.woo_id);
      const id = r[0].id;
      for (const f of p.formate) await tx.query("INSERT INTO produkt_format (produkt_id, format) VALUES ($1,$2)", [id, f]);
      for (const b of p.bilder)
        await tx.query("INSERT INTO produkt_bild (produkt_id, bild_id, position) VALUES ($1,$2,$3)", [id, bildId.get(b.woo_media_id), b.position]);
    }

    // Referenzen
    for (const ref of plan.referenzen) {
      const r = await tx.query<{ id: string }>(
        `INSERT INTO referenz (woo_id, woo_slug, name, objektart, rubriken, stein_id, hbr_code_shop, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'freigegeben') ON CONFLICT (woo_id) DO NOTHING RETURNING id`,
        [ref.woo_id, ref.woo_slug, ref.name, ref.objektart, ref.rubriken, ref.stein ? steinId.get(ref.stein) ?? null : null, ref.hbr_code_shop]);
      if (!r.length) { z.uebersprungen_vorhanden++; continue; }
      z.referenzen++;
      neu.woo.add(ref.woo_id);
      for (const b of ref.bilder)
        await tx.query("INSERT INTO referenz_bild (referenz_id, bild_id, position) VALUES ($1,$2,$3)", [r[0].id, bildId.get(b.woo_media_id), b.position]);
    }

    // Befunde nur für Einträge, die in diesem Lauf neu angelegt wurden
    for (const b of plan.befunde) {
      const betrifftNeues =
        b.objekt === "bild" ? neu.bilder.has(b.woo_id!) :
        b.objekt === "stein" ? neu.steine.has(b.hbr_code!) :
        neu.woo.has(b.woo_id!);
      if (!betrifftNeues) continue;
      await tx.query(
        "INSERT INTO befund (import_lauf_id, objekt, woo_id, hbr_code, regel, schwere, text) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [laufId, b.objekt, b.woo_id, b.hbr_code, b.regel, b.schwere, b.text]);
      z.befunde++;
    }

    const ergebnis = { import_lauf_id: laufId, ...z };
    await tx.query("UPDATE import_lauf SET beendet_am = now(), ergebnis = $2 WHERE id = $1", [laufId, JSON.stringify(ergebnis)]);
    return ergebnis;
  });
}
