import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

/**
 * Web app manifest.
 *
 * Makes the site installable, so a trader can keep it on a home screen and open
 * it without browser chrome, which on a phone is most of the screen back.
 *
 * `display: standalone` rather than fullscreen: a wallet handoff bounces
 * through the browser and back, and fullscreen makes that transition jarring.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name.split(" ")[0],
    description: BRAND.description,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#030302",
    theme_color: "#030302",
    categories: ["finance"],
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
