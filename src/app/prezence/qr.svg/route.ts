import { attendanceUrl } from "@/lib/attendance";
import { qrSvg } from "@/lib/qr";

export const dynamic = "force-dynamic";

/** QR code of the attendance sheet for the card on the table; public, it only encodes the public URL. */
export async function GET() {
  return new Response(await qrSvg(attendanceUrl()), {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
