import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const PG_PORT = Number(process.env.E2E_PG_PORT ?? 5599);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    ...devices["Desktop Chrome"],
    locale: "cs-CZ",
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${WEB_PORT}/`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
  metadata: { databaseUrl: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres` },
});

export const E2E = {
  /** Bootstrap password (ADMIN_PASSWORD) – only for creating the first account */
  adminPassword: "e2e-admin",
  /** Account that helpers.adminLogin() creates directly in the database */
  adminEmail: "admin@example.com",
  adminUserPassword: "e2e-admin-password",
  databaseUrl: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`,
};
