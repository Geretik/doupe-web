// Starts an embedded Postgres (PGlite) on a TCP port, pushes the Drizzle schema
// and then runs the production Next.js server. Used by Playwright's webServer.
// Requires `next build` to have run first.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PG_PORT = Number(process.env.E2E_PG_PORT ?? 5599);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`;

const env = {
  ...process.env,
  DATABASE_URL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "e2e-admin",
  ADMIN_SECRET: process.env.ADMIN_SECRET ?? "e2e-secret",
  NEXT_PUBLIC_SITE_URL: `http://localhost:${WEB_PORT}`,
  RESEND_API_KEY: "", // e-mails are only logged
  CRON_SECRET: "e2e-cron",
  DISCORD_WEBHOOK_URL: "",
  REGISTRATION_RATE_LIMIT: "1000", // tests sign up many times from one IP
  PORT: String(WEB_PORT),
};

const children = [];
function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: "inherit", env, ...opts });
  children.push(child);
  return child;
}
function shutdown(code = 0) {
  for (const c of children) c.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const dataDir = mkdtempSync(join(tmpdir(), "botc-e2e-pg-"));
run("npx", ["pglite-server", "--port", String(PG_PORT), "--db", dataDir, "-m", "20"]);

// wait for the port
const started = Date.now();
while (true) {
  try {
    const s = await import("node:net");
    await new Promise((res, rej) => {
      const sock = s.createConnection({ port: PG_PORT, host: "127.0.0.1" });
      sock.once("connect", () => { sock.end(); res(); });
      sock.once("error", rej);
    });
    break;
  } catch {
    if (Date.now() - started > 30000) { console.error("PGlite did not start"); shutdown(1); }
    await new Promise((r) => setTimeout(r, 250));
  }
}

await new Promise((res, rej) => {
  const p = run("npx", ["drizzle-kit", "push", "--force"]);
  p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`drizzle-kit push failed (${code})`))));
}).catch((e) => { console.error(e); shutdown(1); });

const web = run("npx", ["next", "start", "-p", String(WEB_PORT)]);
web.on("exit", (code) => shutdown(code ?? 0));
