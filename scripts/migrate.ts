// Spielt ausstehende Migrationen ein. Nutzt DATABASE_URL oder --pglite <ordner>.
import { migrieren, pgliteDb, postgresDb } from "../src/db.ts";

const i = process.argv.indexOf("--pglite");
const db = i > -1 ? await pgliteDb(process.argv[i + 1]) : await postgresDb();
try {
  const neu = await migrieren(db);
  console.log(neu.length ? `Eingespielt: ${neu.join(", ")}` : "Keine ausstehenden Migrationen.");
} finally {
  await db.schliessen();
}
