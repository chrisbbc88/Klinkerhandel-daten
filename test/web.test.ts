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
  assert.deepEqual(z1.aenderungen.map((a) => a.spalte).sort(), ["ek_m2", "farben", "vk_m2"].sort().filter((s) => z1.aenderungen.some((a) => a.spalte === s)));
  assert.deepEqual(plan.unbekannteSpalten, ["bedarf_stk_m2"]); // Technik steht seit v0.6 je Format in der Format-CSV
  assert.equal(z2.aktion, "neu");
  assert.equal(z3.aktion, "fehler"); // doppelt in der Datei
  assert.equal(z4.aktion, "fehler"); // unbekannte Herstellungsart
  assert.equal(z5.aktion, "fehler");
  const r = produktImportAusfuehren(d, plan, "Christian", "2026-11-02T13:00:00.000Z");
  assert.deepEqual(r, { geaendert: 1, neu: 1 });
  const p2 = d.produkte.find((x) => x.id === p.id)!;
  assert.equal(aktuellerPreis(p2, "vk", "m2", "2026-11-02")!.betrag, 89.9);
  assert.equal(aktuellerPreis(p2, "vk", "m2", "2026-10-31"), null);
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
  const plan = produktImportPlanen(d, `sku;bezeichnung_hersteller\n${v.sku};Kolumba\n${r.sku};Kolumba Rot\n`);
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
  aendere(d, "steine", p.stein_id!, { format_daten: [{ format: p.formate[0], laenge_mm: null, breite_mm: null, hoehe_mm: null, gewicht_kg: null, druckfestigkeit_nmm2: 30, wasseraufnahme_proz: null, frostwiderstand: null, bedarf_stk_m2: null, artikelnr_hersteller: "", quelle: "manuell" }] }, "Tobi", undefined, new Date(Date.now() + 1000).toISOString());
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
  // Varianten je Format im Paket (Version 3)
  assert.equal(paket.version, 3);
  assert.deepEqual(e.varianten.map((v: any) => v.format), p.formate);
  const nfv = e.varianten.find((v: any) => v.format === "NF");
  if (nfv) assert.deepEqual([nfv.laenge_mm, nfv.hoehe_mm, nfv.masse_normmass, nfv.bedarf_stk_m2], [240, 71, true, 48]);
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
  const vari = (x: object) => ({ format: "", laenge_mm: null, breite_mm: null, hoehe_mm: null, gewicht_kg: null, druckfestigkeit_nmm2: null, wasseraufnahme_proz: null, frostwiderstand: "", bedarf_stk_m2: null, artikelnr_hersteller: "", ...x });
  const roh = {
    art: "verblender", hersteller: "Vandersanden", bezeichnung_hersteller: "Kolumba", artikelnr_hersteller: "", herstellungsart: "handform",
    farben: ["rot", "lila"], formate: ["WDF", "XYZ"], oberflaechen: ["besandet"], riemchen_staerke_mm: null,
    varianten: [
      vari({ format: "WDF", laenge_mm: 210, breite_mm: 100, hoehe_mm: 65, gewicht_kg: 2.1, druckfestigkeit_nmm2: 25, wasseraufnahme_proz: 99, frostwiderstand: "F2", bedarf_stk_m2: 58 }),
      vari({ format: "", laenge_mm: 240, breite_mm: 115, hoehe_mm: 71, druckfestigkeit_nmm2: 30, frostwiderstand: "F2" }), // Format aus den Maßen: NF
      vari({ format: "", laenge_mm: 333, hoehe_mm: 44 }), // nicht zuordenbar
    ],
    herstellertext: "Ein Handformstein.", beschreibung_vorschlag: "Sachlicher Text.", belege: [{ feld: "WDF:laenge_mm", zitat: "210 x 100 x 65 mm" }], unsicher: "",
  } as any;
  const { liste, hinweise } = vorschlaege(roh, basis, OBERFLAECHEN);
  const v = Object.fromEntries(liste.map((x) => [x.feld, x.wert]));
  assert.equal(basis.hersteller.find((h) => h.id === v.hersteller_id)?.name, "Vandersanden Klinker");
  assert.deepEqual(v.farben, ["rot"]);          // unbekannte Farbe verworfen
  assert.deepEqual(v.formate, ["WDF", "NF"]);   // unbekanntes Format verworfen, NF aus Maßen erkannt
  assert.equal(v["fmt:WDF:wasseraufnahme_proz"], undefined); // unplausibel → nicht übernommen
  assert.equal(v["fmt:NF:druckfestigkeit_nmm2"], 30);
  assert.ok(hinweise.some((h) => h.includes("Wasseraufnahme")));
  assert.ok(hinweise.some((h) => h.includes("ohne erkennbares Format")));
  assert.equal(liste.find((x) => x.feld === "fmt:WDF:laenge_mm")!.warnung, undefined);
  assert.ok(liste.find((x) => x.feld === "fmt:WDF:druckfestigkeit_nmm2")!.warnung); // ohne Zitat
  const patch = aufSteinAnwenden(basis.steine[0], liste);
  assert.equal(patch.hersteller_quelle, "datenblatt");
  assert.equal((patch as any).formate, undefined); // Formate gehören zum Produkt
  const wdf = patch.format_daten!.find((x) => x.format === "WDF")!;
  assert.equal(wdf.druckfestigkeit_nmm2, 25);
  assert.equal(wdf.quelle, "datenblatt");
  assert.equal(patch.format_daten!.find((x) => x.format === "NF")!.frostwiderstand, "F2");
});

test("Formate: Normmaße, berechneter Bedarf und eingetragene Werte je Format", async () => {
  const { formatWerte, bedarfBerechnen, steinFormate, formatSetzen } = await import("../web/lib/formate.ts");
  const d = structuredClone(basis);
  assert.deepEqual(d.formate.find((f) => f.kuerzel === "DF")!.mm, [240, 115, 52]);
  assert.equal(d.formate.find((f) => f.kuerzel === "LF")!.mm, null); // herstellerabhängig
  const fugen = d.einstellungen.fugen;
  assert.deepEqual(fugen, { stoss_mm: 10, lager_mm: 12 });
  assert.equal(bedarfBerechnen(240, 71, fugen), 48);
  assert.equal(bedarfBerechnen(210, 50, fugen), 73);
  assert.equal(bedarfBerechnen(240, 113, fugen), 32);
  const s = d.steine.find((x) => d.produkte.some((p) => p.stein_id === x.id && p.formate.includes("NF") && p.formate.includes("DF")))!;
  const nf = formatWerte(d, s, "NF");
  assert.deepEqual([nf.laenge_mm, nf.breite_mm, nf.hoehe_mm, nf.masse_quelle, nf.bedarf_stk_m2, nf.bedarf_quelle], [240, 115, 71, "norm", 48, "berechnet"]);
  // Abweichendes Maß laut Datenblatt (Handform): nur Länge eingetragen, Rest bleibt Normmaß
  s.format_daten = formatSetzen(s, "NF", { laenge_mm: 245, druckfestigkeit_nmm2: 40, quelle: "datenblatt" });
  const nf2 = formatWerte(d, s, "NF");
  assert.deepEqual([nf2.laenge_mm, nf2.hoehe_mm, nf2.masse_quelle, nf2.druckfestigkeit_nmm2], [245, 71, "eingetragen", 40]);
  assert.equal(nf2.bedarf_stk_m2, Math.round(1e6 / (255 * 83)));
  assert.equal(formatWerte(d, s, "DF").druckfestigkeit_nmm2, null); // Werte bleiben beim Format
  const alle = steinFormate(d, s).map((w) => w.format);
  assert.ok(alle.includes("NF") && alle.includes("DF"));
  // Leeren entfernt den Datensatz
  s.format_daten = formatSetzen(s, "NF", { laenge_mm: null, druckfestigkeit_nmm2: null });
  assert.equal(s.format_daten.length, 0);
});

test("Formate: Prüfung je angebotenem Format", async () => {
  const { pruefeStein } = await import("../web/lib/pruefung.ts");
  const { formatSetzen } = await import("../web/lib/formate.ts");
  const d = structuredClone(basis);
  const p = d.produkte.find((x) => x.formate.includes("LF"))!;
  const s = d.steine.find((x) => x.id === p.stein_id)!;
  const masse = pruefeStein(s, d).find((x) => x.regel === "masse")!;
  assert.ok(masse.text.includes("LF"));        // LF hat kein Normmaß
  assert.ok(!masse.text.includes("NF"));
  for (const f of new Set(d.produkte.filter((x) => x.stein_id === s.id).flatMap((x) => x.formate)))
    s.format_daten = formatSetzen(s, f, { laenge_mm: 490, breite_mm: 90, hoehe_mm: 40, druckfestigkeit_nmm2: 30, wasseraufnahme_proz: 6, frostwiderstand: "F2" });
  assert.equal(pruefeStein(s, d).filter((x) => x.regel === "masse" || x.regel === "technik").length, 0);
});

test("Formate: Migration alter Stände ordnet Steinwerte dem Format zu", async () => {
  const { normalisieren } = await import("../web/lib/modell.ts");
  const d = structuredClone(basis) as any;
  d.schema = 1;
  for (const f of d.formate) delete f.mm_art;
  delete d.einstellungen.fugen;
  const p = d.produkte.find((x: any) => x.formate.length === 2 && x.formate.includes("NF") && x.formate.includes("DF") && d.produkte.filter((y: any) => y.stein_id === x.stein_id).every((y: any) => y.formate.length === 2))!;
  const s = d.steine.find((x: any) => x.id === p.stein_id);
  delete s.format_daten;
  Object.assign(s, { laenge_mm: 240, breite_mm: 115, hoehe_mm: 52, gewicht_kg: 1.9, druckfestigkeit_nmm2: 35, wasseraufnahme_proz: 7, frostwiderstand: "F2", bedarf_stk_m2: 64 });
  const s2 = d.steine.find((x: any) => x.id !== s.id && d.produkte.some((y: any) => y.stein_id === x.id && y.formate.length > 1));
  delete s2.format_daten;
  Object.assign(s2, { laenge_mm: 230, breite_mm: null, hoehe_mm: 60, gewicht_kg: null, druckfestigkeit_nmm2: 20, wasseraufnahme_proz: null, frostwiderstand: null, bedarf_stk_m2: null });
  const n = normalisieren(d);
  assert.equal(n.schema, 2);
  const neu = n.steine.find((x) => x.id === s.id)!;
  assert.equal((neu as any).laenge_mm, undefined);
  assert.deepEqual(neu.format_daten.map((x) => x.format), ["DF"]); // aus den Maßen erkannt
  assert.equal(neu.format_daten[0].druckfestigkeit_nmm2, 35);
  const neu2 = n.steine.find((x) => x.id === s2.id)!;
  assert.ok(neu2.format_daten.length > 1 && neu2.format_daten.every((x) => x.quelle === "alt")); // nicht zuordenbar → prüfen
  assert.deepEqual(n.einstellungen.fugen, { stoss_mm: 10, lager_mm: 12 });
  assert.equal(n.formate.find((f) => f.kuerzel === "NF")!.mm_art, "norm");
});

test("Formate: Format-CSV exportiert Normwerte und übernimmt nur Abweichungen", async () => {
  const { formateCsv, formatImportPlanen, formatImportAusfuehren } = await import("../web/lib/formatcsv.ts");
  const d = structuredClone(basis);
  const csv = formateCsv(d);
  const plan0 = formatImportPlanen(d, csv);
  assert.equal(plan0.zeilen.filter((z) => z.aktion !== "gleich").length, 0, JSON.stringify(plan0.zeilen.find((z) => z.aktion !== "gleich")));
  const s = d.steine.find((x) => d.produkte.some((p) => p.stein_id === x.id && p.formate.includes("NF")))!;
  const plan = formatImportPlanen(d, [
    "hbr_code;format;laenge_mm;druckfestigkeit_nmm2;frost;bedarf_stk_m2",
    `${s.hbr_code};NF;240;38;F2;48`,      // 240 und 48 = Normmaß/berechnet → keine Änderung
    `${s.hbr_code};nf;;;F9;`,              // Frost ungültig, Format klein geschrieben
    "HBR 99-999;NF;;;;",
    `${s.hbr_code};XYZ;;;;`,
  ].join("\n"));
  const [a, b, c, e] = plan.zeilen;
  assert.equal(a.aktion, "aendern");
  assert.deepEqual(a.aenderungen.map((x) => x.feld).sort(), ["druckfestigkeit_nmm2", "frostwiderstand"]);
  assert.equal(b.aktion, "fehler");
  assert.equal(c.aktion, "fehler");
  assert.equal(e.aktion, "fehler");
  assert.equal(formatImportAusfuehren(d, plan, "Tobi"), 1);
  const g = d.steine.find((x) => x.id === s.id)!.format_daten.find((x) => x.format === "NF")!;
  assert.deepEqual([g.laenge_mm, g.druckfestigkeit_nmm2, g.frostwiderstand, g.bedarf_stk_m2], [null, 38, "F2", null]);
});

test("Angebot: Format der Position bestimmt Bedarf und Preis", async () => {
  const { positionAusProdukt, positionFormat } = await import("../web/lib/angebot.ts");
  const d = structuredClone(basis);
  const p = d.produkte.find((x) => x.formate.includes("NF") && x.formate.includes("DF"))!;
  p.preise = [
    { id: 1, preisart: "vk", betrag: 80, einheit: "m2", gueltig_ab: "2026-01-01", quelle: "manuell", erfasst_von: "t", erfasst_am: T0 },
    { id: 2, preisart: "vk", betrag: 92, einheit: "m2", gueltig_ab: "2026-01-01", quelle: "manuell", erfasst_von: "t", erfasst_am: T0, format: "DF" },
  ];
  const offen = positionAusProdukt(p, d, 10);
  assert.equal(offen.format, "");               // mehrere Formate → muss gewählt werden
  assert.equal(offen.menge_stk, null);
  const nf = positionAusProdukt(p, d, 10, "NF");
  assert.deepEqual([nf.bedarf_stk_m2, nf.ep_netto_m2, nf.menge_stk], [48, 80, Math.ceil(nf.menge_m2 * 48)]);
  const df = positionFormat(nf, p, d, "DF");
  assert.deepEqual([df.bedarf_stk_m2, df.ep_netto_m2], [63, 92]);
  const hand = positionFormat({ ...nf, ep_netto_m2: 75 }, p, d, "DF"); // Preis von Hand geändert → bleibt
  assert.equal(hand.ep_netto_m2, 75);
  assert.equal(aktuellerPreis(p, "vk"), p.preise[0]);
  assert.equal(aktuellerPreis(p, "vk", "m2", undefined, "WF"), p.preise[0]); // ohne Formatpreis gilt der allgemeine
});

test("Anfrage: Datenqualität erkennt Lücken und Fake-Verdacht", async () => {
  const { datenqualitaet } = await import("../web/lib/anfrage.ts");
  const { kontaktLeer } = await import("../web/lib/modell.ts");
  const k = (x: object) => ({ ...kontaktLeer(1, "kunde", "", T0, "t"), ...x });
  assert.equal(datenqualitaet(k({ vorname: "Anna", nachname: "Meier", email: "anna.meier@web.de", telefon: "02872 12345", strasse: "Hauptstr. 1", plz: "46414", ort: "Rhede" })).stufe, "ok");
  const leer = datenqualitaet(k({ nachname: "Meier" }));
  assert.equal(leer.stufe, "unvollstaendig");
  assert.ok(leer.fehlt.includes("E-Mail oder Telefon"));
  assert.equal(datenqualitaet(k({ vorname: "Test", nachname: "Test", email: "x@mailinator.com", plz: "46414", ort: "Rhede", strasse: "a" })).stufe, "verdacht");
  assert.equal(datenqualitaet(k({ nachname: "Meier", email: "a@b.de", plz: "464", ort: "Rhede", strasse: "a" })).stufe, "pruefen");
});

test("Anfrage: Fracht nach PLZ, längstes Präfix gewinnt, frachtfrei ab m²", async () => {
  const { frachtFuer } = await import("../web/lib/anfrage.ts");
  const d = structuredClone(basis);
  assert.equal(frachtFuer(d, "46414", 50)!.betrag, 0);              // Nahbereich 464
  assert.equal(frachtFuer(d, "44135", 50)!.betrag, 95);             // NRW 4
  assert.equal(frachtFuer(d, "44135", 200)!.betrag, 0);             // frachtfrei ab 150 m²
  assert.equal(frachtFuer(d, "80331", 50), null);                   // keine Zone
});

test("Anfrage: Statuswechsel mit Prüfliste, Verlustgrund und Aufgaben", async () => {
  const { statusWechsel, pipelineKennzahlen } = await import("../web/lib/anfrage.ts");
  const { normalisieren, PRUEFSCHRITTE } = await import("../web/lib/modell.ts");
  const { positionAusProdukt } = await import("../web/lib/angebot.ts");
  const d = normalisieren(structuredClone(basis));
  d.einstellungen.preise.vier_augen_ab = null; // hier ohne Vier-Augen-Regel
  const p = d.produkte[0];
  d.vorgaenge.push({ id: 7, version: 1, erstellt_am: "2026-11-02T08:00:00.000Z", geaendert_am: T0, geaendert_von: "Tobi", nummer: "AN-2026-TO-001", kontakt_id: null, status: "neu", datum: "2026-11-02",
    quelle: "email", lieferort_plz: "46414", lieferort_ort: "Rhede", wunschtermin: "", betreff: "", positionen: [{ ...positionAusProdukt(p, d, 100, p.formate[0]), ep_netto_m2: 50 }], fracht_netto: 0, notiz: "", angebot_am: null } as any);
  normalisieren(d);
  assert.equal(statusWechsel(d, 7, "gesendet", "Tobi").ok, false); // nicht vorgesehen von neu
  assert.ok(statusWechsel(d, 7, "angebot_erstellt", "Tobi", { jetzt: "2026-11-02T08:10:00.000Z" }).ok);
  const r = statusWechsel(d, 7, "gesendet", "Tobi");
  assert.equal(r.ok, false); assert.match(r.fehler!, /prüfen/);
  const v = d.vorgaenge.find((x) => x.id === 7)!;
  v.pruefung = Object.fromEntries(PRUEFSCHRITTE.map(([k]) => [k, { von: "Klaus", zeit: T0 }]));
  assert.ok(statusWechsel(d, 7, "gesendet", "Tobi").ok);
  assert.equal(statusWechsel(d, 7, "abgelehnt", "Tobi").ok, false); // Grund fehlt
  assert.ok(statusWechsel(d, 7, "angenommen", "Tobi").ok);
  assert.equal(d.vorgaenge.find((x) => x.id === 7)!.aufgaben.length, 5);
  const kz = pipelineKennzahlen(d);
  assert.equal(kz.quote, 1);
  assert.ok(Math.abs(kz.zeitBisAngebotStd! - 1 / 6) < 0.01);
});

test("Anfrage aus E-Mail: Kontakt erkennen, Positionen zuordnen, Vorgang anlegen", async () => {
  const { anfragePlanen, anfrageAnlegen, emlText } = await import("../web/lib/anfrage.ts");
  const { normalisieren } = await import("../web/lib/modell.ts");
  const d = normalisieren(structuredClone(basis));
  const p = d.produkte.find((x) => x.sku === "HBR 11-110 R")!;
  p.preise.push({ id: 1, preisart: "vk", betrag: 49.9, einheit: "m2", gueltig_ab: "2026-01-01", quelle: "manuell", erfasst_von: "x", erfasst_am: T0 });
  const roh = {
    kunde: { anrede: "Frau", vorname: "Anna", nachname: "Meier", firma: "", email: "anna.meier@web.de", telefon: "0172 1234567", strasse: "Hauptstr. 1", plz: "46414", ort: "Rhede", land: "" },
    lieferung: { strasse: "", plz: "", ort: "", zeitraum: "KW 14", abholung: false },
    positionen: [{ artikel: "HBR 11 - 110", bezeichnung: "Riemchen", art: "riemchen", format: "wf", flaeche_m2: 80, menge_stk: null, eckriemchen: true },
      { artikel: "", bezeichnung: "Fugenmörtel grau", art: "unbekannt", flaeche_m2: null, menge_stk: null, eckriemchen: null }],
    bauvorhaben: "Neubau EFH", nachricht: "Bitte Angebot", unsicher: "",
  } as any;
  const plan = anfragePlanen(d, roh);
  assert.equal(plan.kontakt.vorhanden, null);
  assert.equal(plan.positionen[0].sku, "HBR 11-110 R");
  assert.equal(plan.positionen[0].ep_netto_m2, 49.9);
  assert.equal(plan.positionen[0].format, "WF");          // Format aus der Anfrage
  assert.equal(plan.positionen[0].bedarf_stk_m2, 73);     // WF 210×50 bei Fugen 10/12 mm
  assert.equal(plan.positionen[1].gefunden, false);
  const ohne = anfragePlanen(d, { ...roh, positionen: [{ ...roh.positionen[0], format: "" }] });
  assert.ok(ohne.hinweise.some((h) => h.includes("Format bitte wählen")));
  assert.equal(plan.fracht!.betrag, 0);
  assert.equal(plan.lieferung.ort, "Rhede");
  const id = anfrageAnlegen(d, plan, roh, "wunschliste", "Text", "Assistenz");
  const v = d.vorgaenge.find((x) => x.id === id)!;
  assert.equal(v.status, "in_bearbeitung");
  assert.equal(v.wunschtermin, "KW 14");
  assert.ok(v.notiz.includes("bitte prüfen"));
  // zweite Anfrage derselben Person → Kontakt wird erkannt, nicht doppelt angelegt
  const anzahl = d.kontakte.length;
  const plan2 = anfragePlanen(d, { ...roh, kunde: { ...roh.kunde, email: "ANNA.MEIER@web.de" } });
  assert.ok(plan2.kontakt.vorhanden);
  anfrageAnlegen(d, plan2, roh, "email", "", "Assistenz");
  assert.equal(d.kontakte.length, anzahl);
  assert.match(emlText("From: Anna <a@b.de>\nSubject: Anfrage\nContent-Transfer-Encoding: quoted-printable\n\nGr=C3=BC=C3=9Fe aus Rhede"), /Grüße aus Rhede/);
});

test("Preisregeln: Staffel, Mindermenge, Handrabatt bleibt, Vier-Augen", async () => {
  const { staffelRabatt, regelnAnwenden, vierAugenNoetig } = await import("../web/lib/preisregeln.ts");
  const { statusWechsel, freigeben } = await import("../web/lib/anfrage.ts");
  const { normalisieren, PRUEFSCHRITTE } = await import("../web/lib/modell.ts");
  const { positionAusProdukt } = await import("../web/lib/angebot.ts");
  const d = normalisieren(structuredClone(basis));
  assert.equal(staffelRabatt(d, 99), 0); assert.equal(staffelRabatt(d, 100), 2); assert.equal(staffelRabatt(d, 300), 4);
  const p = d.produkte[0];
  const klein = regelnAnwenden({ positionen: [positionAusProdukt(p, d, 10)], mindermenge_netto: 0, mindermenge_manuell: false }, d);
  assert.equal(klein.mindermenge_netto, 45);
  const gross = regelnAnwenden({ positionen: [{ ...positionAusProdukt(p, d, 120) }, { ...positionAusProdukt(p, d, 120), rabatt_proz: 7, rabatt_manuell: true }], mindermenge_netto: 0, mindermenge_manuell: false }, d);
  assert.equal(gross.positionen[0].rabatt_proz, 2); assert.equal(gross.positionen[1].rabatt_proz, 7); assert.equal(gross.mindermenge_netto, 0);
  // Vier-Augen ab 5.000 € netto
  d.vorgaenge.push({ id: 8, version: 1, erstellt_am: T0, geaendert_am: T0, geaendert_von: "Tobi", nummer: "AN-2026-TO-002", kontakt_id: null, status: "neu", datum: "2026-11-02",
    quelle: "email", lieferort_plz: "46414", lieferort_ort: "Rhede", wunschtermin: "", betreff: "", positionen: [{ ...positionAusProdukt(p, d, 200, p.formate[0]), ep_netto_m2: 50 }], fracht_netto: 0, notiz: "", angebot_am: null } as any);
  normalisieren(d);
  const v = () => d.vorgaenge.find((x) => x.id === 8)!;
  assert.ok(vierAugenNoetig(v(), d));
  assert.ok(statusWechsel(d, 8, "angebot_erstellt", "Tobi").ok);
  v().pruefung = Object.fromEntries(PRUEFSCHRITTE.map(([k]) => [k, { von: "Tobi", zeit: T0 }]));
  assert.match(statusWechsel(d, 8, "gesendet", "Tobi").fehler!, /Vier-Augen/);
  assert.equal(freigeben(d, 8, "Tobi").ok, false); // Ersteller darf nicht
  assert.ok(freigeben(d, 8, "Klaus").ok);
  assert.ok(statusWechsel(d, 8, "gesendet", "Tobi").ok);
});

test("E-Mail-Vorlagen: Platzhalter, passende Vorlage, eigene Anpassung", async () => {
  const { alleVorlagen, vorlageFuellen, passendeVorlage } = await import("../web/lib/vorlagen.ts");
  const { normalisieren, kontaktLeer } = await import("../web/lib/modell.ts");
  const { positionAusProdukt } = await import("../web/lib/angebot.ts");
  const d = normalisieren(structuredClone(basis));
  const k = { ...kontaktLeer(1, "kunde", "", T0, "x"), anrede: "Frau", vorname: "Anna", nachname: "Meier", email: "a@web.de" };
  const v = normalisieren({ ...d, vorgaenge: [{ id: 9, version: 1, erstellt_am: T0, geaendert_am: T0, geaendert_von: "Tobi", nummer: "AN-2026-TO-003", kontakt_id: 1, status: "angebot_erstellt", datum: "2026-11-02",
    quelle: "email", lieferort_plz: "46348", lieferort_ort: "Raesfeld", wunschtermin: "KW 14", betreff: "Neubau EFH", positionen: [{ ...positionAusProdukt(d.produkte[0], d, 80), ep_netto_m2: 50 }], fracht_netto: 95, notiz: "", angebot_am: T0 } as any] }).vorgaenge[0];
  assert.equal(passendeVorlage(v, k), "angebot");
  const vl = alleVorlagen(d).find((x) => x.id === "angebot")!;
  const m = vorlageFuellen(vl, d, v, k, "Tobi");
  assert.equal(m.betreff, "Ihr Angebot AN-2026-TO-003 – Neubau EFH");
  assert.ok(m.text.startsWith("Sehr geehrte Frau Meier,"));
  assert.ok(m.text.includes("Fracht: 95,00"));
  assert.ok(!/\{[a-z_]+\}/.test(m.text));
  d.einstellungen.vorlagen = [{ ...vl, betreff: "Angebot {nummer}" }];
  assert.equal(vorlageFuellen(alleVorlagen(d).find((x) => x.id === "angebot")!, d, v, k, "Tobi").betreff, "Angebot AN-2026-TO-003");
  assert.equal(passendeVorlage({ ...v, status: "neu" }, { ...k, plz: "", ort: "" }), "fehlende_angaben");
});

test("Formate: Preise und Texte je Format in der Prüfung", async () => {
  const { pruefeProdukt } = await import("../web/lib/pruefung.ts");
  const { formatTextSetzen, textAehnlichkeit } = await import("../web/lib/formate.ts");
  const d = structuredClone(basis);
  const p = d.produkte.find((x) => x.formate.includes("NF") && x.formate.includes("DF") && x.formate.length === 2)!;
  const vk = (betrag: number, format?: string) => ({ id: Math.random(), preisart: "vk" as const, betrag, einheit: "m2" as const, gueltig_ab: "2026-01-01", quelle: "manuell" as const, erfasst_von: "t", erfasst_am: T0, ...(format ? { format } : {}) });
  p.preise = [vk(92, "DF")];
  const regel = (k: string) => pruefeProdukt(p, d).find((x) => x.regel === k);
  assert.ok(regel("vk"));                                   // kein allgemeiner Preis
  p.preise.push(vk(80));
  assert.equal(regel("vk"), undefined);                     // NF nutzt den allgemeinen Preis
  p.preise = [vk(92, "DF")]; p.preise.push(vk(85, "NF"));
  assert.equal(aktuellerPreis(p, "vk")!.betrag, 92);        // ohne allgemeinen Preis zählt der jüngste Formatpreis
  assert.ok(regel("textformat")!.text.includes("NF, DF") || regel("textformat")!.text.includes("DF, NF"));
  const text = "Der Klinker im Normalformat überzeugt durch sein klassisches Maß von 240 mal 115 mal 71 Millimetern und ein ruhiges Fugenbild an der Fassade.";
  p.format_texte = formatTextSetzen(p, "NF", { beschreibung: text });
  p.format_texte = formatTextSetzen(p, "DF", { beschreibung: text.replace("ruhiges", "sehr ruhiges") });
  assert.ok(textAehnlichkeit(text, text.replace("ruhiges", "sehr ruhiges")) >= 0.6);
  assert.ok(regel("textdoppelt")!.text.includes("NF/DF") || regel("textdoppelt")!.text.includes("DF/NF"));
  p.format_texte = formatTextSetzen(p, "DF", { beschreibung: "Flach und gestreckt: Das Dünnformat mit 52 Millimetern Höhe betont die Waagerechte, 63 Steine reichen für einen Quadratmeter Wandfläche." });
  assert.equal(regel("textdoppelt"), undefined);
  assert.equal(regel("textformat"), undefined);
  // Leere Texte werden entfernt
  assert.equal(formatTextSetzen(p, "NF", { beschreibung: "" }).length, 1);
});

test("Formate: Format-CSV mit Preisen und Texten je Produkt", async () => {
  const { formateCsv, formatImportPlanen, formatImportAusfuehren } = await import("../web/lib/formatcsv.ts");
  const { formatText } = await import("../web/lib/formate.ts");
  const d = structuredClone(basis);
  const v = d.produkte.find((x) => x.art === "verblender" && x.formate.length === 2 && x.formate.includes("NF") && d.produkte.some((r) => r.art === "riemchen" && r.stein_id === x.stein_id && r.formate.includes("NF")))!;
  const r = d.produkte.find((x) => x.art === "riemchen" && x.stein_id === v.stein_id)!;
  const s = d.steine.find((x) => x.id === v.stein_id)!;
  v.preise = [{ id: 1, preisart: "vk", betrag: 80, einheit: "m2", gueltig_ab: "2026-01-01", quelle: "manuell", erfasst_von: "t", erfasst_am: T0 }];
  // Rück-Import ohne Änderung, allgemeiner Preis wird nicht als Formatpreis exportiert
  const csv = formateCsv(d);
  assert.equal(formatImportPlanen(d, csv).zeilen.filter((z) => z.aktion !== "gleich").length, 0);
  assert.ok(!csv.split("\n").find((z) => z.startsWith(`${s.hbr_code};NF`))!.includes(";80;"));
  const plan = formatImportPlanen(d, [
    "hbr_code;format;vk_verblender_m2;vk_riemchen_m2;beschreibung_verblender;kurztext_riemchen;preis_gueltig_ab",
    `${s.hbr_code};NF;85,50;61;Eigener Text NF;Kurz NF R;01.12.2026`,
    `${s.hbr_code};XLDF;99;;;;`,
  ].join("\n"));
  assert.equal(plan.zeilen[0].aktion, "aendern", JSON.stringify(plan.zeilen[0].fehler));
  assert.equal(plan.zeilen[0].aenderungen.length, 4);
  assert.equal(plan.zeilen[1].aktion, "fehler");          // Stein hat kein XLDF-Produkt
  assert.equal(formatImportAusfuehren(d, plan, "Tobi"), 1);
  const v2 = d.produkte.find((x) => x.id === v.id)!, r2 = d.produkte.find((x) => x.id === r.id)!;
  assert.equal(aktuellerPreis(v2, "vk", "m2", "2026-12-01", "NF")!.betrag, 85.5);
  assert.equal(aktuellerPreis(v2, "vk", "m2", "2026-12-01", v2.formate.find((f) => f !== "NF"))!.betrag, 80); // anderes Format: allgemein
  assert.equal(aktuellerPreis(v2, "vk", "m2", "2026-11-30", "NF")!.betrag, 80);  // vor dem Gültigkeitsdatum
  assert.equal(formatText(v2, "NF").beschreibung, "Eigener Text NF");
  assert.equal(formatText(r2, "NF").kurztext, "Kurz NF R");
  // Paket enthält Texte je Format
  const e = wooPaket(d, [{ p: v2, grund: "geaendert" }], "Tobi").eintraege[0] as any;
  assert.equal(e.varianten.find((x: any) => x.format === "NF").beschreibung, "Eigener Text NF");
  assert.equal(e.varianten.find((x: any) => x.format !== "NF").beschreibung, null);
  assert.ok(!JSON.stringify(e).includes("85.5")); // Preise gehen nie in den Shop
});

test("KI: Texte je Format werden auf bekannte Formate begrenzt", async () => {
  const { kiFormatTexte, FORMAT_TEXT_SCHEMA } = await import("../web/lib/ki.ts");
  assert.equal((FORMAT_TEXT_SCHEMA as any).additionalProperties, false);
  const alt = globalThis.fetch;
  let gesendet: any = null;
  globalThis.fetch = (async (_u: string, o: any) => { gesendet = JSON.parse(o.body); return new Response(JSON.stringify({ stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 20 },
    content: [{ type: "text", text: JSON.stringify({ texte: [{ format: "NF", kurztext: " K ", beschreibung: "B NF" }, { format: "XYZ", kurztext: "x", beschreibung: "x" }] }) }] }), { status: 200 }); }) as any;
  try {
    const r = await kiFormatTexte("sk-test", "claude-sonnet-5-5", { produkt: { hbr: "HBR 10-100", art: "Verblender", herstellungsart: "Handform", farben: ["rot"], oberflaechen: [], hersteller: "", allgemeiner_text: "" },
      formate: [{ format: "NF", name: "Normalformat", masse: "240 × 115 × 71 mm", bedarf_stk_m2: 48, druckfestigkeit_nmm2: null, wasseraufnahme_proz: null, frostwiderstand: null, gewicht_kg: null }] });
    assert.deepEqual(r.texte, [{ format: "NF", kurztext: "K", beschreibung: "B NF" }]);
    assert.equal(gesendet.output_config.format.type, "json_schema");
    assert.ok(gesendet.system.includes("deutlich voneinander"));
  } finally { globalThis.fetch = alt; }
});
