import { ImageResponse } from "next/og";
import { siteName } from "./site";

export const shareImageSize = { width: 1200, height: 630 };

/** Static share image for links to the site (Discord, Facebook, Messenger…). */
export function shareImage(emoji: string, tagline: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #16120f 0%, #2b1a1c 100%)",
          color: "#f1e9dc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 140, lineHeight: 1 }}>{emoji}</div>
        <div style={{ fontSize: 72, fontWeight: 700, marginTop: 24, letterSpacing: -2 }}>
          {siteName()}
        </div>
        <div style={{ fontSize: 44, color: "#c9394b", fontWeight: 700, marginTop: 8 }}>Olomouc</div>
        <div style={{ fontSize: 30, color: "#a89c8e", marginTop: 40 }}>{tagline}</div>
      </div>
    ),
    shareImageSize,
  );
}
