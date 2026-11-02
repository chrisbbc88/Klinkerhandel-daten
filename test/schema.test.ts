// Tests für Schema, Constraints, Änderungsprotokoll und Konflikterkennung.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pgliteDb, migrieren, type Db } from "../src/db.ts";

let db: Db;
let sys: number;
before(async () => {
  db = await pgliteDb();
  await migrieren(db);
  sys = Number((await db.query("SELECT id FROM benutzer WHERE rolle='system'"))[0].id);
  await db.transaktion(sys, async (tx) => {
    await tx.query("INSERT INTO farbe (schluessel) VALUES ('rot')");
    await tx.query("INSERT INTO hersteller (name, hbr_praefix) VALUES ('Testwerk', '99')");
  });
});
after(() => db.schliessen());

const fehlt = async (fn: () => Promise<unknown>, muster: RegExp) => {
  await assert.rejects(fn, (e: Error) => { assert.match(e.message, muster); return true; });
};

test("Migrationen laufen nur einmal", async () => {
  assert.deepEqual(await migrieren(db), []);
});

test("Schreiben ohne Benutzerkontext wird abgelehnt", async () => {
  await fehlt(() => db.query("INSERT INTO stein (hbr_code) VALUES ('HBR 99-001')"), /Benutzerkontext/);
});

test("Ungültiger HBR-Code wird abgelehnt", async () => {
  await fehlt(() => db.transaktion(sys, (tx) => tx.query("INSERT INTO stein (hbr_code) VALUES ('HBR 99 – 001')")), /check constraint/);
});

test("Artikelnummern: Form, Eindeutigkeit, ein Verblender und ein Riemchen je Stein", async () => {
  const steinId = await db.transaktion(sys, async (tx) =>
    (await tx.query("INSERT INTO stein (hbr_code) VALUES ('HBR 99-002') RETURNING id"))[0].id);
  const neu = (art: string, sku: string | null, status = "entwurf") => db.transaktion(sys, (tx) =>
    tx.query("INSERT INTO produkt (stein_id, art, sku, name, status) VALUES ($1,$2,$3,'Test',$4)", [steinId, art, sku, status]));

  await fehlt(() => neu("riemchen", "HBR 99-002"), /produkt_sku_form/);
  await fehlt(() => neu("verblender", "HBR 99-002 R"), /produkt_sku_form/);
  await fehlt(() => neu("verblender", null, "freigegeben"), /produkt_freigabe_sku/);
  await neu("verblender", "HBR 99-002");
  await neu("riemchen", "HBR 99-002 R");
  await fehlt(() => neu("verblender", null), /produkt_stein_art_uq/);
  await fehlt(() => db.transaktion(sys, (tx) =>
    tx.query("INSERT INTO produkt (art, sku, name) VALUES ('verblender','HBR 99-002','Doppelt')")), /produkt_sku_key|unique/);
});

test("Gleichzeitiges Bearbeiten: veraltete Version schreibt nichts", async () => {
  const s = await db.transaktion(sys, async (tx) =>
    (await tx.query("INSERT INTO stein (hbr_code) VALUES ('HBR 99-003') RETURNING id, version"))[0]);
  // Benutzer A und B haben Version 1 geladen. A speichert zuerst.
  const a = await db.transaktion(sys, (tx) =>
    tx.query("UPDATE stein SET hoehe_mm = 65 WHERE id = $1 AND version = $2 RETURNING version", [s.id, s.version]));
  assert.equal(a.length, 1);
  assert.equal(a[0].version, 2);
  const b = await db.transaktion(sys, (tx) =>
    tx.query("UPDATE stein SET hoehe_mm = 71 WHERE id = $1 AND version = $2 RETURNING version", [s.id, s.version]));
  assert.equal(b.length, 0, "B darf A nicht unbemerkt überschreiben");
  assert.equal(Number((await db.query("SELECT hoehe_mm FROM stein WHERE id=$1", [s.id]))[0].hoehe_mm), 65);
});

test("Änderungsprotokoll: nur geänderte Felder, mit Benutzer, nicht änderbar", async () => {
  const s = await db.transaktion(sys, async (tx) =>
    (await tx.query("INSERT INTO stein (hbr_code) VALUES ('HBR 99-004') RETURNING id"))[0]);
  await db.transaktion(sys, (tx) => tx.query("UPDATE stein SET frostwiderstand = 'F2' WHERE id = $1", [s.id]));
  const p = await db.query("SELECT * FROM aenderung WHERE tabelle='stein' AND datensatz=$1 ORDER BY id", [String(s.id)]);
  assert.deepEqual(p.map((r) => r.aktion), ["INSERT", "UPDATE"]);
  assert.deepEqual(p[1].neu, { frostwiderstand: "F2" });
  assert.deepEqual(p[1].alt, { frostwiderstand: null });
  assert.equal(Number(p[1].benutzer_id), sys);
  await fehlt(() => db.query("UPDATE aenderung SET neu = '{}' WHERE id = $1", [p[0].id]), /nicht verändert/);
  await fehlt(() => db.query("DELETE FROM aenderung WHERE id = $1", [p[0].id]), /nicht verändert/);
});

test("Fehler in einer Transaktion nimmt alles zurück", async () => {
  await assert.rejects(db.transaktion(sys, async (tx) => {
    await tx.query("INSERT INTO stein (hbr_code) VALUES ('HBR 99-005')");
    await tx.query("INSERT INTO stein (hbr_code) VALUES ('ungültig')");
  }));
  assert.equal((await db.query("SELECT 1 FROM stein WHERE hbr_code='HBR 99-005'")).length, 0);
});
