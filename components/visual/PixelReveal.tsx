"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Text that resolves out of coarse pixels.
 *
 * Genuine pixelation, not a mosaic. The distinction matters and the previous
 * version got it wrong: that one revealed rectangular patches of the finished
 * text in scattered order, which reads as tiles being uncovered. Pixelation
 * quantises the image itself, so every block is one flat colour averaged from
 * the region under it, and the letterforms emerge as the grid gets finer.
 *
 * Done the way pixelation is actually done: draw the text into a canvas scaled
 * down by the block size, then scale that back up with image smoothing off. The
 * browser's own nearest-neighbour resampling produces the blocks, which is both
 * exactly correct and far cheaper than averaging pixels by hand.
 *
 * The real text stays in the DOM the whole time, hidden with `visibility` so it
 * keeps its layout. Nothing here can change where anything sits on the page,
 * and if the canvas fails for any reason the text is simply shown.
 */

const DURATION_MS = 2000;
const START_BLOCK = 14;

export function PixelReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const host = useRef<HTMLSpanElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(false);

  // Layout effect so the canvas is painted on the frame the text first appears.
  // In a plain effect the finished headline flashes once before the animation
  // starts, which gives the whole thing away.
  useLayoutEffect(() => {
    const el = host.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    const style = getComputedStyle(el);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.ceil(rect.width);
    const H = Math.ceil(rect.height);

    // The crisp source. Everything else is this, downscaled and back up.
    const source = document.createElement("canvas");
    source.width = W * dpr;
    source.height = H * dpr;
    const sctx = source.getContext("2d");
    if (!sctx) return;

    sctx.scale(dpr, dpr);
    sctx.fillStyle = style.color;
    sctx.textBaseline = "top";
    sctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;

    // Wrap by hand. The canvas has no notion of a line box, so the text has to
    // be broken to the same width the DOM already broke it to.
    const text = el.innerText.trim();
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.1;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (sctx.measureText(candidate).width > W && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);

    lines.forEach((l, i) => sctx.fillText(l, 0, i * lineHeight));

    cv.width = W * dpr;
    cv.height = H * dpr;
    cv.style.width = `${W}px`;
    cv.style.height = `${H}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    setRunning(true);

    let raf = 0;
    const start = performance.now();

    function frame(now: number) {
      const t = Math.min((now - start) / DURATION_MS, 1);
      // Eased so the coarse blocks hold long enough to be seen, and the last
      // stretch is the detail settling.
      const eased = 1 - Math.pow(1 - t, 2.4);
      const block = Math.max(1, Math.round(START_BLOCK * (1 - eased)));

      if (!ctx) return;
      ctx.clearRect(0, 0, cv!.width, cv!.height);

      if (block <= 1) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(source, 0, 0);
      } else {
        // Down to a fraction of the size, then back up with smoothing off.
        // Nearest-neighbour on the way up is what makes the blocks.
        const w = Math.max(1, Math.floor(cv!.width / block));
        const h = Math.max(1, Math.floor(cv!.height / block));
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(source, 0, 0, w, h);
        const small = ctx.getImageData(0, 0, w, h);

        const tmp = document.createElement("canvas");
        tmp.width = w;
        tmp.height = h;
        tmp.getContext("2d")?.putImageData(small, 0, 0);

        ctx.clearRect(0, 0, cv!.width, cv!.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, cv!.width, cv!.height);
      }

      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        // Hand back to the real text. A canvas left in place would be a
        // screenshot of the headline rather than the headline.
        setRunning(false);
      }
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span className={`relative ${className ?? ""}`}>
      <span
        ref={host}
        style={running ? { visibility: "hidden" } : undefined}
        className="block"
      >
        {children}
      </span>
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0"
        style={{ display: running ? "block" : "none" }}
      />
    </span>
  );
}
