// Migration 0002: Steinwerte wandern in stein_format (Werte je Format), auf einer befüllten Datenbank geprüft.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pgliteDb, migrieren } from "../src/db.ts";

const quelle = join(import.meta.dirname, "..", "db", "migrations");

test("Migration 0002 ordnet vorhandene Steinwerte dem Format zu und erhält alle Daten", async () => {
  const db = await pgliteDb();
  try {
    const nur1 = await mkdtemp(join(tmpdir(), "mig-"));
    await copyFile(join(quelle, "0001_grundschema.sql"), join(nur1, "0001_grundschema.sql"));
    assert.deepEqual(await migrieren(db, nur1), ["0001_grundschema.sql"]);
    const sys = Number((await db.query("SELECT id FROM benutzer WHERE rolle='system'"))[0].id);
    await db.transaktion(sys, async (tx) => {
      for (const [k, l, b, h] of [["NF", 240, 115, 71], ["DF", 240, 115, 52], ["WF", 210, 100, 50], ["LF", null, null, null]] as const)
        await tx.query("INSERT INTO format (kuerzel, name, laenge_mm, breite_mm, hoehe_mm) VALUES ($1,$1,$2,$3,$4)", [k, l, b, h]);
      // Stein A: Maße passen zu DF → nur DF. Stein B: ein Format → dieses. Stein C: zwei Formate, nicht zuordenbar → beide „alt“.
      const stein = async (code: string, werte: Record<string, unknown>, formate: string[]) => {
        const sp = ["hbr_code", ...Object.keys(werte)];
        const id = Number((await tx.query(`INSERT INTO stein (${sp.join(",")}) VALUES (${sp.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`, [code, ...Object.values(werte)]))[0].id);
        const pid = Number((await tx.query("INSERT INTO produkt (stein_id, art, sku, name) VALUES ($1,'verblender',$2,'x') RETURNING id", [id, code]))[0].id);
        for (const f of formate) await tx.query("INSERT INTO produkt_format (produkt_id, format) VALUES ($1,$2)", [pid, f]);
        return id;
      };
      await stein("HBR 99-001", { laenge_mm: 240, breite_mm: 115, hoehe_mm: 52, druckfestigkeit_nmm2: 35 }, ["NF", "DF"]);
      await stein("HBR 99-002", { druckfestigkeit_nmm2: 28, frostwiderstand: "F2" }, ["WF"]);
      await stein("HBR 99-003", { wasseraufnahme_proz: 6.5 }, ["NF", "LF"]);
      await stein("HBR 99-004", {}, ["NF"]);
    });
    assert.deepEqual(await migrieren(db), ["0002_stein_format.sql", "0003_format_texte.sql"]);
    const zeilen = await db.query<{ hbr_code: string; format: string; quelle: string; druckfestigkeit_nmm2: string | null }>(
      "SELECT s.hbr_code, sf.format, sf.quelle, sf.druckfestigkeit_nmm2 FROM stein_format sf JOIN stein s ON s.id = sf.stein_id ORDER BY 1, 2");
    assert.deepEqual(zeilen.map((z) => [z.hbr_code, z.format, z.quelle]), [
      ["HBR 99-001", "DF", "manuell"], ["HBR 99-002", "WF", "manuell"], ["HBR 99-003", "LF", "alt"], ["HBR 99-003", "NF", "alt"],
    ]);
    assert.equal(Number(zeilen[0].druckfestigkeit_nmm2), 35);
    // Alte Spalten bleiben erhalten (nicht destruktiv)
    assert.equal(Number((await db.query("SELECT druckfestigkeit_nmm2 FROM stein WHERE hbr_code='HBR 99-001'"))[0].druckfestigkeit_nmm2), 35);
    const fm = await db.query<{ kuerzel: string; mm_art: string | null }>("SELECT kuerzel, mm_art FROM format ORDER BY kuerzel");
    assert.deepEqual(Object.fromEntries(fm.map((f) => [f.kuerzel, f.mm_art])), { DF: "norm", LF: null, NF: "norm", WF: "norm" });
    // Preise je Format: gleicher Tag zweimal erlaubt, wenn das Format verschieden ist
    await db.transaktion(sys, async (tx) => {
      const pid = Number((await tx.query("SELECT id FROM produkt WHERE sku='HBR 99-001'"))[0].id);
      await tx.query("INSERT INTO preis (produkt_id, preisart, betrag, einheit, gueltig_ab, quelle, erfasst_von) VALUES ($1,'vk',80,'m2','2026-11-01','manuell',$2)", [pid, sys]);
      await tx.query("INSERT INTO preis (produkt_id, preisart, betrag, einheit, gueltig_ab, quelle, erfasst_von, format) VALUES ($1,'vk',92,'m2','2026-11-01','manuell',$2,'DF')", [pid, sys]);
    });
    await assert.rejects(db.transaktion(sys, async (tx) => {
      const pid = Number((await tx.query("SELECT id FROM produkt WHERE sku='HBR 99-001'"))[0].id);
      await tx.query("INSERT INTO preis (produkt_id, preisart, betrag, einheit, gueltig_ab, quelle, erfasst_von, format) VALUES ($1,'vk',95,'m2','2026-11-01','manuell',$2,'DF')", [pid, sys]);
    }), /preis_eindeutig_idx|unique/);
    // Texte je Format (0003)
    await db.transaktion(sys, (tx) => tx.query("UPDATE produkt_format SET beschreibung = 'Text NF' WHERE format = 'NF' AND produkt_id = (SELECT id FROM produkt WHERE sku = 'HBR 99-001')"));
    assert.equal((await db.query("SELECT beschreibung FROM produkt_format WHERE format = 'NF' AND beschreibung IS NOT NULL"))[0].beschreibung, "Text NF");
    // Schreiben in stein_format wird protokolliert
    await db.transaktion(sys, (tx) => tx.query("UPDATE stein_format SET druckfestigkeit_nmm2 = 40 WHERE format = 'WF'"));
    assert.equal((await db.query("SELECT count(*)::int AS n FROM aenderung WHERE tabelle = 'stein_format'"))[0].n, 1);
  } finally {
    await db.schliessen();
  }
});
