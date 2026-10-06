"use client";

import { useEffect, useRef } from "react";
import { HeroField } from "@/components/visual/HeroField";

/**
 * The dot field, behind the whole page rather than just the hero.
 *
 * `fixed` rather than `absolute`: the field stays put while the page scrolls
 * over it, which is what keeps it reading as a surface the content sits on
 * instead of a banner that scrolls away. It also means one canvas for the whole
 * route rather than one per section.
 *
 * Sits at z-0 rather than a negative index. A negative index puts it behind the
 * background colour the body propagates to the viewport canvas, which is a
 * canvas that renders every frame and is never seen. The content column above
 * it carries the positive index instead.
 *
 * Never interactive, so it cannot eat a click meant for a row.
 *
 * It drifts at a fraction of the scroll rate. The offset is written to a
 * transform on a ref inside a rAF rather than held in state, so scrolling the
 * page costs no React renders at all, and the whole thing is skipped under
 * prefers-reduced-motion.
 */
export function PageField() {
  const layer = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = layer.current;
        if (!el) return;
        // A fifth of the scroll distance, capped so the field never travels
        // far enough to show its own edge.
        const y = Math.min(window.scrollY * 0.2, 260);
        el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      });
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden md:pl-64"
    >
      {/* Oversized and pulled up, so drifting down never exposes the top. */}
      <div
        ref={layer}
        className="absolute inset-x-0 -top-[15vh] h-[130vh] will-change-transform"
      >
        <HeroField />
      </div>
      {/* A light, even settling rather than a fade to ground. The previous
          gradient reached 86% ground by the bottom, which erased the field
          exactly where the page needed something in it. Cards are opaque, so
          the field showing through the gaps between them costs no legibility. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--color-ground) 22%, transparent) 100%)",
        }}
      />
    </div>
  );
}
