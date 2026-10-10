import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Read once at build time: a static file from then on, no function runs for it. */
export const dynamic = "force-static";

/**
 * ZXing's bar code reader built for WebAssembly, which the lending page's camera loads on browsers without a reader
 * of their own (Safari on an iPhone, Firefox, Chrome on a computer). From this site rather than a CDN. The page asks
 * for it with the package's version in the address, so it may be cached for good.
 */
export async function GET() {
  const wasm = await readFile(join(process.cwd(), "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm"));
  return new Response(new Uint8Array(wasm), {
    headers: { "content-type": "application/wasm", "cache-control": "public, max-age=31536000, immutable" },
  });
}
