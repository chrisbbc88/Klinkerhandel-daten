// Tests für die Übernahme des Shop-Bestands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planen, kurztextLesen, type Bestand } from "../src/import/bestand.ts";
import { planSchreiben } from "../src/import/schreiben.ts";
import { csvZelle } from "../src/import/bericht.ts";
import { pgliteDb, migrieren } from "../src/db.ts";

const echt = JSON.parse(readFileSync(join(import.meta.dirname, "..", "data", "bestand-2026-11-02.json"), "utf8")) as Bestand;

// Kleiner künstlicher Bestand mit den typischen Problemfällen
const KAT = [
  { id: 1, name: "1", parent: 0 }, { id: 2, name: "Werk A", parent: 1 }, { id: 3, name: "Werk B Klinker", parent: 1 },
  { id: 10, name: "Farbe", parent: 0 }, { id: 11, name: "rot", parent: 10 }, { id: 12, name: "braun", parent: 10 },
  { id: 20, name: "Format", parent: 0 }, { id: 21, name: "Normalformat (NF)", parent: 20 }, { id: 22, name: "Dünnformat (DF)", parent: 20 },
  { id: 30, name: "Verblender", parent: 0 }, { id: 31, name: "Handform", parent: 30 },
  { id: 40, name: "Riemchen", parent: 0 }, { id: 41, name: "Handform", parent: 40 },
  { id: 50, name: "Referenzen", parent: 0 }, { id: 51, name: "Referenzen Modern", parent: 50 },
];
const P = (id: number, name: string, kategorien: number[], bilder = [100 + id], kurztext = "Format: NF Farbe: rot") => ({
  id, name, slug: `p-${id}`, sku: "", kategorien, kurztext, beschreibung_laenge: 0, produktlinks: [] as string[],
  bilder: bilder.map((b) => ({ id: b, datei: `x/${b}.jpg`, breite: 800, alt: "" })),
});
const klein: Bestand = {
  stand: "2026-11-02T00:00:00Z", kategorien: KAT,
  produkte: [
    P(1, "Klinker / Verblender – HBR 50-100 – Handform Klinkerstein", [2, 11, 21, 31, 30]),
    P(2, "Riemchen / Verblender – HBR 50-100 R – Handform Klinkerriemchen", [2, 11, 21, 41, 40]),
    P(3, "Klinker / Verblender – HBR 50-101 – Handform Klinkerstein", [11, 21, 31, 30]),            // Hersteller fehlt → Präfix
    P(4, "Klinker / Verblender – HBR 51-100 – Handform Klinkerstein", [3, 11, 21, 31, 30]),
    P(5, "Klinker / Verblender – HBR 51-100 – Handform Klinkerstein", [3, 12, 21, 31, 30], [205]),  // doppelt, anderes Bild
    P(6, "Riemchen / Verblender – HBR 51-101 R – Handform Klinkerriemchen", [3, 11, 21, 31, 30]),   // Riemchen in Kategorie Verblender
    P(7, "Klinker / Verblender – HBR 52 – 100 – Handform Klinkerstein", [11, 22, 31, 30]),          // Schreibweise, unbekanntes Präfix
    P(8, "Einfamilienhaus H1 Klinker / Verblender – HBR 50-100 – Handform", [50, 51], [101, 101]),  // Referenz, Bild doppelt
    P(9, "Einfamilienhaus H2 Klinker / Verblender – HBR 51-100 – Handform", [], [109]),              // Referenz ohne Kategorie, Stein unklar
  ],
};

test("Kurztext wird zerlegt, auch mit Formular-Resten und Schrägstrich", () => {
  assert.deepEqual(kurztextLesen("Format: NF, DF Farbe: weiß/creme Hier geht es zum Verblender"), { formate: ["NF", "DF"], farben: ["weiß", "creme"] });
  assert.equal(kurztextLesen("Preise auf Anfrage"), null);
});

test("Problemfälle werden erkannt, aber nicht stillschweigend korrigiert", () => {
  const p = planen(klein);
  const regel = (r: string) => p.befunde.filter((b) => b.regel === r);

  // Verblender + Riemchen hängen am selben Stein
  const s100 = p.steine.find((s) => s.hbr_code === "HBR 50-100")!;
  assert.equal(s100.hersteller, "Werk A");
  assert.deepEqual(p.produkte.filter((x) => x.stein === "HBR 50-100").map((x) => x.sku).sort(), ["HBR 50-100", "HBR 50-100 R"]);

  // Präfix 50 = Werk A, daher Hersteller für 50-101 abgeleitet, mit Hinweis
  assert.equal(p.steine.find((s) => s.hbr_code === "HBR 50-101")!.hersteller_quelle, "praefix");
  assert.equal(regel("hersteller_aus_praefix").length, 1);

  // Doppelter Code: beide ohne SKU und ohne Stein, nichts zusammengeführt
  const d = p.produkte.filter((x) => x.woo_id === 4 || x.woo_id === 5);
  assert.equal(d.length, 2);
  assert.ok(d.every((x) => x.sku === null && x.stein === null));
  assert.match(regel("code_doppelt")[0].text, /Bilder unterscheiden sich/);

  // Riemchen in Kategorie Verblender: Art aus dem Namen, Befund
  assert.equal(p.produkte.find((x) => x.woo_id === 6)!.art, "riemchen");
  assert.equal(regel("kategorie_falsch")[0].woo_id, 6);

  // Schreibweise normalisiert, Befund; Präfix 52 unbekannt → Hersteller fehlt
  assert.equal(p.produkte.find((x) => x.woo_id === 7)!.sku, "HBR 52-100");
  assert.ok(regel("code_schreibweise").some((b) => b.woo_id === 7));
  assert.ok(regel("hersteller_fehlt").some((b) => b.hbr_code === "HBR 52-100"));
  assert.ok(regel("kurztext_format").some((b) => b.woo_id === 7)); // Text NF, Kategorie DF

  // Referenzen: ohne Kategorie erkannt; Stein nur verknüpft, wenn eindeutig
  assert.equal(p.referenzen.length, 2);
  assert.equal(p.referenzen.find((r) => r.woo_id === 8)!.stein, "HBR 50-100");
  assert.equal(p.referenzen.find((r) => r.woo_id === 9)!.stein, null);
  assert.ok(regel("referenz_ohne_stein").some((b) => b.woo_id === 9));
  assert.ok(regel("keine_kategorie").some((b) => b.woo_id === 9));
  assert.equal(p.referenzen.find((r) => r.woo_id === 8)!.bilder.length, 1);
  assert.ok(regel("bild_doppelt").some((b) => b.woo_id === 8));
});

test("Echter Bestand: Zahlen stimmen mit der Bestandsaufnahme überein", () => {
  const p = planen(echt);
  const n = (f: (x: any) => boolean, a: any[] = p.produkte) => a.filter(f).length;
  assert.equal(echt.produkte.length, 741);
  assert.equal(p.produkte.length + p.referenzen.length + p.uebersprungen.length, 741, "jeder Shop-Eintrag ist zugeordnet");
  assert.equal(p.uebersprungen.length, 0);
  assert.equal(n((x) => x.art === "verblender"), 289);   // 293 im Shop, davon 4 Riemchen in falscher Kategorie
  assert.equal(n((x) => x.art === "riemchen"), 267);
  assert.equal(n((x) => x.art === "nistklinker"), 6);
  assert.equal(p.referenzen.length, 179);                // 177 + 2 ohne Kategorie
  assert.equal(n((x) => x.sku === null), 6);              // drei doppelte Codes
  const skus = p.produkte.map((x) => x.sku).filter(Boolean);
  assert.equal(new Set(skus).size, skus.length, "keine Artikelnummer doppelt");
  // Präfix → Hersteller ist im Shop eindeutig
  assert.equal(new Set(p.hersteller.map((h) => h.hbr_praefix).filter(Boolean)).size, 10);
  // Alle fehlenden Hersteller liegen in Präfixen ohne Zuordnung
  const offen = new Set(p.befunde.filter((b) => b.regel === "hersteller_fehlt" && b.objekt === "stein").map((b) => b.hbr_code!.slice(4, 6)));
  assert.deepEqual([...offen].sort(), ["17", "18", "22", "23", "24", "25", "27"]);
});

test("Übernahme in die Datenbank: vollständig, wiederholbar, bricht bei Doppelausführung ab", async () => {
  const db = await pgliteDb();
  try {
    await migrieren(db);
    const plan = planen(echt);
    const e = await planSchreiben(db, plan, "erstuebernahme", "test.json");
    assert.equal(e.produkte, 562);
    assert.equal(e.steine, 314);
    assert.equal(e.referenzen, 179);
    assert.equal(e.befunde, plan.befunde.length);
    const n = async (sql: string) => Number((await db.query(sql))[0].n);
    assert.equal(await n("SELECT count(*) n FROM produkt_bild") + await n("SELECT count(*) n FROM referenz_bild"), 3480);
    assert.equal(await n("SELECT count(*) n FROM aenderung WHERE tabelle='produkt'"), 562, "jede Anlage ist protokolliert");

    await assert.rejects(planSchreiben(db, plan, "erstuebernahme", "test.json"), /bereits 562 Produkte/);
    const zweiter = await planSchreiben(db, plan, "nur_neue", "test.json");
    assert.equal(zweiter.produkte + zweiter.referenzen + zweiter.befunde, 0);
    assert.equal(zweiter.uebersprungen_vorhanden, 741);
  } finally {
    await db.schliessen();
  }
});

test("Fehlerhafter Plan: es wird gar nichts übernommen", async () => {
  const db = await pgliteDb();
  try {
    await migrieren(db);
    const plan = planen(klein);
    plan.produkte[plan.produkte.length - 1].formate.push("XYZ"); // unbekanntes Format → Fremdschlüsselfehler
    await assert.rejects(planSchreiben(db, plan, "erstuebernahme", "kaputt.json"));
    for (const t of ["produkt", "stein", "bild", "befund", "import_lauf"])
      assert.equal(Number((await db.query(`SELECT count(*) n FROM ${t}`))[0].n), 0, `${t} muss leer sein`);
  } finally {
    await db.schliessen();
  }
});

test("CSV schützt vor Tabellenformeln", () => {
  assert.equal(csvZelle("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvZelle("-1"), "'-1");
  assert.equal(csvZelle("a;b"), '"a;b"');
  assert.equal(csvZelle(null), "");
});
