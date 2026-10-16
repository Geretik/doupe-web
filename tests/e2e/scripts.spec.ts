import { gunzipSync } from "node:zlib";
import { expect, test, type Browser } from "@playwright/test";
import { adminLogin, createAdminUser, resetDb } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetDb();
});

const PASSWORD = "e2e-organiser-password";

async function loginAs(browser: Browser, email: string) {
  const ctx = await browser.newContext({ locale: "cs-CZ" });
  const page = await ctx.newPage();
  await adminLogin(page, { email, password: PASSWORD });
  return page;
}

/** The script a script tool link opens */
function scriptOfLink(href: string) {
  return JSON.parse(gunzipSync(Buffer.from(new URL(href).searchParams.get("script")!, "base64")).toString("utf8"));
}

const SCRIPT = [
  { id: "_meta", name: "Moje TB", author: "Alice", logo: "https://example.com/logo.png" },
  "washerwoman",
  { id: "fortune_teller" },
  "imp",
  { id: "djinn" },
  { id: "hrdina_x", name: "Homebrew Hrdina", team: "townsfolk", ability: "Každou noc…" },
];

test("scripts library: add a JSON pasted or as a file, see its characters, open it in the script tool, download, edit, delete", async ({ page, browser }) => {
  await adminLogin(page);
  await page.click("main nav a:has-text('Krvavka')");
  await page.click("main nav a:has-text('Scripty')");
  await expect(page).toHaveURL(/\/admin\/botc\/scripty$/);
  await expect(page.locator("main")).toContainText("Zatím tu žádný script není.");

  const form = page.getByTestId("library-script-form");
  // what is not a script is never saved
  await form.locator("#json").fill("{nějaký text");
  await form.locator("button[type=submit]").click();
  await expect(form).toContainText("Tohle není platný JSON ani odkaz ze script toolu.");
  await form.locator("#json").fill('{"name": "Moje TB"}');
  await form.locator("button[type=submit]").click();
  await expect(form).toContainText("Tohle není script.");
  await form.locator("#json").fill('[{"id": "_meta"}, "washerwoman"]');
  await form.locator("button[type=submit]").click();
  await expect(form).toContainText("Vyplň název (v souboru není).");

  // pasted: name and author from its "_meta"
  await form.locator("#json").fill(JSON.stringify(SCRIPT));
  await form.locator("button[type=submit]").click();
  await page.waitForURL(/\/admin\/botc\/scripty\/\d+$/);
  const scriptUrl = page.url();
  await expect(page.locator("h1")).toHaveText("Moje TB");
  await expect(page.locator("main")).toContainText("Alice · 5 postav · přidal/a Správce");
  const characters = page.locator("#characters");
  for (const name of ["Pradlena", "Vědma", "Čert"]) await expect(characters).toContainText(name);
  await expect(characters).toContainText("Navíc ve scriptu");
  await expect(characters).toContainText("djinn, Homebrew Hrdina");

  // the script tool gets the whole file, homebrew too
  const toolHref = await page.getByRole("link", { name: "Otevřít ve script toolu" }).getAttribute("href");
  expect(scriptOfLink(toolHref!)).toEqual(SCRIPT);
  const download = await page.request.get(`${scriptUrl}/script.json`);
  expect(download.headers()["content-disposition"]).toContain("Moje%20TB.json");
  expect(await download.json()).toEqual(SCRIPT);

  // a name is in the library once, whatever the case
  await page.click("text=← Scripty");
  await expect(page.getByTestId("library-scripts")).toContainText("Moje TB");
  await form.locator("#json").fill(JSON.stringify(SCRIPT));
  await form.locator("#name").fill("moje tb");
  await form.locator("button[type=submit]").click();
  await expect(form).toContainText("Script „moje tb“ už v knihovně je.");

  // from a file, with the name typed
  await form.locator("#json").fill("");
  await form.locator("#name").fill("Druhý script");
  await form.locator("#file").setInputFiles({
    name: "druhy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify([{ id: "_meta", name: "Jméno v souboru" }, "chef", "poisoner"])),
  });
  await form.locator("button[type=submit]").click();
  await page.waitForURL(/\/admin\/botc\/scripty\/\d+$/);
  await expect(page.locator("h1")).toHaveText("Druhý script");
  expect((await (await page.request.get(`${page.url()}/script.json`)).json())[0]).toEqual({ id: "_meta", name: "Druhý script" });
  await page.click("text=← Scripty");
  await expect(page.getByTestId("library-scripts").locator("li")).toHaveText([/Druhý script.*2 postavy/, /Moje TB.*Alice · 5 postav/]);

  // edit: a new name and no author go into the file; without a new JSON the characters stay
  await page.goto(scriptUrl);
  const edit = page.getByTestId("library-script-form");
  await edit.locator("#name").fill("Moje TB v2");
  await edit.locator("#author").fill("");
  await edit.locator("button[type=submit]").click();
  await expect(edit).toContainText("Uloženo.");
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Moje TB v2");
  const saved = await (await page.request.get(`${scriptUrl}/script.json`)).json();
  expect(saved[0]).toEqual({ id: "_meta", name: "Moje TB v2", logo: "https://example.com/logo.png" });
  expect(saved.slice(1)).toEqual(SCRIPT.slice(1));
  // a new JSON replaces the characters
  await edit.locator("#json").fill(JSON.stringify(["investigator", "baron", "imp"]));
  await edit.locator("button[type=submit]").click();
  await expect(edit).toContainText("Uloženo i s novým JSONem.");
  await page.reload();
  await expect(page.locator("#characters")).toContainText("Baron");
  await expect(page.locator("#characters")).not.toContainText("Pradlena");

  // another organiser sees it, but cannot change it
  await createAdminUser({ email: "bob@example.com", password: PASSWORD, nickname: "Bob", role: "organizer" });
  const bob = await loginAs(browser, "bob@example.com");
  await bob.goto(scriptUrl);
  await expect(bob.locator("h1")).toHaveText("Moje TB v2");
  await expect(bob.locator("main")).toContainText("Upravit nebo smazat ho může ten, kdo ho přidal, a správci.");
  await expect(bob.getByTestId("library-script-form")).toHaveCount(0);
  await bob.context().close();

  page.once("dialog", (d) => d.accept());
  await page.click("button:has-text('Smazat script')");
  await page.waitForURL(/\/admin\/botc\/scripty$/);
  await expect(page.getByTestId("library-scripts").locator("li")).toHaveText([/Druhý script/]);
});

test("scripts library: the session form and its vote offer the library's scripts with a link to the script tool", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/botc/scripty");
  await page.locator("#json").fill(JSON.stringify(SCRIPT));
  await page.click("button:has-text('Přidat script')");
  await page.waitForURL(/\/admin\/botc\/scripty\/\d+$/);

  await page.goto("/admin/botc/novy");
  await expect(page.locator("#script-suggestions option[value='Moje TB']")).toHaveCount(1);
  await expect(page.locator("#poll-suggestions option[value='Moje TB']")).toHaveCount(1);
  await page.locator("input[name=scriptName] >> nth=0").fill("moje tb");
  // the library's short link, which opens the script tool with the script as the library has it
  const url = await page.locator("input[name=scriptUrl] >> nth=0").inputValue();
  expect(url).toMatch(/\/botc\/script\/\d+$/);
  const redirect = await page.request.get(new URL(url).pathname, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  expect(scriptOfLink(redirect.headers().location)).toEqual(SCRIPT);
  await page.locator("input[name=pollName] >> nth=0").fill("Moje TB");
  expect(await page.locator("input[name=pollUrl] >> nth=0").inputValue()).toBe(url);
});

/** A link of the club's script tool to its Trouble Brewing sample, as the tool writes it (URL-safe base64 of gzip) */
const TOOL_LINK = "https://skript.doupeol.cz/?script=H4sIAAAAAAAAA11RsU7FMAz8lSrz-wJGNjYGNoSQ2_olVhMncpxWFeLfyZMQdRjvnPNdzu9fjlb35D4TKribY0jY4ZvkNkecngUPYt8H0DRkeYwCTq_AK6bM1NL0wlVJm6L7vv0uO6AGlCMn4IuMNAsIWYp4xy72oH3zH7sEvF8IUwENF75n0caoGCMaUeuBRGGzXA-4XUhgR94Qi32yk3gyiWqE085rjisNO-G0WeemQ4xV2uCJS2zVNFOBWC9YMtXMg2E5DVhAIuq_ImeQbEtMZVAU9BmMh29cY7-hdZnRexi-IQhtEavTQI87fPwADIzyECICAAA";

test("scripts library: a script from the script tool – its link pasted, or sent by the tool's button; the short link opens it", async ({ page }) => {
  await adminLogin(page);

  // the tool's link pasted instead of the JSON
  await page.goto("/admin/botc/scripty");
  const form = page.getByTestId("library-script-form");
  await form.locator("#json").fill(TOOL_LINK);
  await form.locator("#name").fill("TB ze script toolu");
  await form.locator("button[type=submit]").click();
  await page.waitForURL(/\/admin\/botc\/scripty\/\d+$/);
  for (const name of ["Pradlena", "Mnich", "Čert"]) await expect(page.locator("#characters")).toContainText(name);

  // the short link: the script tool with the script as the library has it now
  const shortLink = await page.getByTestId("short-link").getAttribute("href");
  expect(shortLink).toMatch(/\/botc\/script\/\d+$/);
  const redirect = await page.request.get(new URL(shortLink!).pathname, { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  const opened = scriptOfLink(redirect.headers().location);
  expect(opened[0]).toMatchObject({ id: "_meta", name: "TB ze script toolu" });
  expect(opened).toContainEqual({ id: "washerwoman" });
  expect((await page.request.get("/botc/script/99999", { maxRedirects: 0 })).status()).toBe(404);

  // the tool's button opens the library with its link filled in; out of the address bar once read
  await page.goto(`/admin/botc/scripty#ze-toolu=${encodeURIComponent(TOOL_LINK)}`);
  await expect(form).toContainText("Níž je vložený script ze script toolu");
  await expect(form.locator("#json")).toHaveValue(TOOL_LINK);
  await expect(page).toHaveURL(/\/admin\/botc\/scripty$/);
  await form.locator("#name").fill("TB z tlačítka");
  await form.locator("button[type=submit]").click();
  await page.waitForURL(/\/admin\/botc\/scripty\/\d+$/);
  await expect(page.locator("h1")).toHaveText("TB z tlačítka");
  await expect(page.locator("#characters")).toContainText("Pradlena");
});

test("scripts library from the script tool's \"Načíst z Doupěte\": a script picked opens back in the tool", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/botc/scripty");
  await page.locator("#json").fill(JSON.stringify(SCRIPT));
  await page.click("button:has-text('Přidat script')");
  await page.waitForURL(/\/admin\/botc\/scripty\/\d+$/);
  const id = Number(page.url().split("/").pop());

  await page.goto("/admin/botc/scripty?do-toolu");
  await expect(page.locator("main")).toContainText("Vyber script – otevře se ve script toolu.");
  // nothing else to do here: no form, no other links
  await expect(page.getByTestId("library-script-form")).toHaveCount(0);
  const pick = page.getByTestId("pick-for-tool").filter({ hasText: "Moje TB" });
  await expect(pick).toHaveAttribute("href", `/botc/script/${id}`);
  // in the same tab, through the short link, which leads to the tool with the script
  await expect(pick).not.toHaveAttribute("target", /.*/);
  const redirect = await page.request.get(`/botc/script/${id}`, { maxRedirects: 0 });
  expect(redirect.headers().location).toMatch(/^https:\/\/skript\.doupeol\.cz\/\?script=/);
  expect(scriptOfLink(redirect.headers().location)).toEqual(SCRIPT);
});
