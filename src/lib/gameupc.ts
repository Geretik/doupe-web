/*
 * GameUPC (gameupc.com): a crowdsourced database of the bar codes on game boxes, which gives a code the name of its
 * game on BoardGameGeek (in English). The lending desk asks it about a code we don't know yet, to offer the game of
 * the collection by that name. Without GAMEUPC_API_KEY (production, given by e-mail) it asks their test server with
 * its public key; GAMEUPC_URL points the tests at a fake one.
 */

const TEST_KEY = "test_test_test_test_test";
const TIMEOUT_MS = 8000;

type UpcInfo = {
  name?: string;
  searched_for?: string;
  bgg_info_status?: string;
  bgg_info?: { name?: string }[];
};

function server() {
  const key = process.env.GAMEUPC_API_KEY?.trim();
  const url = process.env.GAMEUPC_URL?.trim() || `https://api.gameupc.com/${key ? "v1" : "test"}`;
  return { url: url.replace(/\/$/, ""), key: key || TEST_KEY };
}

async function ask(upc: string): Promise<UpcInfo | null> {
  const { url, key } = server();
  try {
    const res = await fetch(`${url}/upc/${upc}`, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? ((await res.json()) as UpcInfo) : null;
  } catch {
    return null;
  }
}

/**
 * The names GameUPC has for a code (as kept: 13 or 8 digits), the likeliest first; none when it knows nothing or
 * does not answer in time.
 */
export async function gameUpcNames(code: string): Promise<string[]> {
  // we keep a UPC-A as its EAN-13 with a leading 0, GameUPC keeps the two apart: both are asked
  const upcs = code.length === 13 && code.startsWith("0") ? [code, code.slice(1)] : [code];
  const answers = (await Promise.all(upcs.map(ask))).filter((a) => a !== null);
  // a code someone confirmed has its one game; otherwise the name found for it and what that name found on BGG
  const verified = answers.find((a) => a.bgg_info_status === "verified");
  const names = verified
    ? [verified.bgg_info?.[0]?.name]
    : answers.flatMap((a) => [a.searched_for, a.name, ...(a.bgg_info ?? []).slice(0, 3).map((b) => b.name)]);
  return [...new Set(names.map((n) => n?.trim()).filter((n): n is string => !!n && n !== "None"))];
}
