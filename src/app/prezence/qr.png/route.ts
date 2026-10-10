import { attendanceUrl } from "@/lib/attendance";
import { qrPng } from "@/lib/qr";

export const dynamic = "force-dynamic";

/** The same QR code as qr.svg, as a 1024 px PNG. */
export async function GET() {
  return new Response(new Uint8Array(await qrPng(attendanceUrl())), {
    headers: {
      "content-type": "image/png",
      "content-disposition": 'inline; filename="prezence-qr.png"',
      "cache-control": "public, max-age=3600",
    },
  });
}
