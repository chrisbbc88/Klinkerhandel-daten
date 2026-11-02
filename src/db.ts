// Datenbankzugriff. Eine kleine Schnittstelle, damit Tests mit PGlite (Postgres im Prozess)
// und der Betrieb mit einem echten PostgreSQL-Server denselben Code nutzen.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type Zeile = Record<string, any>;

export interface Abfrage {
  query<T extends Zeile = Zeile>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Abfrage {
  /** Führt fn in einer Transaktion aus. benutzerId landet im Änderungsprotokoll. */
  transaktion<T>(benutzerId: number, fn: (tx: Abfrage) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  schliessen(): Promise<void>;
}

/** PGlite: Postgres im Prozess, für Tests und lokale Probeläufe. */
export async function pgliteDb(datenverzeichnis?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(datenverzeichnis);
  const q = async (runner: any, sql: string, params: unknown[] = []) => (await runner.query(sql, params)).rows;
  return {
    query: (sql, params) => q(pg, sql, params),
    exec: async (sql) => {
      try { await pg.exec(sql); }
      catch (e) { await pg.exec("ROLLBACK").catch(() => {}); throw e; }
    },
    transaktion: (benutzerId, fn) =>
      pg.transaction(async (tx: any) => {
        await tx.query("SELECT set_config('app.benutzer_id', $1, true)", [String(benutzerId)]);
        return fn({ query: (sql, params) => q(tx, sql, params) });
      }) as any,
    schliessen: () => pg.close(),
  };
}

/** Echter PostgreSQL-Server. Verbindung über DATABASE_URL. */
export async function postgresDb(verbindung = process.env.DATABASE_URL): Promise<Db> {
  if (!verbindung) throw new Error("DATABASE_URL ist nicht gesetzt");
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: verbindung, max: 5 });
  return {
    query: async (sql, params = []) => (await pool.query(sql, params as any[])).rows,
    exec: async (sql) => {
      // eigene Verbindung, damit ein ROLLBACK nach einem Fehler dieselbe Sitzung trifft
      const c = await pool.connect();
      try { await c.query(sql); }
      catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
      finally { c.release(); }
    },
    transaktion: async (benutzerId, fn) => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT set_config('app.benutzer_id', $1, true)", [String(benutzerId)]);
        const r = await fn({ query: async (sql, params = []) => (await c.query(sql, params as any[])).rows });
        await c.query("COMMIT");
        return r;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    },
    schliessen: () => pool.end(),
  };
}

/** Spielt alle noch nicht ausgeführten Migrationen in Dateinamen-Reihenfolge ein. */
export async function migrieren(db: Db, ordner = join(import.meta.dirname, "..", "db", "migrations")): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
    name text PRIMARY KEY, ausgefuehrt_am timestamptz NOT NULL DEFAULT now())`);
  const erledigt = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migration")).map((r) => r.name));
  const dateien = (await readdir(ordner)).filter((f) => f.endsWith(".sql")).sort();
  const neu: string[] = [];
  for (const f of dateien) {
    if (erledigt.has(f)) continue;
    const sql = await readFile(join(ordner, f), "utf8");
    // Jede Migration läuft vollständig oder gar nicht.
    await db.exec(`BEGIN;\n${sql}\nINSERT INTO schema_migration (name) VALUES ('${f.replace(/'/g, "''")}');\nCOMMIT;`);
    neu.push(f);
  }
  return neu;
}
