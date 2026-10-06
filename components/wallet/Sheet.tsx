"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";

/**
 * The shell both wallet sheets are built from, and the way out of them.
 *
 * Every dialog in the app opened by appearing and closed by ceasing to exist.
 * Appearing is survivable. Ceasing to exist is the part a reader notices: on a
 * phone the panel is a sheet held at the bottom edge under a thumb, and a sheet
 * that vanishes on release never reads as dismissed, it reads as a crash. That
 * is the one motion conditional rendering cannot express, because by the time
 * React knows the answer the element is already gone. `AnimatePresence` holds it
 * on screen long enough to leave properly.
 *
 * Two presentations, because it is two different objects. Under `md` it is a
 * bottom sheet and it travels on the axis a thumb pushed it along. Above `md`
 * it is a dialog in the middle of a screen with no edge to come from, so it
 * scales up a little out of nothing instead. Sliding a centred dialog in from
 * the bottom of a large display is the tell of an animation applied by rule
 * rather than chosen.
 *
 * Out is faster than in, roughly two thirds. Entrances are read; exits are
 * already understood by the time they start, and matching their length just
 * makes the interface feel slow to obey.
 *
 * ── Why this renders into `document.body` ──────────────────────────────────
 *
 * `position: fixed` is only relative to the viewport while no ancestor has a
 * `transform`, `filter`, `backdrop-filter` or `perspective`. Any of those makes
 * that ancestor the containing block instead, and a `fixed inset-0` overlay
 * then fills the ancestor rather than the screen.
 *
 * That is not hypothetical here. The mobile header condenses on scroll and
 * gains `backdrop-blur-2xl backdrop-saturate-150`, and it carries a sign-in
 * button. Rendered in place, this sheet was therefore trapped inside a 48px
 * tall bar from the moment the reader scrolled far enough to reach the board,
 * which is exactly where somebody decides to sign in. The sheet opened off
 * screen and read as a button that did nothing.
 *
 * A portal to `document.body` puts it above every such ancestor for good, so
 * no future blur or transform anywhere in the chrome can capture it again. The
 * account menu in `ConnectWallet` already did this for the same reason; the
 * sheets did not.
 *
 * Exit animations still work through a portal: `AnimatePresence` communicates
 * over React context, and context crosses portals.
 */

/** The sheet's own curve: quick to commit, long and soft to settle. */
const EASE_OUT = [0.32, 0.72, 0, 1] as const;
/** Leaving. Steady from the first frame, because there is nothing to read. */
const EASE_IN = [0.4, 0, 1, 1] as const;

export function Sheet({
  label,
  title,
  onClose,
  toolbar,
  children,
}: {
  /** Accessible name for the dialog. */
  label: string;
  /** Heading shown in the sheet's own header. */
  title: ReactNode;
  onClose: () => void;
  /** Pinned under the header, outside the scrolling area. */
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();

  /**
   * Which presentation this is, read once as the sheet opens.
   *
   * In the state initialiser rather than an effect: an effect would run after
   * the first frame, and the first frame is the one the entrance starts from,
   * so a mobile sheet would begin its travel from the desktop position. The
   * `window` guard is for form's sake; this only ever mounts on a click, long
   * after hydration. Rotating the device mid-sheet is not worth a listener.
   */
  const [asSheet] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches,
  );

  /**
   * Portals need a DOM to aim at, and this component is still server rendered.
   * Mounting is the first moment `document.body` exists, so nothing is drawn
   * before then; the sheet only ever opens on a click, long after that.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  // Reduced motion still gets the fade. Removing it entirely would make the
  // panel flicker in and out, which is a harsher effect than the one avoided.
  const panelFrom = reduced
    ? { opacity: 0 }
    : asSheet
      ? { opacity: 1, y: "100%" }
      : { opacity: 0, scale: 0.97, y: 6 };

  const panelTo = reduced
    ? { opacity: 1 }
    : asSheet
      ? { opacity: 1, y: 0 }
      : { opacity: 1, scale: 1, y: 0 };

  if (!mounted) return null;

  return createPortal(
    <motion.div
      /**
       * The blur starts at `md`, not below it.
       *
       * `backdrop-filter` re-blurs everything behind the element on every
       * frame it changes, and this one changes opacity for the whole of the
       * entrance. On a mid-range phone that is the difference between a sheet
       * that arrives and a sheet that stutters. The ground is already at 80%
       * here, so below `md` the blur was contributing a few pixels of softness
       * for most of the frame budget.
       */
      className="fixed inset-0 z-50 flex items-end justify-center bg-ground/80 md:items-center md:backdrop-blur-sm"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.12 : 0.22, ease: "linear" }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-lg border border-line-soft bg-surface md:rounded-lg"
        onClick={(e) => e.stopPropagation()}
        initial={panelFrom}
        animate={panelTo}
        // The exit carries its own transition rather than reversing the
        // entrance, which is what makes leaving the quicker of the two.
        exit={{
          ...panelFrom,
          transition: { duration: reduced ? 0.1 : 0.22, ease: EASE_IN },
        }}
        transition={{ duration: reduced ? 0.12 : 0.34, ease: EASE_OUT }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
          <h3 className="text-lead font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-3 transition-colors duration-100 hover:bg-surface-2 hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2.5 2.5l9 9M11.5 2.5l-9 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {toolbar}

        {/*
          `data-lenis-prevent` keeps this list scrolling on the landing page.
          Lenis is mounted there and would otherwise take the wheel event and
          apply it to the page behind, which is locked while a sheet is open,
          so the list would refuse to move. Inert everywhere else.
        */}
        <div
          data-lenis-prevent
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          {children}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
