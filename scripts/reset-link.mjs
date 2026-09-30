// One-time new-password link for an organiser account, for when no administrator can log in to make one.
//
//   node scripts/reset-link.mjs someone@example.com
//
// DATABASE_URL comes from the environment or .env.local (the production one, like for `npm run db:push`).
// The link points to SITE_URL, by default the production site. Same as createPasswordReset() in src/lib/admin-users.ts.
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";

config({ path: [".env.local", ".env"], quiet: true });

const RESET_DAYS = 3;
const SITE_URL = (process.env.SITE_URL ?? "https://www.doupeol.cz").replace(/\/$/, "");

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/reset-link.mjs <e-mail of the account>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (environment or .env.local).");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL.replace(/sslmode=(require|prefer|verify-ca)/, "sslmode=verify-full"),
});
await client.connect();
try {
  const { rows } = await client.query("select id, nickname, role from admin_users where email = $1", [email]);
  if (rows.length === 0) {
    const { rows: all } = await client.query("select email from admin_users order by id");
    console.error(`No account with e-mail ${email}. Accounts: ${all.map((r) => r.email).join(", ") || "(none)"}`);
    process.exit(1);
  }
  const user = rows[0];
  const token = randomBytes(24).toString("base64url");
  await client.query("begin");
  await client.query("delete from password_resets where user_id = $1 and used_at is null", [user.id]);
  await client.query("insert into password_resets (token, user_id, expires_at) values ($1, $2, $3)", [
    token,
    user.id,
    new Date(Date.now() + RESET_DAYS * 864e5),
  ]);
  await client.query("commit");
  console.log(`New-password link for ${user.nickname} (${user.role}), valid ${RESET_DAYS} days, works once:`);
  console.log(`${SITE_URL}/admin/nove-heslo/${token}`);
} finally {
  await client.end();
}
