"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";

/**
 * Fades and lifts its children the first time they reach the viewport.
 *
 * ── Why the hiding is done in script ───────────────────────────────────────
 *
 * This component used to rely on CSS holding every `.reveal` at `opacity: 0`
 * until an effect here added `.reveal-in`. That is the ordinary way to write
 * this and it has one failure mode that is unacceptable on a page whose job is
 * to show a market: if the client bundle throws before this effect runs, the
 * content never appears. Not late, never. The server had already sent every
 * row; CSS was hiding them and the only thing that could unhide them was the
 * code that had just died.
 *
 * So the resting state is now visible, and this component *applies* the hidden
 * class itself before removing it again. Nothing can strand content it did not
 * first hide, and a page whose JavaScript fails renders as a page with no
 * entrance animation.
 *
 * ── Why there is no flash ──────────────────────────────────────────────────
 *
 * Hiding after first paint would normally mean a visible flicker. It cannot
 * here, because the only elements ever hidden are the ones below the fold at
 * the moment this runs. Anything already on screen is left alone and keeps the
 * pixels the server painted. An element the reader cannot see cannot flicker.
 *
 * Reduced motion and a missing IntersectionObserver both skip straight past
 * all of it, as does the element being on screen already.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Milliseconds. Use to stagger siblings, never above about 200. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  /**
   * `null` is the resting state: no entrance, nothing hidden, and the state
   * this renders on the server and on any client where the effect below never
   * runs. `false` means hidden and waiting; `true` means playing in.
   */
  const [entering, setEntering] = useState<boolean | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Anything on screen now, anyone who asked for less motion, and any
    // browser without an observer: left exactly as the server drew it.
    if (
      reduced ||
      typeof IntersectionObserver === "undefined" ||
      el.getBoundingClientRect().top < window.innerHeight
    ) {
      return;
    }

    setEntering(false);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEntering(true);
          observer.disconnect();
        }
      },
      // Fires a little before the element is fully on screen, so the motion has
      // finished by the time it is in comfortable reading position.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.02 },
    );
    observer.observe(el);

    /**
     * The backstop, kept even though the resting state is now visible.
     *
     * It covers the narrower case this design still has: the observer being
     * attached and then never reporting, which leaves content hidden by our
     * own class. Shorter than the old fifteen seconds, because it no longer
     * has to double as the only thing standing between a reader and the page.
     */
    const fallback = setTimeout(() => {
      setEntering(true);
      observer.disconnect();
    }, 4_000);

    return () => {
      clearTimeout(fallback);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: entering ? `${delay}ms` : "0ms" }}
      className={clsx(
        "reveal",
        entering === false && "reveal-out",
        entering === true && "reveal-in",
        className,
      )}
    >
      {children}
    </div>
  );
}
