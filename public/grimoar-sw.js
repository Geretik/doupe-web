/*
 * The grimoire without a connection. Registered by the grimoire's page (modules/botc/components/grimoire/offline.ts) for the
 * grimoire pages only: a grimoire opened on this device before opens again when the club's Wi-Fi is gone, with
 * the site's scripts, styles and the characters' icons. The page then takes what this browser kept of the game
 * in localStorage (modules/botc/components/grimoire/autosave.ts) and saves it once the connection is back.
 *
 * Pages: the network first, this device's copy only when the network fails or is too slow. Scripts and styles
 * never change under their name: the copy first. Icons: the copy, refreshed in the background.
 */
const CACHE = "grimoar-v1";
/** A page slower than this comes from the copy, when there is one; the network's answer still updates it. */
const PAGE_TIMEOUT_MS = 5000;
/** Copies this old and no longer used by the page that asks to keep its files are dropped. */
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const STORED_AT = "x-grimoar-stored";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const pageKey = (url) => {
  const u = new URL(url, self.location.origin);
  return u.origin + u.pathname;
};
const isStatic = (url) => url.pathname.startsWith("/_next/static/");
const isIcon = (url) => url.pathname.startsWith("/botc/roles/");

/** A copy of the response marked with when it was stored, for pruning. */
async function store(cache, key, response) {
  const headers = new Headers(response.headers);
  headers.set(STORED_AT, String(Date.now()));
  const body = await response.blob();
  await cache.put(key, new Response(body, { status: response.status, statusText: response.statusText, headers }));
}

const storable = (response) => response.ok && !response.redirected && response.type === "basic";

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") event.respondWith(page(event, request));
  else if (isStatic(url)) event.respondWith(fixed(request));
  else if (isIcon(url)) event.respondWith(icon(event, request));
});

async function page(event, request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then(async (response) => {
    if (storable(response)) await store(cache, pageKey(request.url), response.clone());
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  const copy = await cache.match(pageKey(request.url), { ignoreVary: true });
  if (!copy) return network;
  const slow = new Promise((resolve) => setTimeout(() => resolve(copy), PAGE_TIMEOUT_MS));
  return Promise.race([network, slow]).catch(() => copy);
}

async function fixed(request) {
  const cache = await caches.open(CACHE);
  const copy = await cache.match(request, { ignoreVary: true });
  if (copy) return copy;
  const response = await fetch(request);
  if (storable(response)) await store(cache, request.url, response.clone());
  return response;
}

async function icon(event, request) {
  const cache = await caches.open(CACHE);
  const copy = await cache.match(request, { ignoreVary: true });
  const network = fetch(request).then(async (response) => {
    if (storable(response)) await store(cache, request.url, response.clone());
    return response;
  });
  if (!copy) return network;
  event.waitUntil(network.catch(() => {}));
  return copy;
}

/**
 * The page asks to keep what it needs: itself (its first load came before this worker), its scripts and styles,
 * the icons of its characters. Old copies nothing asked for lately are dropped.
 */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "keep" || typeof data.page !== "string" || !Array.isArray(data.urls)) return;
  event.waitUntil(keep(data.page, data.urls.filter((u) => typeof u === "string")));
});

async function keep(pageUrl, urls) {
  const cache = await caches.open(CACHE);
  const wanted = new Set([pageKey(pageUrl), ...urls.map((u) => new URL(u, self.location.origin).href)]);
  const now = Date.now();
  const stored = await cache.match(pageKey(pageUrl), { ignoreVary: true });
  // a page loaded through this worker was stored just now; one opened from another page of the site was not
  if (now - Number(stored?.headers.get(STORED_AT) ?? 0) > 60_000) {
    try {
      const response = await fetch(pageUrl, { credentials: "same-origin", cache: "no-store" });
      if (storable(response)) await store(cache, pageKey(pageUrl), response);
    } catch {
      // offline: the copy there is stays
    }
  }
  for (const url of wanted) {
    if (url === pageKey(pageUrl) || (await cache.match(url, { ignoreVary: true }))) continue;
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      if (storable(response)) await store(cache, url, response);
    } catch {
      // fetched again when the page asks next time
    }
  }
  for (const request of await cache.keys()) {
    if (wanted.has(request.url)) continue;
    const copy = await cache.match(request, { ignoreVary: true });
    const at = Number(copy?.headers.get(STORED_AT) ?? 0);
    if (now - at > KEEP_MS) await cache.delete(request, { ignoreVary: true });
  }
}
