import { shareImage, shareImageSize } from "@/lib/share-image";
import { siteName } from "@/lib/site";

export const alt = `Blood on the Clocktower – ${siteName()}`;
export const size = shareImageSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return shareImage("🕰", "Blood on the Clocktower · Herní večery · Game nights");
}
