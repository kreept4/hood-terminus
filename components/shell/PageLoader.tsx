"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The mark, resolving out of coarse pixels.
 *
 * ── Why it is drawn rather than loaded ─────────────────────────────────────
 *
 * The first version rasterised an SVG through an `Image` and a data URL. That
 * decode is asynchronous and it can fail quietly on the encoding of the `#` in
 * a hex colour, which is exactly what happened: the overlay held the screen
 * showing nothing while an image that would never arrive was waited on.
 *
 * `Path2D` takes the same path data the logo component uses and fills it
 * straight onto the canvas. No decode, nothing async, nothing to fail.
 *
 * ── The motion ─────────────────────────────────────────────────────────────
 *
 * Three things move, and none of them is a bounce. A logo that bounces is a
 * loading spinner wearing a costume.
 *
 * The blocks get finer, which is the effect itself. The mark drifts up a few
 * pixels over the whole run, so it settles rather than sits. And a ring sweeps
 * once around it, which is the only part that reads as "working" and is what
 * was missing when this felt static.
 *
 * ── When it plays ──────────────────────────────────────────────────────────
 *
 * Once per session. The overlay is in the server HTML so it is painted on the
 * first frame, and an inline script in `<head>` hides it before paint for a
 * session that has already seen it.
 */

const HOLD_MS = 2000;
const FADE_MS = 460;
const START_BLOCK = 14;
const SIZE = 140;

/** The same geometry as the inline mark, on a 24-unit grid. */
const LOGO_PATH =
  "M7 3 H21 V17 H17 V21 H3 V7 H7 Z M8.5 8.5 H15.5 V15.5 H8.5 Z M10.4 11.1 H13.6 V12.9 H10.4 Z";

export const LOADER_SCRIPT = `
try {
  if (sessionStorage.getItem('ht:loaded') === '1') {
    document.documentElement.classList.add('ht-loaded');
  }
} catch (e) {}
`;

export function PageLoader() {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("ht:loaded") === "1";
    } catch {
      // Site data blocked. It plays every visit, which is a fine failure for
      // something that lasts two seconds.
    }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGone(true);
      return;
    }
    try {
      sessionStorage.setItem("ht:loaded", "1");
    } catch {}

    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) {
      setGone(true);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = SIZE * dpr;
    cv.height = SIZE * dpr;

    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--c-green").trim() || "#CCFF00";
    const line = css.getPropertyValue("--c-line").trim() || "#2f342e";

    // The crisp source, drawn once. Everything after is this, quantised.
    const source = document.createElement("canvas");
    source.width = cv.width;
    source.height = cv.height;
    const sctx = source.getContext("2d");
    if (!sctx) {
      setGone(true);
      return;
    }

    const scale = (SIZE * dpr) / 24;
    sctx.scale(scale, scale);
    sctx.fillStyle = accent;
    sctx.fill(new Path2D(LOGO_PATH), "evenodd");

    const tmp = document.createElement("canvas");
    const tctx = tmp.getContext("2d");
    let raf = 0;
    let start = 0;

    function frame(now: number) {
      if (!start) start = now;
      if (!ctx || !cv || !tctx) return;

      const t = Math.min((now - start) / HOLD_MS, 1);
      const eased = 1 - Math.pow(1 - t, 2.4);
      const block = Math.max(1, Math.round(START_BLOCK * (1 - eased)));

      ctx.clearRect(0, 0, cv.width, cv.height);

      // Settles upward a few pixels across the whole run.
      ctx.save();
      ctx.translate(0, (1 - eased) * 10 * dpr);

      if (block <= 1) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(source, 0, 0);
      } else {
        const w = Math.max(1, Math.floor(cv.width / block));
        const h = Math.max(1, Math.floor(cv.height / block));
        tmp.width = w;
        tmp.height = h;
        tctx.imageSmoothingEnabled = true;
        tctx.clearRect(0, 0, w, h);
        tctx.drawImage(source, 0, 0, w, h);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
      }
      ctx.restore();

      // One sweep of a ring, the only part that says "working". Drawn after
      // the mark so it is never quantised with it.
      const cx = cv.width / 2;
      const cy = cv.height / 2;
      const r = cv.width * 0.46;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + eased * Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5 * dpr;
      ctx.lineCap = "round";
      ctx.stroke();

      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        root.current?.setAttribute("data-done", "1");
        setTimeout(() => setGone(true), FADE_MS);
      }
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (gone) return null;

  return (
    <div ref={root} aria-hidden="true" className="page-loader">
      <canvas
        ref={canvas}
        style={{ width: SIZE, height: SIZE }}
        className="[image-rendering:pixelated]"
      />
    </div>
  );
}
