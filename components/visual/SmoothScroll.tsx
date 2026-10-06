"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Smooth scrolling, on the one page that is scrolled rather than read.
 *
 * The landing page is a sequence: the hero lifts and thins as it leaves, the
 * sections below fade up as they arrive. All of that is already keyed to scroll
 * position, and a trackpad delivers scroll position in coarse jumps, so the
 * motion underneath it was never seeing the smooth input it was built for.
 * Lenis interpolates between those jumps. Nothing else about the page changes.
 *
 * It is mounted here and nowhere else on purpose. Taking over the scroll wheel
 * on a page holding a price chart, an order form and a wallet table is how a
 * trading terminal starts feeling broken: the chart's own wheel zoom, a long
 * table and a native scrollbar all expect the browser to be in charge. On a
 * marketing page there is nothing to break.
 *
 * Two things it must never do, both handled below: run when the reader has
 * asked for less motion, and outlive the page it belongs to.
 */
export function SmoothScroll() {
  useEffect(() => {
    // Read once, at mount. Someone changing this system setting mid-scroll is
    // not a case worth carrying an event listener for.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    /**
     * Nothing is mounted on a phone or tablet at all.
     *
     * `syncTouch` is off below, so on a touch device Lenis would interpolate
     * nothing while still running a callback on every animation frame for the
     * life of the page. That is a background task and a battery cost buying
     * exactly zero pixels of movement. A coarse pointer already has momentum
     * scrolling in hardware, which is smoother than anything done in script.
     */
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const lenis = new Lenis({
      /**
       * How long the page keeps travelling after the wheel stops, and the
       * shape of that travel.
       *
       * The curve is the important half. It is an exponential decay, so speed
       * falls away fastest at the start and then eases to nothing, which is
       * how a heavy object actually stops. A linear or symmetric ease reads as
       * a slide instead, and a slide is the thing people mean when they call
       * smooth scrolling nauseating.
       *
       * 1.05s is deliberately short of the demos. This page is above a
       * product, and a reader who wants the board below should get there.
       */
      duration: 1.05,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),

      // Touch is left alone entirely. A phone's native scroll is already
      // smooth, already momentum-based, and already what the reader's thumb
      // expects; interpolating it a second time only adds lag.
      smoothWheel: true,
      syncTouch: false,

      // Slightly under 1 so a hard flick does not overshoot the section the
      // reader was aiming at.
      wheelMultiplier: 0.9,
    });

    let raf = 0;
    function frame(time: number) {
      lenis.raf(time);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      // Also removes the `lenis` classes from <html>, which is what returns
      // `scroll-behavior` to the value the rest of the site uses. Leaving them
      // behind would follow the reader onto the trade page.
      lenis.destroy();
    };
  }, []);

  return null;
}
