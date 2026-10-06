import { ImageResponse } from "next/og";

/**
 * The app icon, rendered rather than stored.
 *
 * Generated from the same geometry as the inline mark, so there is no second
 * copy of the logo to keep in step with the first, and the accent comes from
 * the palette rather than from a file exported before the last colour change.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

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
          background: "#030302",
        }}
      >
        <svg width="340" height="340" viewBox="0 0 24 24">
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
