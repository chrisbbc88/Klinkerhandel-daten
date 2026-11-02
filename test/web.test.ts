// Tests der Browser-Logik (läuft in Node, ohne Browser).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { datenAusBestand, aktuellerPreis, naechsterCode, type Daten } from "../web/lib/modell.ts";
import { aendere, loesche, Konflikt } from "../web/lib/aendern.ts";
import { pruefeSicherung, fuehreZusammen, vergleiche } from "../web/lib/sicherung.ts";
import { csvLesen, csvText, zahlLesen } from "../web/lib/csv.ts";
import { produkteCsv, produktImportPlanen, produktImportAusfuehren } from "../web/lib/produktcsv.ts";
import { kontaktImportPlanen, kontaktImportAusfuehren } from "../web/lib/kontaktcsv.ts";
import { positionRechnen, summen, naechsteNummer } from "../web/lib/angebot.ts";
import { erkenneWerte } from "../web/lib/datenblatt.ts";
import { exportKandidaten, alsExportiertMarkieren, wooPaket } from "../web/lib/woo.ts";

const bestand = JSON.parse(readFileSync(new URL("../data/bestand-2026-11-02.json", import.meta.url), "utf8"));
const T0 = "2026-11-02T10:00:00.000Z";
const frisch = (): Daten => datenAusBestand(bestand, T0);
const basis = frisch();

test("Erstbefüllung entspricht dem Abgleich", () => {
  assert.equal(basis.produkte.length, 562);
  assert.equal(basis.steine.length, 314);
  assert.equal(basis.referenzen.length, 179);
  assert.ok(basis.kontakte.some((k) => k.typ === "lieferant"));
  assert.equal(naechsterCode(basis, "11").slice(0, 7), "HBR 11-");
});

test("Versionskonflikt verhindert stilles Überschreiben", () => {
  const d = structuredClone(basis);
  const p = d.produkte[0];
  aendere(d, "produkte", p.id, { kurztext: "A" }, "Tobi", 1, "2026-11-02T11:00:00.000Z");
  assert.throws(() => aendere(d, "produkte", p.id, { kurztext: "B" }, "Sven", 1), Konflikt);
  assert.equal(d.produkte[0].kurztext, "A");
  assert.equal(d.aenderungen.at(-1)!.von, "Tobi");
});

test("Sicherung: Prüfung lehnt fremde oder leere Dateien ab", () => {
  assert.equal(pruefeSicherung({ format: "x" }).ok, false);
  assert.equal(pruefeSicherung({ ...basis, produkte: [], kontakte: [] }).ok, false);
  assert.equal(pruefeSicherung({ ...basis, schema: 99 }).ok, false);
  assert.equal(pruefeSicherung(JSON.parse(JSON.stringify(basis))).ok, true);
});

test("Zusammenführen: jüngere Änderung gewinnt, Löschungen bleiben gelöscht, doppelte Codes werden gemeldet", () => {
  const tobi = structuredClone(basis), sven = structuredClone(basis);
  const [a, b, c] = basis.produkte;
  aendere(tobi, "produkte", a.id, { kurztext: "Tobi" }, "Tobi", undefined, "2026-11-02T11:00:00.000Z");
  aendere(sven, "produkte", a.id, { kurztext: "Sven später" }, "Sven", undefined, "2026-11-02T12:00:00.000Z");
  aendere(tobi, "produkte", b.id, { kurztext: "nur Tobi" }, "Tobi", undefined, "2026-11-02T11:00:00.000Z");
  loesche(sven, "produkte", c.id, "Sven", "2026-11-02T12:00:00.000Z");
  // beide legen unabhängig denselben neuen Stein an
  tobi.steine.push({ ...structuredClone(basis.steine[0]), id: 9_000_111, hbr_code: "HBR 99-100", geaendert_am: "2026-11-02T11:00:00.000Z" });
  sven.steine.push({ ...structuredClone(basis.steine[0]), id: 9_000_222, hbr_code: "HBR 99-100", geaendert_am: "2026-11-02T11:30:00.000Z" });

  const v = vergleiche(tobi, sven);
  assert.equal(v.produkte.neuer, 1);
  const { daten, konflikte } = fuehreZusammen(tobi, sven);
  const by = (id: number) => daten.produkte.find((p) => p.id === id);
  assert.equal(by(a.id)!.kurztext, "Sven später");
  assert.equal(by(b.id)!.kurztext, "nur Tobi");
  assert.equal(by(c.id), undefined);
  assert.ok(konflikte.some((k) => k.includes("HBR 99-100")));
  // Rückrichtung liefert denselben Stand für a, b, c
  const r = fuehreZusammen(sven, tobi).daten;
  assert.equal(r.produkte.find((p) => p.id === a.id)!.kurztext, "Sven später");
  assert.equal(r.produkte.find((p) => p.id === c.id), undefined);
});

test("CSV: Formeln werden entschärft und beim Einlesen wiederhergestellt", () => {
  const t = csvText(["a", "b"], [["=SUMME(A1)", "x;y\"z"], [1.5, null]]);
  assert.ok(t.includes("'=SUMME"));
  const z = csvLesen(t);
  assert.deepEqual(z[1], ["=SUMME(A1)", 'x;y"z']);
  assert.equal(z[2][0], "1,5");
  assert.equal(zahlLesen("1.234,50"), 1234.5);
  assert.ok(Number.isNaN(zahlLesen("abc")!));
});

test("Produkt-CSV: unveränderter Rück-Import erkennt keine Änderungen", () => {
  const d = structuredClone(basis);
  const plan = produktImportPlanen(d, produkteCsv(d, d.produkte));
  assert.equal(plan.zeilen.filter((z) => z.aktion !== "gleich").length, 0, JSON.stringify(plan.zeilen.find((z) => z.aktion !== "gleich")));
});

test("Produkt-CSV: Änderungen, Preise, neue Produkte und Fehler", () => {
  const d = structuredClone(basis);
  const p = d.produkte.find((x) => x.sku === "HBR 11-110")!;
  const geschwister = d.produkte.find((x) => x.stein_id === p.stein_id && x.id !== p.id);
  const csv = [
    "sku;herstellungsart;bedarf_stk_m2;vk_m2;ek_m2;preis_gueltig_ab;farben",
    "HBR 11-110;Handform;48;89,90;55;01.11.2026;rot, braun",
    "HBR 98-100 R;;;;;;",
    "HBR 11-110;;;;;;",
    "HBR 11-111;Steinzeug;;;;;",
    "Quatsch;;;;;;",
  ].join("\n");
  const plan = produktImportPlanen(d, csv);
  const [z1, z2, z3, z4, z5] = plan.zeilen;
  assert.equal(z1.aktion, "aendern");
  assert.deepEqual(z1.aenderungen.map((a) => a.spalte).sort(), ["bedarf_stk_m2", "ek_m2", "farben", "vk_m2"].sort().filter((s) => z1.aenderungen.some((a) => a.spalte === s)));
  assert.equal(z2.aktion, "neu");
  assert.equal(z3.aktion, "fehler"); // doppelt in der Datei
  assert.equal(z4.aktion, "fehler"); // unbekannte Herstellungsart
  assert.equal(z5.aktion, "fehler");
  const r = produktImportAusfuehren(d, plan, "Christian", "2026-11-02T13:00:00.000Z");
  assert.deepEqual(r, { geaendert: 1, neu: 1 });
  const p2 = d.produkte.find((x) => x.id === p.id)!;
  assert.equal(aktuellerPreis(p2, "vk", "m2", "2026-11-02")!.betrag, 89.9);
  assert.equal(aktuellerPreis(p2, "vk", "m2", "2026-10-31"), null);
  assert.equal(d.steine.find((s) => s.id === p.stein_id)!.bedarf_stk_m2, 48);
  if (geschwister) assert.equal(geschwister.stein_id, p.stein_id);
  const neu = d.produkte.find((x) => x.sku === "HBR 98-100 R")!;
  assert.equal(neu.art, "riemchen");
  assert.equal(neu.status, "entwurf");
  assert.ok(d.steine.some((s) => s.hbr_code === "HBR 98-100"));
});

test("Produkt-CSV: widersprüchliche Steinwerte für Verblender und Riemchen werden abgelehnt", () => {
  const d = structuredClone(basis);
  const v = d.produkte.find((p) => p.art === "verblender" && d.produkte.some((r) => r.art === "riemchen" && r.stein_id === p.stein_id))!;
  const r = d.produkte.find((x) => x.art === "riemchen" && x.stein_id === v.stein_id)!;
  const plan = produktImportPlanen(d, `sku;bedarf_stk_m2\n${v.sku};48\n${r.sku};64\n`);
  assert.equal(plan.zeilen[0].aktion, "aendern");
  assert.equal(plan.zeilen[1].aktion, "fehler");
});

test("Kontakt-CSV: neue und vorhandene Kontakte", () => {
  const d = structuredClone(basis);
  const plan = kontaktImportPlanen(d, "Firma;E-Mail;Ort\nMüller Bau GmbH;info@mueller-bau.de;Bocholt\nX;keine-mail;Rhede\n", "kunde");
  assert.equal(plan.zeilen[0].aktion, "neu");
  assert.equal(plan.zeilen[1].aktion, "fehler");
  assert.equal(kontaktImportAusfuehren(d, plan.zeilen, "Klaus"), 1);
  const again = kontaktImportPlanen(d, "Firma;E-Mail;Ort\nMüller Bau GmbH;info@mueller-bau.de;Bocholt\n", "kunde");
  assert.equal(again.zeilen[0].aktion, "gleich");
});

test("Angebot: Menge, Stück, Summen, Nummer", () => {
  const p = positionRechnen({ produkt_id: 1, sku: "HBR 11-110", bezeichnung: "x", flaeche_m2: 100, verschnitt_proz: 5, bedarf_stk_m2: 48, menge_m2: 0, menge_stk: null, ep_netto_m2: 50, rabatt_proz: 10 });
  assert.equal(p.menge_m2, 105);
  assert.equal(p.menge_stk, 5040);
  const s = summen({ positionen: [p], fracht_netto: 120 }, 19);
  assert.deepEqual(s, { waren: 4725, netto: 4845, mwst: 920.55, brutto: 5765.55 });
  const d = structuredClone(basis);
  assert.equal(naechsteNummer(d, "Klaus", 2026), "AN-2026-KL-001");
  d.vorgaenge.push({ nummer: "AN-2026-KL-007" } as any);
  assert.equal(naechsteNummer(d, "Klaus", 2026), "AN-2026-KL-008");
  assert.equal(naechsteNummer(d, "Tobi", 2026), "AN-2026-TO-001");
});

test("Datenblatt: Werte werden erkannt", () => {
  const text = `Produktdatenblatt  Format NF 240 x 115 x 71 mm  Mittlere Druckfestigkeit ≥ 35 N/mm²
    Wasseraufnahme ≤ 6,5 %   Frostwiderstand nach EN 771-1: F2   Gewicht ca. 2,4 kg   Bedarf: 48 Stück/m²`;
  const v = Object.fromEntries(erkenneWerte(text).map((x) => [x.feld, x.wert]));
  assert.deepEqual(v, { laenge_mm: 240, breite_mm: 115, hoehe_mm: 71, druckfestigkeit_nmm2: 35, wasseraufnahme_proz: 6.5, frostwiderstand: "F2", gewicht_kg: 2.4, bedarf_stk_m2: 48 });
});

test("WooCommerce-Paket: nur geänderte, freigegebene Produkte", () => {
  const d = structuredClone(basis);
  assert.equal(exportKandidaten(d).offen.length, 0);
  const p = d.produkte.find((x) => x.status === "freigegeben")!;
  aendere(d, "produkte", p.id, { beschreibung: "Neu" }, "Tobi");
  assert.equal(exportKandidaten(d).offen.length, 1);
  alsExportiertMarkieren(d, [p.id], "Tobi");
  assert.equal(exportKandidaten(d).offen.length, 0);
  aendere(d, "steine", p.stein_id!, { bedarf_stk_m2: 50 }, "Tobi", undefined, new Date(Date.now() + 1000).toISOString());
  assert.ok(exportKandidaten(d).offen.some((k) => k.p.id === p.id));
});

test("Shop-Stand: nur neue Produkte werden übernommen", async () => {
  const { shopVergleichen, shopNeueUebernehmen } = await import("../web/lib/shopabgleich.ts");
  const d = structuredClone(basis);
  assert.equal(shopVergleichen(d, bestand).neu.length, 0);
  const b2 = structuredClone(bestand);
  const vorlage = b2.produkte.find((p: any) => p.name.includes("HBR 11-110"));
  b2.produkte.push({ ...vorlage, id: 999999, name: vorlage.name.replace("HBR 11-110", "HBR 11-199"), slug: "neu-11-199" });
  const v = shopVergleichen(d, b2);
  assert.equal(v.neu.length, 1);
  const vorher = d.produkte.length;
  const r = shopNeueUebernehmen(d, b2, "Christian");
  assert.equal(r.produkte, 1);
  assert.equal(r.steine, 1);
  assert.equal(d.produkte.length, vorher + 1);
  assert.equal(shopVergleichen(d, b2).neu.length, 0);
});

test("Hersteller-Sichtbarkeit: Standard, Ausnahme am Produkt, Export ohne Herstellername", async () => {
  const { herstellerSichtbar } = await import("../web/lib/modell.ts");
  const { textVorschlag } = { textVorschlag: null as any };
  const d = structuredClone(basis);
  const p = d.produkte.find((x) => x.status === "freigegeben" && x.stein_id && d.steine.find((s) => s.id === x.stein_id)!.hersteller_id)!;
  const s = d.steine.find((x) => x.id === p.stein_id)!;
  const h = d.hersteller.find((x) => x.id === s.hersteller_id)!;
  assert.equal(herstellerSichtbar(p, h), true);
  // Hersteller ausblenden → betroffene Produkte erscheinen im Paket, ohne Namen
  aendere(d, "hersteller", h.id, { im_shop_anzeigen: false, sichtbarkeit_geaendert_am: new Date().toISOString() }, "Klaus");
  const k = exportKandidaten(d);
  assert.ok(k.offen.some((x) => x.p.id === p.id));
  const paket = wooPaket(d, k.offen, "Klaus");
  const e = paket.eintraege.find((x: any) => x.sku === p.sku) as any;
  assert.equal(e.hersteller_anzeigen, false);
  assert.equal(e.hersteller, null);
  assert.ok(!JSON.stringify(e).includes(h.name));
  // Ausnahme am Produkt
  assert.equal(herstellerSichtbar({ ...p, hersteller_im_shop: "anzeigen" }, h), true);
  // Hersteller fehlt ist keine Pflicht mehr
  const { REGELN } = await import("../web/lib/pruefung.ts");
  assert.equal(REGELN.hersteller.schwere, "empfohlen");
  void textVorschlag;
});

test("Referenzen: neue freigegebene Referenz kommt ins Paket", () => {
  const d = structuredClone(basis);
  const s = d.steine[0];
  d.referenzen.push({ id: 9_100_001, version: 1, erstellt_am: T0, geaendert_am: T0, geaendert_von: "Tobi", woo_id: null, woo_slug: "", name: "Einfamilienhaus Rhede", objektart: "Einfamilienhaus",
    rubriken: ["EFH + DHH"], stein_id: s.id, hbr_code_shop: null, bilder: [], status: "freigegeben", ort: "Rhede", beschreibung: "Neubau", zuletzt_exportiert_version: null });
  const k = exportKandidaten(d);
  assert.equal(k.referenzen.length, 1);
  const e = wooPaket(d, [], "Tobi", undefined, k.referenzen).eintraege[0] as any;
  assert.equal(e.typ, "referenz");
  assert.deepEqual(e.kategorien, ["Referenzen", "Referenzen EFH + DHH"]);
  assert.ok(e.verlinkt.length >= 1);
  alsExportiertMarkieren(d, [], "Tobi", undefined, [9_100_001]);
  assert.equal(exportKandidaten(d).referenzen.length, 0);
});

test("KI-Datenblatt: Schema und Prüfung der Antwort", async () => {
  const { schema, vorschlaege, aufSteinAnwenden } = await import("../web/lib/ki.ts");
  const { OBERFLAECHEN } = await import("../web/lib/modell.ts");
  const sc = schema(basis, OBERFLAECHEN) as any;
  assert.equal(sc.additionalProperties, false);
  assert.deepEqual([...sc.required].sort(), Object.keys(sc.properties).sort()); // alle Felder Pflicht, keine optionalen
  const unions = Object.values(sc.properties).filter((p: any) => Array.isArray(p.type)).length;
  assert.ok(unions <= 16);
  const roh = {
    art: "verblender", hersteller: "Vandersanden", bezeichnung_hersteller: "Kolumba", artikelnr_hersteller: "", herstellungsart: "handform",
    farben: ["rot", "lila"], formate: ["WDF", "XYZ"], oberflaechen: ["besandet"], laenge_mm: 210, breite_mm: 100, hoehe_mm: 65, gewicht_kg: 2.1,
    druckfestigkeit_nmm2: 25, wasseraufnahme_proz: 99, frostwiderstand: "F2", bedarf_stk_m2: 73, riemchen_staerke_mm: null,
    herstellertext: "Ein Handformstein.", beschreibung_vorschlag: "Sachlicher Text.", belege: [{ feld: "laenge_mm", zitat: "210 x 100 x 65 mm" }], unsicher: "",
  } as any;
  const { liste, hinweise } = vorschlaege(roh, basis, OBERFLAECHEN);
  const v = Object.fromEntries(liste.map((x) => [x.feld, x.wert]));
  assert.equal(basis.hersteller.find((h) => h.id === v.hersteller_id)?.name, "Vandersanden Klinker");
  assert.deepEqual(v.farben, ["rot"]);          // unbekannte Farbe verworfen
  assert.deepEqual(v.formate, ["WDF"]);         // unbekanntes Format verworfen
  assert.equal(v.wasseraufnahme_proz, undefined); // unplausibel → nicht übernommen
  assert.ok(hinweise.some((h) => h.includes("Wasseraufnahme")));
  assert.equal(liste.find((x) => x.feld === "laenge_mm")!.warnung, undefined);
  assert.ok(liste.find((x) => x.feld === "druckfestigkeit_nmm2")!.warnung); // ohne Zitat
  const patch = aufSteinAnwenden(basis.steine[0], liste);
  assert.equal(patch.hersteller_quelle, "datenblatt");
  assert.equal((patch as any).formate, undefined); // Formate gehören zum Produkt
});
