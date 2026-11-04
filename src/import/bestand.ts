// Übernahme des Shop-Bestands (Bestandsdatei aus der Store-API) in das ERP-Modell.
// Reine Abbildung ohne Datenbank: liefert einen Plan und eine Liste von Befunden.
// Grundsatz: Nichts wird stillschweigend korrigiert. Wo die Daten widersprüchlich sind,
// bleibt das Feld leer und es entsteht ein Befund zur Klärung.

export interface Bestand {
  stand?: string;
  kategorien: { id: number; name: string; parent: number }[];
  produkte: ShopProdukt[];
}
export interface ShopProdukt {
  id: number; name: string; slug: string; sku: string; kategorien: number[];
  bilder: { id: number; datei: string; breite: number; alt: string }[];
  kurztext: string; beschreibung_laenge: number; produktlinks: string[];
}

export type Art = "verblender" | "riemchen" | "nistklinker";
export type Herstellungsart = "handform" | "strangpress" | "wasserstrich";
export type Schwere = "pflicht" | "empfohlen" | "info";

export interface Befund {
  objekt: "produkt" | "referenz" | "stein" | "bild";
  woo_id: number | null; hbr_code: string | null;
  regel: string; schwere: Schwere; text: string;
}
export interface BildRef { woo_media_id: number; position: number }
export interface PlanBild { woo_media_id: number; datei: string; breite_px: number; alt: string | null }
export interface PlanStein {
  hbr_code: string; hersteller: string | null;
  hersteller_quelle: "shop" | "praefix" | null;
  herstellungsart: Herstellungsart | null; farben: string[];
}
export interface PlanProdukt {
  woo_id: number; woo_slug: string; name: string; art: Art; sku: string | null;
  stein: string | null; hersteller: string | null; formate: string[];
  kurztext_shop_alt: string; bilder: BildRef[];
}
export interface PlanReferenz {
  woo_id: number; woo_slug: string; name: string; objektart: string | null;
  rubriken: string[]; hbr_code_shop: string | null; stein: string | null; bilder: BildRef[];
}
export interface Plan {
  stand: string | null;
  hersteller: { name: string; woo_kategorie_id: number; hbr_praefix: string | null }[];
  farben: { schluessel: string; woo_kategorie_id: number | null }[];
  formate: { kuerzel: string; name: string; mm: [number, number, number] | null; woo_kategorie_id: number | null }[];
  bilder: PlanBild[];
  steine: PlanStein[];
  produkte: PlanProdukt[];
  referenzen: PlanReferenz[];
  befunde: Befund[];
  uebersprungen: { woo_id: number; name: string; grund: string }[];
}

// Stammdaten, die nicht aus dem Shop kommen (Normmaße nach DIN in mm).
/** Normmaße: siehe web/lib/formate.ts (FORMAT_NORM). LDF/XLDF: übliche Maße, herstellerabhängig. */
export const FORMATE: { kuerzel: string; name: string; mm: [number, number, number] | null }[] = [
  { kuerzel: "WF", name: "Waalformat", mm: [210, 100, 50] },
  { kuerzel: "WDF", name: "Waaldickformat", mm: [210, 100, 65] },
  { kuerzel: "NF", name: "Normalformat", mm: [240, 115, 71] },
  { kuerzel: "DF", name: "Dünnformat", mm: [240, 115, 52] },
  { kuerzel: "2DF", name: "Doppeltes Dünnformat", mm: [240, 115, 113] },
  { kuerzel: "RF", name: "Reichsformat", mm: [250, 120, 65] },
  { kuerzel: "LDF", name: "Langes Dünnformat", mm: [290, 90, 52] },
  { kuerzel: "XLDF", name: "Extra langes Dünnformat", mm: [365, 115, 52] },
  { kuerzel: "ModF", name: "Modulformat", mm: null },
  { kuerzel: "Modul", name: "Modul", mm: null },
  { kuerzel: "LF", name: "Langformat", mm: null },
  { kuerzel: "BDF", name: "Bundesdünnformat", mm: null },
  { kuerzel: "BDF-XL", name: "Bundesdünnformat XL", mm: null },
  { kuerzel: "BS", name: "BS", mm: null },
];
const FORMAT_SYNONYM: Record<string, string> = {
  WF: "WF", WDF: "WDF", NF: "NF", DF: "DF", "2DF": "2DF", RF: "RF", LDF: "LDF", XLDF: "XLDF",
  MODF: "ModF", MODUL: "Modul", LF: "LF", BDF: "BDF", "BDF-XL": "BDF-XL", "BDF – XL": "BDF-XL", "BDF - XL": "BDF-XL", BS: "BS",
};
const FARB_SYNONYM: Record<string, string> = { rosa: "rose", "rosé": "rose" };

const LOOSE = /HBR\s*[–-]?\s*(\d{2})\s*[–-]?\s*(\d{3})/;
const STRICT_V = /\bHBR \d{2}-\d{3}(?! R\b)/;
const STRICT_R = /\bHBR \d{2}-\d{3} R\b/;
const REF_NAME = /^(Einfamilienhaus|Mehrfamilienhaus|Geschäftshaus|Landhaus|Doppelhaushälfte|Doppelhaus|Bungalow)\b/;

export function normFormat(t: string): string | null {
  const k = t.trim();
  return FORMAT_SYNONYM[k.toUpperCase()] ?? FORMAT_SYNONYM[k] ?? null;
}
export function normFarbe(t: string, bekannt: Set<string>): string | null {
  const k = t.trim().toLowerCase().replace(/,$/, "");
  const s = FARB_SYNONYM[k] ?? k;
  return bekannt.has(s) ? s : null;
}
/** Zerlegt den Kurztext "Format: NF, WDF Farbe: rot, braun …" in Rohlisten. */
export function kurztextLesen(kt: string): { formate: string[]; farben: string[] } | null {
  const m = kt.match(/Format:\s*(.*?)\s*Farbe:\s*(.*?)(?:\s*Hier geht|\s*Bitte beachten|\s*Dieser Artikel|$)/);
  if (!m) return null;
  const teile = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
  return { formate: teile(m[1]), farben: teile(m[2].replace(/\//g, ",")) };
}

export function planen(b: Bestand): Plan {
  const K = b.kategorien;
  const wurzel = (name: string) => K.find((c) => c.name === name && c.parent === 0)?.id;
  const kinder = (id: number | undefined) => K.filter((c) => id !== undefined && c.parent === id);
  const befunde: Befund[] = [];
  const bef = (x: Befund) => befunde.push(x);

  // --- Kategoriezuordnung -------------------------------------------------
  const farbeId = wurzel("Farbe"), formatId = wurzel("Format"), refId = wurzel("Referenzen");
  const nistId = wurzel("Naturschutz und Klinker"), verbId = wurzel("Verblender"), riemId = wurzel("Riemchen");
  const herstWurzel = K.find((c) => c.parent === 0 && kinder(c.id).some((x) => /Klinker|Baksteen|Hagemeister/.test(x.name)))?.id;

  const FARBE = new Map<number, string>(), FMT = new Map<number, string>(), HER = new Map<number, string>();
  const ART = new Map<number, Herstellungsart>(), RUBRIK = new Map<number, string>();
  for (const c of kinder(farbeId)) FARBE.set(c.id, c.name);
  for (const c of kinder(formatId)) {
    const m = c.name.match(/\(([^)]+)\)/);
    const f = normFormat(m ? m[1] : c.name);
    if (f) FMT.set(c.id, f);
  }
  for (const c of kinder(herstWurzel)) HER.set(c.id, c.name);
  for (const c of [...kinder(verbId), ...kinder(riemId)]) {
    const a = c.name.toLowerCase();
    if (a === "handform" || a === "strangpress" || a === "wasserstrich") ART.set(c.id, a);
  }
  for (const c of kinder(refId)) RUBRIK.set(c.id, c.name.replace(/^Referenzen\s*/, ""));
  const menge = (...ids: (number | undefined)[]) => new Set(ids.flatMap((i) => (i === undefined ? [] : [i, ...kinder(i).map((c) => c.id)])));
  const verbSet = menge(verbId), riemSet = menge(riemId), refSet = menge(refId), nistSet = menge(nistId);
  const bekannteFarben = new Set(FARBE.values());

  // --- Bilder (eindeutig je Mediendatei) -------------------------------------
  const bilder = new Map<number, PlanBild>();
  const bildRefs = (p: ShopProdukt, objekt: "produkt" | "referenz", code: string | null): BildRef[] => {
    const out: BildRef[] = [], gesehen = new Set<number>();
    for (const x of p.bilder) {
      if (gesehen.has(x.id)) continue;
      gesehen.add(x.id);
      const vorh = bilder.get(x.id);
      if (!vorh) bilder.set(x.id, { woo_media_id: x.id, datei: x.datei, breite_px: x.breite || 0, alt: x.alt?.trim() || null });
      else if (!vorh.alt && x.alt?.trim()) vorh.alt = x.alt.trim();
      out.push({ woo_media_id: x.id, position: out.length });
    }
    if (gesehen.size < p.bilder.length)
      bef({ objekt, woo_id: p.id, hbr_code: code, regel: "bild_doppelt", schwere: "empfohlen",
        text: `${p.bilder.length - gesehen.size} Bild(er) doppelt in der Galerie, nur einmal übernommen` });
    if (!out.length) bef({ objekt, woo_id: p.id, hbr_code: code, regel: "bild_fehlt", schwere: "pflicht", text: "Kein Bild" });
    return out;
  };

  // --- Einträge einordnen ----------------------------------------------------
  type Kandidat = { p: ShopProdukt; code: string; art: "verblender" | "riemchen" };
  const kandidaten: Kandidat[] = [];
  const referenzRoh: ShopProdukt[] = [];
  const nist: ShopProdukt[] = [];
  const uebersprungen: Plan["uebersprungen"] = [];

  for (const p of b.produkte) {
    const cs = p.kategorien;
    const hat = (s: Set<number>) => cs.some((c) => s.has(c));
    if (hat(refSet) || (!cs.length && REF_NAME.test(p.name))) {
      if (!cs.length) bef({ objekt: "referenz", woo_id: p.id, hbr_code: null, regel: "keine_kategorie", schwere: "pflicht",
        text: "Referenz ohne Kategorie im Shop" });
      referenzRoh.push(p);
      continue;
    }
    if (hat(nistSet)) { nist.push(p); continue; }
    const m = p.name.match(LOOSE);
    if (!m) { uebersprungen.push({ woo_id: p.id, name: p.name, grund: "Kein HBR-Code und keine bekannte Kategorie" }); continue; }
    const code = `HBR ${m[1]}-${m[2]}`;
    const istRiemchen = /^Riemchen/i.test(p.name) || /HBR\s*\d{2}\s*[–-]\s*\d{3}\s*R\b/.test(p.name);
    const art = istRiemchen ? "riemchen" : "verblender";
    const katArt = hat(riemSet) ? "riemchen" : hat(verbSet) ? "verblender" : null;
    if (katArt && katArt !== art)
      bef({ objekt: "produkt", woo_id: p.id, hbr_code: code, regel: "kategorie_falsch", schwere: "pflicht",
        text: `Laut Name ${art === "riemchen" ? "Riemchen" : "Verblender"}, im Shop aber in der Kategorie ${katArt === "riemchen" ? "Riemchen" : "Verblender"}` });
    if (!(art === "riemchen" ? STRICT_R : STRICT_V).test(p.name))
      bef({ objekt: "produkt", woo_id: p.id, hbr_code: code, regel: "code_schreibweise", schwere: "empfohlen",
        text: `Code im Namen nicht in der Form „${code}${art === "riemchen" ? " R" : ""}“` });
    kandidaten.push({ p, code, art });
  }

  // --- Doppelte Codes: nicht zusammenführen, sondern klären lassen ------------
  const gruppen = new Map<string, Kandidat[]>();
  for (const k of kandidaten) {
    const key = `${k.code}|${k.art}`;
    gruppen.set(key, [...(gruppen.get(key) ?? []), k]);
  }
  const konflikt = new Set<number>();
  for (const [, g] of gruppen) {
    if (g.length < 2) continue;
    const bilderVerschieden = new Set(g.map((k) => k.p.bilder[0]?.id ?? 0)).size > 1;
    for (const k of g) {
      konflikt.add(k.p.id);
      bef({ objekt: "produkt", woo_id: k.p.id, hbr_code: k.code, regel: "code_doppelt", schwere: "pflicht",
        text: `${k.code}${k.art === "riemchen" ? " R" : ""} gibt es ${g.length}× (Shop-IDs ${g.map((x) => x.p.id).join(", ")})` +
          (bilderVerschieden ? ". Die Bilder unterscheiden sich, vermutlich trägt ein Eintrag den falschen Code" : ". Gleiche Bilder, vermutlich echte Dublette") });
    }
  }

  // --- Hersteller je Präfix ableiten (nur wenn eindeutig) -----------------------
  const praefixHersteller = new Map<string, Set<string>>();
  for (const k of kandidaten) {
    for (const c of k.p.kategorien) {
      const h = HER.get(c);
      if (!h) continue;
      const pr = k.code.slice(4, 6);
      praefixHersteller.set(pr, (praefixHersteller.get(pr) ?? new Set()).add(h));
    }
  }
  const herstellerPraefix = new Map<string, string>(); // Hersteller → Präfix
  const praefixZu = new Map<string, string>();         // Präfix → Hersteller
  for (const [pr, hs] of praefixHersteller) {
    if (hs.size !== 1) continue;
    const h = [...hs][0];
    if (herstellerPraefix.has(h)) continue; // ein Hersteller mit zwei Präfixen: nicht automatisch zuordnen
    herstellerPraefix.set(h, pr);
    praefixZu.set(pr, h);
  }

  // --- Steine und Produkte ------------------------------------------------------
  const steinKand = new Map<string, Kandidat[]>();
  for (const k of kandidaten) if (!konflikt.has(k.p.id)) steinKand.set(k.code, [...(steinKand.get(k.code) ?? []), k]);

  const steine: PlanStein[] = [];
  for (const [code, ks] of [...steinKand].sort(([a], [b]) => a.localeCompare(b))) {
    const hs = new Set(ks.flatMap((k) => k.p.kategorien.map((c) => HER.get(c)).filter((x): x is string => !!x)));
    let hersteller: string | null = null, quelle: PlanStein["hersteller_quelle"] = null;
    if (hs.size === 1) { hersteller = [...hs][0]; quelle = "shop"; }
    else if (hs.size > 1) bef({ objekt: "stein", woo_id: null, hbr_code: code, regel: "hersteller_mehrere", schwere: "pflicht", text: `Mehrere Hersteller im Shop: ${[...hs].join(", ")}` });
    else if (praefixZu.has(code.slice(4, 6))) {
      hersteller = praefixZu.get(code.slice(4, 6))!; quelle = "praefix";
      bef({ objekt: "stein", woo_id: null, hbr_code: code, regel: "hersteller_aus_praefix", schwere: "info", text: `Hersteller ${hersteller} aus dem Code-Präfix abgeleitet, bitte bestätigen` });
    } else bef({ objekt: "stein", woo_id: null, hbr_code: code, regel: "hersteller_fehlt", schwere: "pflicht", text: `Kein Hersteller; Präfix ${code.slice(4, 6)} ist keinem Hersteller zugeordnet` });

    const arten = new Set(ks.flatMap((k) => k.p.kategorien.map((c) => ART.get(c)).filter((x): x is Herstellungsart => !!x)));
    let herstellungsart: Herstellungsart | null = null;
    if (arten.size === 1) herstellungsart = [...arten][0];
    else if (arten.size > 1) bef({ objekt: "stein", woo_id: null, hbr_code: code, regel: "herstellungsart_mehrere", schwere: "pflicht", text: `Widersprüchlich im Shop: ${[...arten].join(", ")}` });
    else {
      const ausName = new Set(ks.map((k) => k.p.name.match(/(Handform|Strangpress|Wasserstrich)/i)?.[1]?.toLowerCase()).filter(Boolean));
      if (ausName.size === 1) {
        herstellungsart = [...ausName][0] as Herstellungsart;
        bef({ objekt: "stein", woo_id: null, hbr_code: code, regel: "herstellungsart_aus_name", schwere: "info", text: `Herstellungsart ${herstellungsart} aus dem Produktnamen, im Shop ohne Kategorie` });
      } else bef({ objekt: "stein", woo_id: null, hbr_code: code, regel: "herstellungsart_fehlt", schwere: "pflicht", text: "Keine Herstellungsart" });
    }

    // Farben: Verblender hat Vorrang; Reihenfolge laut Kurztext (erste = Hauptfarbe)
    const farbenVon = (k: Kandidat) => k.p.kategorien.map((c) => FARBE.get(c)).filter((x): x is string => !!x);
    const v = ks.find((k) => k.art === "verblender"), r = ks.find((k) => k.art === "riemchen");
    const basis = v ?? r!;
    const katFarben = farbenVon(basis);
    if (v && r) {
      const a = new Set(farbenVon(v)), c = new Set(farbenVon(r));
      if (a.size !== c.size || [...a].some((x) => !c.has(x)))
        bef({ objekt: "stein", woo_id: null, hbr_code: code, regel: "farben_verblender_riemchen", schwere: "empfohlen",
          text: `Farben weichen ab. Verblender: ${[...a].join(", ") || "–"}; Riemchen: ${[...c].join(", ") || "–"}. Übernommen: Verblender` });
    }
    const kt = kurztextLesen(basis.p.kurztext);
    const ktOrder = kt ? kt.farben.map((f) => normFarbe(f, bekannteFarben)).filter((x): x is string => !!x) : [];
    const farben = [...new Set([...ktOrder.filter((f) => katFarben.includes(f)), ...katFarben])];
    if (!farben.length) bef({ objekt: "stein", woo_id: null, hbr_code: code, regel: "farbe_fehlt", schwere: "pflicht", text: "Keine Farbe" });
    steine.push({ hbr_code: code, hersteller, hersteller_quelle: quelle, herstellungsart, farben });
  }

  const produkte: PlanProdukt[] = [];
  const steinFarben = new Map(steine.map((s) => [s.hbr_code, s.farben]));
  for (const k of kandidaten) {
    const p = k.p, ok = !konflikt.has(p.id);
    const formate = [...new Set(p.kategorien.map((c) => FMT.get(c)).filter((x): x is string => !!x))];
    if (!formate.length) bef({ objekt: "produkt", woo_id: p.id, hbr_code: k.code, regel: "format_fehlt", schwere: "pflicht", text: "Kein Format" });
    // Abgleich Kurztext ↔ Kategorien
    const kt = kurztextLesen(p.kurztext);
    if (kt) {
      const unbekannt = kt.formate.filter((f) => !normFormat(f));
      const tf = new Set(kt.formate.map(normFormat).filter((x): x is string => !!x));
      const fehltKat = [...tf].filter((f) => !formate.includes(f)), fehltText = formate.filter((f) => !tf.has(f));
      if (fehltKat.length || fehltText.length || unbekannt.length)
        bef({ objekt: "produkt", woo_id: p.id, hbr_code: k.code, regel: "kurztext_format", schwere: "empfohlen",
          text: [fehltKat.length && `nur im Text: ${fehltKat.join(", ")}`, fehltText.length && `nur als Kategorie: ${fehltText.join(", ")}`,
            unbekannt.length && `unbekannt: ${unbekannt.join(", ")}`].filter(Boolean).join("; ") });
      const fs = ok ? steinFarben.get(k.code) ?? [] : p.kategorien.map((c) => FARBE.get(c)).filter((x): x is string => !!x);
      const tc = kt.farben.map((f) => ({ roh: f, n: normFarbe(f, bekannteFarben) }));
      const fehltKatC = [...new Set(tc.filter((x) => x.n && !fs.includes(x.n)).map((x) => x.n!))];
      const fehltTextC = fs.filter((f) => !tc.some((x) => x.n === f));
      const unbekC = tc.filter((x) => !x.n).map((x) => x.roh);
      if (fehltKatC.length || fehltTextC.length || unbekC.length)
        bef({ objekt: "produkt", woo_id: p.id, hbr_code: k.code, regel: "kurztext_farbe", schwere: "empfohlen",
          text: [fehltKatC.length && `nur im Text: ${fehltKatC.join(", ")}`, fehltTextC.length && `nur als Kategorie: ${fehltTextC.join(", ")}`,
            unbekC.length && `unbekannt: ${unbekC.join(", ")}`].filter(Boolean).join("; ") });
    }
    const refs = bildRefs(p, "produkt", k.code);
    if (refs.length > 0 && refs.length < 3)
      bef({ objekt: "produkt", woo_id: p.id, hbr_code: k.code, regel: "bilder_wenige", schwere: "empfohlen", text: `Nur ${refs.length} Bild(er)` });
    if (!p.beschreibung_laenge)
      bef({ objekt: "produkt", woo_id: p.id, hbr_code: k.code, regel: "beschreibung_fehlt", schwere: "empfohlen", text: "Keine Produktbeschreibung" });
    produkte.push({
      woo_id: p.id, woo_slug: p.slug, name: p.name, art: k.art,
      sku: ok ? (k.art === "riemchen" ? `${k.code} R` : k.code) : null,
      stein: ok ? k.code : null, hersteller: null, formate, kurztext_shop_alt: p.kurztext, bilder: refs,
    });
  }
  for (const p of nist) {
    const hs = [...new Set(p.kategorien.map((c) => HER.get(c)).filter((x): x is string => !!x))];
    const nk = p.name.match(/NK\s*(\d+)/);
    if (hs.length !== 1) bef({ objekt: "produkt", woo_id: p.id, hbr_code: null, regel: "hersteller_fehlt", schwere: "pflicht", text: "Nistklinker ohne eindeutigen Hersteller" });
    produkte.push({
      woo_id: p.id, woo_slug: p.slug, name: p.name, art: "nistklinker", sku: nk ? `NK ${nk[1]}` : null,
      stein: null, hersteller: hs.length === 1 ? hs[0] : null, formate: [], kurztext_shop_alt: p.kurztext,
      bilder: bildRefs(p, "produkt", null),
    });
  }

  // --- Referenzen -----------------------------------------------------------------
  const slugs = new Set(b.produkte.map((p) => p.slug));
  const steinCodes = new Set(steine.map((s) => s.hbr_code));
  const referenzen: PlanReferenz[] = referenzRoh.map((p) => {
    const m = p.name.match(LOOSE);
    const code = m ? `HBR ${m[1]}-${m[2]}` : null;
    if (!code) bef({ objekt: "referenz", woo_id: p.id, hbr_code: null, regel: "referenz_ohne_code", schwere: "pflicht", text: "Kein HBR-Code im Namen" });
    else if (!steinCodes.has(code)) bef({ objekt: "referenz", woo_id: p.id, hbr_code: code, regel: "referenz_ohne_stein", schwere: "pflicht",
      text: `Zu ${code} gibt es kein eindeutiges Produkt im Sortiment` });
    const tot = p.produktlinks.filter((l) => !slugs.has(l.replace(/\/$/, "").split("/").pop() ?? ""));
    if (!p.produktlinks.length) bef({ objekt: "referenz", woo_id: p.id, hbr_code: code, regel: "referenz_ohne_link", schwere: "empfohlen", text: "Kein Link zum Produkt" });
    else if (tot.length) bef({ objekt: "referenz", woo_id: p.id, hbr_code: code, regel: "referenz_link_alt", schwere: "empfohlen",
      text: `${tot.length} Link(s) auf alte Produktadresse, Weiterleitung prüfen: ${tot.join(" ")}` });
    const rubriken = p.kategorien.map((c) => RUBRIK.get(c)).filter((x): x is string => !!x);
    if (!rubriken.length && p.kategorien.length) bef({ objekt: "referenz", woo_id: p.id, hbr_code: code, regel: "referenz_ohne_rubrik", schwere: "empfohlen", text: "Keine Referenz-Unterkategorie" });
    if (!p.beschreibung_laenge) bef({ objekt: "referenz", woo_id: p.id, hbr_code: code, regel: "referenz_ohne_text", schwere: "empfohlen", text: "Kein Objekttext" });
    return {
      woo_id: p.id, woo_slug: p.slug, name: p.name, objektart: p.name.match(REF_NAME)?.[1] ?? null, rubriken,
      hbr_code_shop: code, stein: code && steinCodes.has(code) ? code : null, bilder: bildRefs(p, "referenz", code),
    };
  });

  // --- Bilder ohne Alt-Text (einmal je Datei) ----------------------------------------
  for (const x of bilder.values())
    if (!x.alt) befunde.push({ objekt: "bild", woo_id: x.woo_media_id, hbr_code: null, regel: "alt_fehlt", schwere: "empfohlen", text: `Kein Alt-Text: ${x.datei}` });

  const herstellerListe = [...HER].map(([id, name]) => ({ name, woo_kategorie_id: id, hbr_praefix: herstellerPraefix.get(name) ?? null }));
  const farbIds = new Map([...FARBE].map(([id, n]) => [n, id]));
  const fmtIds = new Map([...FMT].map(([id, k]) => [k, id]));
  return {
    stand: b.stand ?? null,
    hersteller: herstellerListe.sort((a, c) => a.name.localeCompare(c.name, "de")),
    farben: [...bekannteFarben].map((f) => ({ schluessel: f, woo_kategorie_id: farbIds.get(f) ?? null })),
    formate: FORMATE.map((f) => ({ ...f, woo_kategorie_id: fmtIds.get(f.kuerzel) ?? null })),
    bilder: [...bilder.values()],
    steine, produkte, referenzen, befunde, uebersprungen,
  };
}
