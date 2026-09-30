// Moves the data to a new Postgres database (used for moving Neon from us-east-1 to Frankfurt).
//
//   node scripts/migrate-db.mjs counts   rows and highest id per table in both databases
//   node scripts/migrate-db.mjs copy     full copy into the new, empty database (schema via drizzle-kit push first)
//   node scripts/migrate-db.mjs sync     after the switch: adds rows the old database still took, newer registration edits
//
// OLD_DATABASE_URL and NEW_DATABASE_URL come from the environment or from .env.migration (gitignored).
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

/** Parents before children, so foreign keys hold while inserting. login_failures and job_runs are short-lived state and stay behind. */
const TABLES = ["admin_users", "admin_invites", "sessions", "tables", "registrations", "games"];
/** Head start for the new id sequences: rows the old database takes until the switch keep their ids. */
const SEQUENCE_GAP = 1000;

function setting(name) {
  if (process.env[name]) return process.env[name];
  if (existsSync(".env.migration")) {
    for (const line of readFileSync(".env.migration", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && m[1] === name) return m[2];
    }
  }
  throw new Error(`${name} is not set (environment or .env.migration).`);
}

async function connect(name) {
  const url = setting(name).replace(/sslmode=(require|prefer|verify-ca)/, "sslmode=verify-full");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

const quote = (ident) => `"${ident}"`;
/** jsonb values come back parsed; send them as JSON text again. */
const param = (v) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);

async function stats(client) {
  const out = {};
  for (const t of TABLES) {
    const { rows } = await client.query(`select count(*)::int as n, coalesce(max(id), 0)::int as max from ${quote(t)}`);
    out[t] = rows[0];
  }
  return out;
}

async function insert(client, table, row, onConflict = "") {
  const cols = Object.keys(row);
  const sql = `insert into ${quote(table)} (${cols.map(quote).join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) ${onConflict}`;
  return (await client.query(sql, cols.map((c) => param(row[c])))).rowCount;
}

async function bumpSequences(client, gap) {
  for (const t of TABLES) {
    await client.query(
      `select setval(pg_get_serial_sequence($1, 'id'), greatest((select coalesce(max(id), 0) from ${quote(t)}) + $2, (select last_value from ${quote(`${t}_id_seq`)})))`,
      [t, gap],
    );
  }
}

async function printCounts(oldDb, newDb) {
  const [a, b] = [await stats(oldDb), await stats(newDb)];
  console.table(Object.fromEntries(TABLES.map((t) => [t, { old: a[t].n, new: b[t].n, "old max id": a[t].max, "new max id": b[t].max }])));
}

async function copy(oldDb, newDb) {
  const before = await stats(newDb);
  const busy = TABLES.filter((t) => before[t].n > 0);
  if (busy.length) throw new Error(`The new database is not empty (${busy.join(", ")}); refusing to copy.`);
  await newDb.query("begin");
  try {
    for (const t of TABLES) {
      const { rows } = await oldDb.query(`select * from ${quote(t)} order by id`);
      for (const row of rows) await insert(newDb, t, row);
      console.log(`${t}: ${rows.length}`);
    }
    await bumpSequences(newDb, SEQUENCE_GAP);
    await newDb.query("commit");
  } catch (e) {
    await newDb.query("rollback");
    throw e;
  }
}

async function sync(oldDb, newDb) {
  await newDb.query("begin");
  try {
    for (const t of TABLES) {
      const { rows } = await oldDb.query(`select * from ${quote(t)} order by id`);
      let added = 0;
      for (const row of rows) added += await insert(newDb, t, row, "on conflict do nothing");
      let updated = 0;
      if (t === "registrations") {
        // edits and cancellations made in the old database after the copy
        for (const row of rows) {
          const cols = Object.keys(row).filter((c) => c !== "id");
          const sets = cols.map((c, i) => `${quote(c)} = $${i + 2}`).join(", ");
          const r = await newDb.query(
            `update registrations set ${sets} where id = $1 and updated_at < $${cols.indexOf("updated_at") + 2}`,
            [row.id, ...cols.map((c) => param(row[c]))],
          );
          updated += r.rowCount;
        }
      }
      console.log(`${t}: +${added}${t === "registrations" ? `, updated ${updated}` : ""}`);
    }
    await bumpSequences(newDb, 1);
    await newDb.query("commit");
  } catch (e) {
    await newDb.query("rollback");
    throw e;
  }
}

const mode = process.argv[2];
if (!["counts", "copy", "sync"].includes(mode)) {
  console.error("Usage: node scripts/migrate-db.mjs counts|copy|sync");
  process.exit(1);
}
const oldDb = await connect("OLD_DATABASE_URL");
const newDb = await connect("NEW_DATABASE_URL");
try {
  if (mode === "copy") await copy(oldDb, newDb);
  if (mode === "sync") await sync(oldDb, newDb);
  await printCounts(oldDb, newDb);
} finally {
  await oldDb.end();
  await newDb.end();
}
