"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";

/**
 * Rises the footer into place as it comes into view.
 *
 * Its own component rather than the shared `Reveal` because the footer is a
 * server component that reads chain status, and wrapping it in a client
 * component would drag that render to the client. This wraps the markup
 * instead: the children stay server-rendered and only the wrapper hydrates.
 */
export function FooterGlide({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined" ||
      el.getBoundingClientRect().top < window.innerHeight
    ) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.01 },
    );
    observer.observe(el);

    // The same backstop the section reveals carry: content must never be able
    // to strand itself at zero opacity.
    const fallback = setTimeout(() => {
      setShown(true);
      observer.disconnect();
    }, 15_000);

    return () => {
      clearTimeout(fallback);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={clsx("footer-glide", shown && "footer-glide-in")}
    >
      {children}
    </div>
  );
}
