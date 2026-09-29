import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** App icon (PWA / favicon): a game die on the site's dark background. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#16120f",
          borderRadius: 96,
          fontSize: 380,
        }}
      >
        🎲
      </div>
    ),
    size,
  );
}
