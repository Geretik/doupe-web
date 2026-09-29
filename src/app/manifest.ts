import type { MetadataRoute } from "next";
import { siteName } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteName(),
    short_name: "DoUPě",
    description: "Blood on the Clocktower – registrace na herní večery",
    start_url: "/",
    display: "standalone",
    background_color: "#16120f",
    theme_color: "#8b1e2d",
    lang: "cs",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
