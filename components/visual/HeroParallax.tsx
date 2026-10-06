"use client";

import { useEffect, useRef } from "react";

/**
 * Moves the hero's own content as the page scrolls.
 *
 * The dot field behind it drifts too, but a uniform grid of dots translated
 * vertically produces an identical image, so nothing about that movement is
 * visible. The parallax a reader actually perceives has to be carried by
 * something with edges, which is the headline.
 *
 * The offset is written to a transform on a ref inside a rAF, so scrolling
 * costs no React renders. Skipped entirely under prefers-reduced-motion.
 */
export function HeroParallax({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const node = ref.current;
        if (!node) return;

        // Progress through the first screen only. Past that the hero is gone
        // and there is nothing left to move.
        const p = Math.min(window.scrollY / window.innerHeight, 1);
        // Rises slower than the page, and thins out as it leaves.
        node.style.transform = `translate3d(0, ${(p * 72).toFixed(1)}px, 0)`;
        node.style.opacity = String(1 - p * 0.85);
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
    <div ref={ref} className={className} style={{ willChange: "transform" }}>
      {children}
    </div>
  );
}
