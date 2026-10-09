"use client";

import { useLayoutEffect, useRef, useState } from "react";

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

    /**
     * Everything the context needs to draw this text the way the DOM does.
     *
     * A function because resizing a canvas resets its context completely, and
     * the canvas has to be resized once the text has been measured. Setting
     * this twice is the price of measuring before sizing.
     *
     * Letter spacing is here because the `font` shorthand cannot carry it, and
     * leaving it out was the fault being fixed. The headline is tracked tight,
     * so the canvas drew the same string wider than the DOM did. The wrap below
     * then saw it exceed the width and broke the line, putting the last words
     * on a second line below the canvas where they could not be seen: the
     * effect covered part of the headline and stopped. Widely supported, and
     * harmless where it is not, since the measured width accounts for the
     * difference either way.
     */
    function apply(ctx: CanvasRenderingContext2D) {
      ctx.scale(dpr, dpr);
      ctx.fillStyle = style.color;
      ctx.textBaseline = "top";
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;
      if (style.letterSpacing && style.letterSpacing !== "normal") {
        ctx.letterSpacing = style.letterSpacing;
      }
      if (style.wordSpacing && style.wordSpacing !== "normal") {
        ctx.wordSpacing = style.wordSpacing;
      }
    }

    apply(sctx);

    const text = el.innerText.trim();
    const fontSize = parseFloat(style.fontSize);
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.1;

    /**
     * Break to the same lines the DOM did, or not at all.
     *
     * A headline set not to wrap has one line however wide it is, and wrapping
     * it here invented a second. So the white-space rule decides, rather than
     * this code assuming all text wraps.
     */
    const wraps = !/^(nowrap|pre)$/.test(style.whiteSpace);
    const lines: string[] = [];

    if (!wraps) {
      lines.push(text);
    } else {
      let line = "";
      for (const word of text.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (sctx.measureText(candidate).width > W && line) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) lines.push(line);
    }

    /**
     * The canvas is sized to the text, not only to the box it sits in.
     *
     * A glyph can sit a fraction outside the width the browser reports, and a
     * canvas edge is hard where the DOM's is not, so that difference shows up
     * as a clipped last letter. A pixel of slack costs nothing.
     */
    const widest = Math.max(...lines.map((l) => sctx.measureText(l).width));
    const CW = Math.max(W, Math.ceil(widest) + 1);
    const CH = Math.max(H, Math.ceil(lines.length * lineHeight));

    // Grown to fit, and the context set again because resizing cleared it.
    if (CW !== W || CH !== H) {
      source.width = CW * dpr;
      source.height = CH * dpr;
      apply(sctx);
    }

    // Half-leading. The DOM centres glyphs in the line box, so text drawn from
    // the box's top edge sits high by half the difference.
    const halfLeading = Math.max(0, (lineHeight - fontSize) / 2);
    lines.forEach((l, i) => sctx.fillText(l, 0, i * lineHeight + halfLeading));

    cv.width = CW * dpr;
    cv.height = CH * dpr;
    cv.style.width = `${CW}px`;
    cv.style.height = `${CH}px`;
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
