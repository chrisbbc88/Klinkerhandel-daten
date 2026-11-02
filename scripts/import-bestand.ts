// Übernimmt eine Bestandsdatei (Export „Bestand exportieren“ aus der Produktstation) ins ERP.
//
//   node scripts/import-bestand.ts <bestand.json> [--probelauf] [--nur-neue] [--pglite <ordner>] [--bericht <ordner>]
//
// --probelauf  schreibt nichts in die Datenbank, gibt nur die Befunde aus
// --nur-neue   übernimmt nur Shop-Einträge, die noch nicht im ERP sind (ERP-Daten werden nie überschrieben)
// Ohne --pglite wird DATABASE_URL verwendet.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { migrieren, pgliteDb, postgresDb } from "../src/db.ts";
import { planen, type Bestand } from "../src/import/bestand.ts";
import { planSchreiben } from "../src/import/schreiben.ts";
import { befundCsv, zusammenfassung, regelText } from "../src/import/bericht.ts";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : undefined; };
const datei = args.find((a, i) => !a.startsWith("--") && !["--pglite", "--bericht"].includes(args[i - 1]));
if (!datei) { console.error("Bestandsdatei fehlt."); process.exit(2); }

const bestand = JSON.parse(await readFile(datei, "utf8")) as Bestand;
if (!Array.isArray(bestand?.produkte) || !Array.isArray(bestand?.kategorien) || (bestand.produkte[0] && !("kategorien" in bestand.produkte[0])))
  throw new Error("Das ist keine Bestandsdatei aus dem Shop-Export.");
if (!bestand.produkte.length) throw new Error("Die Bestandsdatei enthält keine Produkte – Abbruch, damit nichts Leeres übernommen wird.");

const plan = planen(bestand);
console.log(`Plan: ${plan.steine.length} Steine, ${plan.produkte.length} Produkte, ${plan.referenzen.length} Referenzen, ${plan.bilder.length} Bilder, ${plan.befunde.length} Befunde`);
if (plan.uebersprungen.length) console.log("Nicht zuordenbar:", plan.uebersprungen);

if (args.includes("--probelauf")) {
  const z: Record<string, number> = {};
  for (const b of plan.befunde) z[`${b.schwere.padEnd(9)} ${regelText(b.regel)}`] = (z[`${b.schwere.padEnd(9)} ${regelText(b.regel)}`] ?? 0) + 1;
  for (const [k, v] of Object.entries(z).sort()) console.log(String(v).padStart(5), k);
  console.log("Probelauf: nichts geschrieben.");
  process.exit(0);
}

const pgOrdner = opt("--pglite");
const db = pgOrdner ? await pgliteDb(pgOrdner) : await postgresDb();
try {
  await migrieren(db);
  const e = await planSchreiben(db, plan, args.includes("--nur-neue") ? "nur_neue" : "erstuebernahme", basename(datei));
  console.log("Übernommen:", e);
  const ziel = opt("--bericht");
  if (ziel) {
    await mkdir(ziel, { recursive: true });
    await writeFile(join(ziel, `abgleich-lauf-${e.import_lauf_id}.md`), await zusammenfassung(db, e.import_lauf_id));
    await writeFile(join(ziel, `befunde-lauf-${e.import_lauf_id}.csv`), await befundCsv(db, e.import_lauf_id));
    console.log(`Bericht in ${ziel}`);
  }
} catch (e) {
  console.error("Abbruch:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await db.schliessen();
}
