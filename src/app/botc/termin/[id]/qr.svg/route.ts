import { qrSvg, qrTarget } from "@/lib/qr";

export const dynamic = "force-dynamic";

/** QR code with the session's sign-up link (for posters); public, it only encodes the public URL. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = await qrTarget((await params).id);
  if (!url) return new Response("Not found", { status: 404 });
  return new Response(await qrSvg(url), {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
