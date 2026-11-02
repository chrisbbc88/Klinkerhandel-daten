// Abgleichbericht aus der Datenbank: Zusammenfassung (Markdown) und Arbeitsliste (CSV für Excel).
import type { Abfrage } from "../db.ts";

const REGEL_TEXT: Record<string, string> = {
  hersteller_fehlt: "Hersteller fehlt",
  hersteller_mehrere: "Mehrere Hersteller",
  hersteller_aus_praefix: "Hersteller aus Code-Präfix abgeleitet",
  herstellungsart_fehlt: "Herstellungsart fehlt",
  herstellungsart_mehrere: "Herstellungsart widersprüchlich",
  herstellungsart_aus_name: "Herstellungsart aus Produktname",
  farbe_fehlt: "Farbe fehlt",
  format_fehlt: "Format fehlt",
  code_doppelt: "HBR-Code doppelt vergeben",
  code_schreibweise: "HBR-Code im Namen falsch geschrieben",
  kategorie_falsch: "Riemchen in Kategorie Verblender (oder umgekehrt)",
  keine_kategorie: "Eintrag ohne Kategorie",
  kurztext_farbe: "Kurztext und Farbkategorien widersprechen sich",
  kurztext_format: "Kurztext und Formatkategorien widersprechen sich",
  farben_verblender_riemchen: "Verblender und Riemchen mit unterschiedlichen Farben",
  bild_fehlt: "Kein Bild",
  bild_doppelt: "Bild doppelt in der Galerie",
  bilder_wenige: "Weniger als 3 Bilder",
  alt_fehlt: "Bilddatei ohne Alt-Text",
  beschreibung_fehlt: "Keine Produktbeschreibung",
  referenz_ohne_code: "Referenz ohne HBR-Code",
  referenz_ohne_stein: "Referenz zu Stein, den es nicht eindeutig gibt",
  referenz_ohne_link: "Referenz ohne Link zum Produkt",
  referenz_link_alt: "Referenz verlinkt alte Produktadresse",
  referenz_ohne_rubrik: "Referenz ohne Unterkategorie",
  referenz_ohne_text: "Referenz ohne Objekttext",
};
export const regelText = (r: string) => REGEL_TEXT[r] ?? r;

/** Verhindert, dass Excel Zellinhalte als Formel ausführt (=, +, -, @, Tab, CR am Anfang). */
export function csvZelle(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function befundCsv(db: Abfrage, importLaufId: number): Promise<string> {
  const rows = await db.query(
    `SELECT b.schwere, b.regel, b.objekt, b.hbr_code, b.woo_id, COALESCE(p.name, r.name, '') AS name, b.text
       FROM befund b
       LEFT JOIN produkt p ON b.objekt = 'produkt' AND p.woo_id = b.woo_id
       LEFT JOIN referenz r ON b.objekt = 'referenz' AND r.woo_id = b.woo_id
      WHERE b.import_lauf_id = $1
      ORDER BY CASE b.schwere WHEN 'pflicht' THEN 0 WHEN 'empfohlen' THEN 1 ELSE 2 END, b.regel, b.hbr_code NULLS LAST, b.woo_id`,
    [importLaufId]);
  const kopf = ["Schwere", "Prüfpunkt", "Objekt", "HBR-Code", "Shop-ID", "Name im Shop", "Hinweis", "Erledigt"];
  const zeilen = rows.map((r) =>
    [r.schwere, regelText(r.regel), r.objekt, r.hbr_code, r.woo_id, r.name, r.text, ""].map(csvZelle).join(";"));
  return "﻿" + [kopf.join(";"), ...zeilen].join("\r\n") + "\r\n";
}

export async function zusammenfassung(db: Abfrage, importLaufId: number): Promise<string> {
  const lauf = (await db.query("SELECT * FROM import_lauf WHERE id = $1", [importLaufId]))[0];
  const n = async (sql: string, p: unknown[] = []) => Number((await db.query(sql, p))[0].n);
  const zahlen = {
    steine: await n("SELECT count(*) n FROM stein"),
    verblender: await n("SELECT count(*) n FROM produkt WHERE art='verblender'"),
    riemchen: await n("SELECT count(*) n FROM produkt WHERE art='riemchen'"),
    nist: await n("SELECT count(*) n FROM produkt WHERE art='nistklinker'"),
    ohneSku: await n("SELECT count(*) n FROM produkt WHERE sku IS NULL"),
    referenzen: await n("SELECT count(*) n FROM referenz"),
    bilder: await n("SELECT count(*) n FROM bild"),
    bildVerwendungen: await n("SELECT (SELECT count(*) FROM produkt_bild) + (SELECT count(*) FROM referenz_bild) n"),
    paare: await n("SELECT count(*) n FROM stein s WHERE (SELECT count(*) FROM produkt p WHERE p.stein_id = s.id) = 2"),
    steinOhneHersteller: await n("SELECT count(*) n FROM stein WHERE hersteller_id IS NULL"),
  };
  const regeln = await db.query(
    `SELECT schwere, regel, count(*) n FROM befund WHERE import_lauf_id = $1 GROUP BY 1,2
      ORDER BY CASE schwere WHEN 'pflicht' THEN 0 WHEN 'empfohlen' THEN 1 ELSE 2 END, n DESC`, [importLaufId]);
  const praefixe = await db.query(
    `SELECT substr(hbr_code, 5, 2) praefix, count(*) n FROM stein WHERE hersteller_id IS NULL GROUP BY 1 ORDER BY 1`);
  const zuordnung = await db.query("SELECT hbr_praefix, name FROM hersteller WHERE hbr_praefix IS NOT NULL ORDER BY 1");
  const doppelt = await db.query(
    `SELECT hbr_code, string_agg(woo_id::text, ', ' ORDER BY woo_id) ids, min(text) text FROM befund
      WHERE import_lauf_id = $1 AND regel = 'code_doppelt' GROUP BY hbr_code ORDER BY 1`, [importLaufId]);

  const L: string[] = [];
  L.push(`# Abgleichbericht Erstübernahme`, "",
    `Quelle: ${lauf.quelle}  `, `Stand der Shop-Daten: ${lauf.stand ? new Date(lauf.stand).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "unbekannt"}  `,
    `Import-Lauf: ${importLaufId}`, "",
    "## Übernommen", "",
    "| | Anzahl |", "|---|---:|",
    `| Steine (eindeutige HBR-Codes) | ${zahlen.steine} |`,
    `| davon mit Verblender **und** Riemchen | ${zahlen.paare} |`,
    `| Verblender | ${zahlen.verblender} |`,
    `| Riemchen | ${zahlen.riemchen} |`,
    `| Nistklinker | ${zahlen.nist} |`,
    `| Produkte ohne Artikelnummer (Code doppelt, erst klären) | ${zahlen.ohneSku} |`,
    `| Referenzen | ${zahlen.referenzen} |`,
    `| Bilddateien (eindeutig) | ${zahlen.bilder} |`,
    `| Bildverwendungen (Produkte + Referenzen) | ${zahlen.bildVerwendungen} |`, "",
    "## Prüfpunkte", "",
    "| Schwere | Prüfpunkt | Anzahl |", "|---|---|---:|",
    ...regeln.map((r) => `| ${r.schwere} | ${regelText(r.regel)} | ${r.n} |`), "",
    "## Hersteller über den Code", "",
    "Jedes HBR-Präfix gehört im Shop zu genau einem Hersteller:", "",
    zuordnung.map((r) => `${r.hbr_praefix} = ${r.name}`).join(" · "), "",
    `Ohne Hersteller sind ${zahlen.steinOhneHersteller} Steine, alle mit einem Präfix, das im Shop keinem Hersteller zugeordnet ist:`, "",
    "| Präfix | Steine ohne Hersteller |", "|---|---:|",
    ...praefixe.map((r) => `| ${r.praefix} | ${r.n} |`), "",
    "Sobald der Hersteller je Präfix bekannt ist, lassen sich diese Steine in einem Schritt zuordnen.", "",
    "## Doppelte Codes", "",
    "Diese Einträge wurden ohne Artikelnummer und ohne Stein übernommen. Nichts wurde zusammengeführt oder gelöscht.", "",
    ...doppelt.map((r) => `- **${r.text.split(" gibt es")[0]}**: Shop-IDs ${r.ids}. ${r.text.split(". ").slice(1).join(". ")}`), "",
    "## Nicht übernommen (bewusst)", "",
    "- **Produkt- und Referenztexte:** Die Bestandsdatei enthält nur die ersten 300 Zeichen. Volltexte werden bei der Übernahme über die WooCommerce-Schnittstelle geholt.",
    "- **Schlagwörter, Anfrageformular und Preishinweis aus dem Kurztext:** nicht Teil des Zielmodells. Der alte Kurztext liegt zum Abgleich im Feld `kurztext_shop_alt`.",
    "- **Entwürfe und private Produkte:** Die öffentliche Schnittstelle zeigt sie nicht. Für die vollständige Übernahme ist ein API-Zugang nötig.",
    "");
  return L.join("\n");
}
