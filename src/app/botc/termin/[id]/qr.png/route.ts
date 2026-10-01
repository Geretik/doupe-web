import { qrPng, qrTarget } from "@/lib/qr";

export const dynamic = "force-dynamic";

/** The same QR code as qr.svg, as a 1024 px PNG for slides and social posts. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = await qrTarget(id);
  if (!url) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(await qrPng(url)), {
    headers: {
      "content-type": "image/png",
      "content-disposition": `inline; filename="termin-${id}-qr.png"`,
      "cache-control": "public, max-age=3600",
    },
  });
}
