import { ImageResponse } from "next/og";

/**
 * iOS home-screen icon.
 *
 * Separate from the general icon because iOS does not read the manifest for
 * this and does not round the corners itself: the artwork has to sit inside its
 * own padding or the mark is clipped by the mask.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#030302",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 24 24">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M7 3 H21 V17 H17 V21 H3 V7 H7 Z
               M8.5 8.5 H15.5 V15.5 H8.5 Z
               M10.4 11.1 H13.6 V12.9 H10.4 Z"
            fill="#CCFF00"
          />
        </svg>
      </div>
    ),
    size,
  );
}
