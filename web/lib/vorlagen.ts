// E-Mail-Vorlagen je Situation mit Platzhaltern. Ohne Browser-Abhängigkeiten.
import { summen, positionNetto, euro, zahl } from "./angebot.ts";
import type { Daten, Kontakt, Vorgang, Vorlage } from "./modell.ts";
import { datenqualitaet } from "./anfrage.ts";

const GRUSS = "Mit freundlichen Grüßen\n{bearbeiter}\n{firma}\n{firma_telefon}";

export const STANDARD_VORLAGEN: Vorlage[] = [
  { id: "eingang", situation: "Anfrage eingegangen", titel: "Eingangsbestätigung",
    betreff: "Ihre Anfrage bei {firma}",
    text: `{anrede},\n\nvielen Dank für Ihre Anfrage{betreff_satz}. Wir haben sie erhalten und erstellen Ihnen kurzfristig ein Angebot.\n\nSollten Sie Fragen haben, erreichen Sie uns unter {firma_telefon}.\n\n${GRUSS}` },
  { id: "fehlende_angaben", situation: "Anfrage eingegangen", titel: "Rückfrage fehlende Angaben",
    betreff: "Rückfrage zu Ihrer Anfrage",
    text: `{anrede},\n\nvielen Dank für Ihre Anfrage. Damit wir Ihnen ein genaues Angebot machen können, benötigen wir noch folgende Angaben:\n\n{fehlende_angaben}\n\nAm einfachsten antworten Sie direkt auf diese E-Mail.\n\n${GRUSS}` },
  { id: "angebot", situation: "Angebot versenden", titel: "Angebot",
    betreff: "Ihr Angebot {nummer}{betreff_strich}",
    text: `{anrede},\n\nvielen Dank für Ihre Anfrage. Gern bieten wir Ihnen an:\n\n{positionen}\n\nGesamt: {summe_netto} netto / {summe_brutto} brutto\nLieferung: {lieferadresse}{wunschtermin_satz}\n\nDas ausführliche Angebot finden Sie im Anhang. Es ist gültig bis {gueltig_bis}.\n\nFür Rückfragen oder eine Bemusterung sind wir gern für Sie da.\n\n${GRUSS}` },
  { id: "nachfassen", situation: "Angebot versendet", titel: "Nachfassen",
    betreff: "Ihr Angebot {nummer} – haben Sie noch Fragen?",
    text: `{anrede},\n\nvor einigen Tagen haben wir Ihnen unser Angebot {nummer} über {summe_brutto} geschickt. Konnten Sie schon einen Blick darauf werfen?\n\nWenn Sie Fragen haben, ein Muster sehen möchten oder sich an Menge oder Termin etwas geändert hat, melden Sie sich gern – wir passen das Angebot an.\n\n${GRUSS}` },
  { id: "auftrag", situation: "Gewonnen", titel: "Auftragsbestätigung",
    betreff: "Auftragsbestätigung zu Angebot {nummer}",
    text: `{anrede},\n\nvielen Dank für Ihren Auftrag! Hiermit bestätigen wir:\n\n{positionen}\n\nGesamt: {summe_brutto} brutto\nLieferung: {lieferadresse}{wunschtermin_satz}\n\nDen genauen Liefertermin stimmen wir in Kürze mit Ihnen ab.\n\n${GRUSS}` },
  { id: "liefertermin", situation: "Gewonnen", titel: "Liefertermin",
    betreff: "Liefertermin für Ihre Bestellung {nummer}",
    text: `{anrede},\n\nIhre Lieferung ist für [Datum, Uhrzeit] an {lieferadresse} geplant. Die Ware kommt per LKW mit Kran bzw. Hubwagen; bitte sorgen Sie für eine befahrbare Zufahrt und eine ebene Abstellfläche.\n\nFalls der Termin nicht passt, geben Sie uns bitte kurz Bescheid.\n\n${GRUSS}` },
  { id: "bestellung_lieferant", situation: "Gewonnen", titel: "Bestellung beim Lieferanten",
    betreff: "Bestellung zu Auftrag {nummer}",
    text: `Guten Tag,\n\nbitte liefern Sie für unseren Auftrag {nummer}:\n\n{positionen_stueck}\n\nLieferadresse: {lieferadresse}\nWunschtermin: {wunschtermin}\n\nBitte bestätigen Sie Liefertermin und Verfügbarkeit.\n\n${GRUSS}` },
  { id: "verloren", situation: "Verloren", titel: "Rückfrage nach Absage",
    betreff: "Kurze Rückfrage zu unserem Angebot {nummer}",
    text: `{anrede},\n\nschade, dass es diesmal nicht geklappt hat. Damit wir besser werden: Dürfen wir fragen, woran es lag – Preis, Lieferzeit oder das Produkt?\n\nFalls sich bei Ihrem Projekt noch etwas ändert, sind wir gern wieder für Sie da.\n\n${GRUSS}` },
];

/** Vorlagen aus den Einstellungen; Standardvorlagen, die (noch) nicht angepasst wurden, werden ergänzt. */
export function alleVorlagen(d: Pick<Daten, "einstellungen">): Vorlage[] {
  const eigene = d.einstellungen.vorlagen ?? [];
  return [...STANDARD_VORLAGEN.map((s) => eigene.find((e) => e.id === s.id) ?? s), ...eigene.filter((e) => !STANDARD_VORLAGEN.some((s) => s.id === e.id))];
}

/** Welche Vorlage passt zum Stand des Vorgangs? */
export function passendeVorlage(v: Vorgang, k: Kontakt | undefined): string {
  if (v.status === "neu" || v.status === "in_bearbeitung") return k && datenqualitaet(k).fehlt.length ? "fehlende_angaben" : "eingang";
  if (v.status === "angebot_erstellt") return "angebot";
  if (v.status === "gesendet") return "nachfassen";
  if (v.status === "angenommen") return "auftrag";
  if (v.status === "abgelehnt") return "verloren";
  return "angebot";
}

export const PLATZHALTER: [string, string][] = [
  ["{anrede}", "Sehr geehrte Frau Meier / Sehr geehrter Herr … / Guten Tag"], ["{vorname}", "Vorname"], ["{nachname}", "Nachname"], ["{kunde}", "Name · Firma"],
  ["{nummer}", "Angebotsnummer"], ["{betreff}", "Betreff/Bauvorhaben"], ["{positionen}", "Artikel mit m² und Preis"], ["{positionen_stueck}", "Artikel mit m² und Stück (für Lieferanten)"],
  ["{summe_netto}", "Summe netto"], ["{summe_brutto}", "Summe brutto"], ["{gueltig_bis}", "Gültigkeit"], ["{lieferadresse}", "Lieferadresse"], ["{wunschtermin}", "Wunschtermin"],
  ["{fehlende_angaben}", "Liste der fehlenden Kundendaten"], ["{bearbeiter}", "Ihr Name"], ["{firma}", "Firmenname"], ["{firma_telefon}", "Telefon"], ["{firma_email}", "E-Mail"], ["{datum}", "heutiges Datum"],
];

const FEHLT_TEXT: Record<string, string> = {
  "Name oder Firma": "- Ihr vollständiger Name",
  "E-Mail oder Telefon": "- eine Telefonnummer für Rückfragen zur Lieferung",
  "PLZ und Ort": "- Postleitzahl und Ort der Baustelle",
  "Straße (für Lieferung)": "- die Lieferadresse (Straße und Hausnummer)",
};

export function vorlageFuellen(vl: Vorlage, d: Daten, v: Vorgang, k: Kontakt | undefined, bearbeiter: string, jetzt = new Date()): { betreff: string; text: string } {
  const mw = d.einstellungen.angebot.mwst_proz, s = summen(v, mw), f = d.einstellungen.firma;
  const anrede = k?.nachname ? `${k.anrede === "Frau" ? "Sehr geehrte Frau" : k.anrede === "Herr" ? "Sehr geehrter Herr" : `Guten Tag${k.vorname ? " " + k.vorname : ""}`} ${k.nachname}` : "Sehr geehrte Damen und Herren";
  const lieferadresse = [v.lieferort_strasse, [v.lieferort_plz, v.lieferort_ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "nach Absprache";
  const gueltig = new Date(Date.parse(v.angebot_am ?? v.datum) + d.einstellungen.angebot.gueltig_tage * 86400000).toLocaleDateString("de-DE");
  const q = k ? datenqualitaet(k) : null;
  const fehlend = [...(q?.fehlt ?? []).map((x) => FEHLT_TEXT[x] ?? `- ${x}`), ...v.positionen.filter((p) => !p.flaeche_m2).map((p) => `- die benötigte Fläche in m² für ${p.sku || p.bezeichnung}`)];
  const werte: Record<string, string> = {
    anrede, vorname: k?.vorname ?? "", nachname: k?.nachname ?? "",
    kunde: [[k?.vorname, k?.nachname].filter(Boolean).join(" "), k?.firma].filter(Boolean).join(" · "),
    nummer: v.nummer, betreff: v.betreff, betreff_satz: v.betreff ? ` (${v.betreff})` : "", betreff_strich: v.betreff ? ` – ${v.betreff}` : "",
    positionen: v.positionen.map((p) => `- ${p.sku ? p.sku + " " : ""}${p.bezeichnung.replace(/^.*? – (HBR [^–]+) – /, "")}: ${zahl(p.menge_m2)} m² × ${euro(p.ep_netto_m2)}${p.rabatt_proz ? ` − ${zahl(p.rabatt_proz)} %` : ""} = ${euro(positionNetto(p))}`).join("\n")
      + (v.fracht_netto ? `\n- Fracht: ${euro(v.fracht_netto)}` : "") + (v.mindermenge_netto ? `\n- Mindermengenzuschlag: ${euro(v.mindermenge_netto)}` : ""),
    positionen_stueck: v.positionen.map((p) => `- ${p.sku || p.bezeichnung}: ${zahl(p.menge_m2)} m²${p.menge_stk ? ` = ca. ${zahl(p.menge_stk, 0)} Stück` : ""}`).join("\n"),
    summe_netto: euro(s.netto), summe_brutto: euro(s.brutto), gueltig_bis: gueltig, lieferadresse,
    wunschtermin: v.wunschtermin || "nach Absprache", wunschtermin_satz: v.wunschtermin ? `, Wunschtermin ${v.wunschtermin}` : "",
    fehlende_angaben: fehlend.length ? fehlend.join("\n") : "- [bitte ergänzen]",
    bearbeiter, firma: f.name, firma_telefon: f.telefon ? `Tel. ${f.telefon}` : "", firma_email: f.email, datum: jetzt.toLocaleDateString("de-DE"),
  };
  const ersetze = (t: string) => t.replace(/\{([a-z_]+)\}/g, (m, key) => (key in werte ? werte[key] : m)).replace(/\n{3,}/g, "\n\n").trim();
  return { betreff: ersetze(vl.betreff), text: ersetze(vl.text) };
}
