"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clsx } from "@/lib/clsx";

/**
 * A select that belongs to this product.
 *
 * A native `<select>` takes its colours from the operating system, not from the
 * page. On a dark interface that means the closed control obeys the theme and
 * the open list is a white system menu, which is the one moment the product
 * stops looking like itself. There is no CSS that fixes it: the popup is drawn
 * by the browser and is out of reach.
 *
 * So the list is drawn here. Two things that follow from doing it ourselves and
 * are the whole reason to bother:
 *
 *   - it is portalled to the body and positioned in viewport coordinates, so no
 *     `overflow` on any ancestor can clip it, which is the bug that hid the
 *     disconnect button inside a scrolling card
 *   - a long list can be searched, which a native select cannot do beyond
 *     jumping to a first letter
 *
 * Keyboard behaviour is kept to what people actually use: type to filter, up
 * and down to move, Enter to choose, Escape to leave.
 */

export type SelectOption = {
  value: string;
  label: string;
  hint?: string;
  /**
   * Drawn to the left of the label.
   *
   * A list of forty tickers is forty pieces of near-identical text, and a token
   * is recognised by its picture long before its name is read. The trigger
   * shows it too, so the closed control says which token is selected rather
   * than only spelling it.
   */
  icon?: React.ReactNode;
};

export function Select({
  value,
  options,
  onChange,
  placeholder = "Choose",
  /** Adds a filter box. Worth it past about a dozen options. */
  searchable = false,
  className,
  ariaLabel,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const trigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [at, setAt] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;

    function place() {
      const el = trigger.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const NEEDED = 280;
      const GAP = 6;
      const room = window.innerHeight - r.bottom;

      setAt(
        room < NEEDED && r.top > room
          ? {
              left: r.left,
              width: r.width,
              bottom: window.innerHeight - r.top + GAP,
            }
          : { left: r.left, width: r.width, top: r.bottom + GAP },
      );
    }

    place();

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (trigger.current?.contains(target) || list.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        if (next < 0) return shown.length - 1;
        if (next >= shown.length) return 0;
        return next;
      });
      return;
    }
    if (e.key === "Enter" && open) {
      e.preventDefault();
      const pick = shown[active];
      if (pick) choose(pick.value);
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setOpen((v) => !v);
          setActive(Math.max(0, shown.findIndex((o) => o.value === value)));
        }}
        onKeyDown={onKey}
        className={clsx(
          "flex w-full items-center justify-between gap-3 rounded-md border border-line",
          "bg-surface-2 px-3 py-2.5 text-left text-body",
          "transition-colors duration-100 hover:border-green focus:border-green focus:outline-none",
          current ? "text-ink" : "text-ink-3",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {current?.icon}
          <span className="min-w-0 truncate">
            {current?.label ?? placeholder}
          </span>
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className={clsx(
            "shrink-0 text-ink-3 transition-transform duration-150",
            open && "rotate-180",
          )}
        >
          <path
            d="M1.5 3.5 5 7l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open &&
        at &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={list}
            role="listbox"
            style={{
              position: "fixed",
              left: at.left,
              width: at.width,
              ...(at.top !== undefined ? { top: at.top } : { bottom: at.bottom }),
            }}
            className={clsx(
              "z-50 overflow-hidden rounded-md border border-line-soft bg-surface",
              "shadow-[0_18px_36px_-14px_var(--shadow-2)]",
            )}
          >
            {searchable && (
              <div className="border-b border-line-soft p-1.5">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKey}
                  placeholder="Search"
                  spellCheck={false}
                  className="w-full rounded-sm bg-surface-2 px-2.5 py-2 text-body text-ink placeholder:text-ink-3 focus:outline-none"
                />
              </div>
            )}

            <div className="max-h-64 overflow-y-auto p-1" data-lenis-prevent>
              {shown.length === 0 ? (
                <p className="px-2.5 py-3 text-body text-ink-3">Nothing found</p>
              ) : (
                shown.map((o, i) => {
                  const selected = o.value === value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(o.value)}
                      className={clsx(
                        "flex w-full items-baseline justify-between gap-3 rounded-sm px-2.5 py-2 text-left text-body",
                        "transition-colors duration-100",
                        i === active ? "bg-surface-2" : "",
                        selected ? "text-green" : "text-ink-2 hover:text-ink",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {o.icon}
                        <span className="min-w-0 truncate">{o.label}</span>
                      </span>
                      {o.hint && (
                        <span className="tnum shrink-0 text-micro text-ink-3">
                          {o.hint}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
