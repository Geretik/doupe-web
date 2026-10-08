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
  await page.click("nav a:has-text('Scripty')");
  await expect(page).toHaveURL(/\/admin\/botc\/scripty$/);
  await expect(page.locator("main")).toContainText("Zatím tu žádný script není.");

  const form = page.getByTestId("library-script-form");
  // what is not a script is never saved
  await form.locator("#json").fill("{nějaký text");
  await form.locator("button[type=submit]").click();
  await expect(form).toContainText("Tohle není platný JSON.");
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
  const url = await page.locator("input[name=scriptUrl] >> nth=0").inputValue();
  expect(scriptOfLink(url)).toEqual(SCRIPT);
  await page.locator("input[name=pollName] >> nth=0").fill("Moje TB");
  expect(scriptOfLink(await page.locator("input[name=pollUrl] >> nth=0").inputValue())).toEqual(SCRIPT);
});
