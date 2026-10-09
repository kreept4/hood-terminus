"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * The top of the terminal: what this is, and the one box you type into.
 *
 * It replaces a full-height hero. That hero was `min-h-dvh`, so on a phone the
 * entire first screen was a headline and a button and the chain itself began
 * below the fold. A terminal that shows no data until you scroll is not a
 * terminal, and that was the whole of the mobile complaint.
 *
 * One line and one input, because the two questions somebody arrives with are
 * "what is this" and "where do I put the address".
 */

/** A contract address, pasted whole. */
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function TerminalHeader({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [text, setText] = useState(initialQuery);

  // Follow the URL when it changes under us, for a back button or a shared
  // link. Adjusted during render rather than in an effect, which would render
  // the stale value once and then correct it.
  const [lastQuery, setLastQuery] = useState(initialQuery);
  if (initialQuery !== lastQuery) {
    setLastQuery(initialQuery);
    setText(initialQuery);
  }

  /**
   * A pasted address is a destination, not a search.
   *
   * Somebody holding forty hex characters has already decided which token they
   * mean, and the useful answer is that token's page rather than a board
   * filtered down to one row.
   *
   * Phase 4 adds `/verify`, and this becomes `/verify?token=` then. Until that
   * page exists, sending people to a route that does not is worse than sending
   * them somewhere real.
   */
  const trimmed = text.trim();
  const isAddress = ADDRESS.test(trimmed);

  function submit() {
    if (isAddress) router.push(`/t/${trimmed}`);
  }

  /**
   * Anything that is not an address searches, on a pause.
   *
   * A search can fall through to our own pool index, which only the server can
   * read, so this writes to the URL. A third of a second is long enough that a
   * word is one navigation and short enough that it never feels held back.
   */
  useEffect(() => {
    if (isAddress || text === initialQuery) return;
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (text.trim()) next.set("q", text);
      else next.delete("q");
      const search = next.toString();
      router.replace(`${pathname}${search ? `?${search}` : ""}`, {
        scroll: false,
      });
    }, 320);
    return () => clearTimeout(id);
  }, [text, initialQuery, isAddress, params, pathname, router]);

  return (
    <header className="gutter pt-6 pb-4 md:pt-10 md:pb-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
        <p className="shrink-0 text-body text-ink-2 md:text-lead">
          The trading terminal for{" "}
          <span className="font-medium text-ink">Robinhood Chain</span>
        </p>

        <form
          className="relative min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3">
            <IconSearch />
          </span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a token or search a ticker"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Paste a token address or search a ticker"
            className="h-12 w-full rounded-lg border border-line bg-surface-2 pr-20 pl-10 text-body text-ink transition-colors duration-100 placeholder:text-ink-3 focus:border-green focus:outline-none"
          />
          {isAddress && (
            <button
              type="submit"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md bg-green px-3 py-2 text-micro font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90"
            >
              Open
            </button>
          )}
          {!isAddress && text !== "" && (
            <button
              type="button"
              onClick={() => setText("")}
              className="tap-44 absolute top-1/2 right-3 -translate-y-1/2 rounded-md text-micro text-ink-3 transition-colors duration-100 hover:text-ink"
            >
              Clear
            </button>
          )}
        </form>
      </div>
    </header>
  );
}

function IconSearch() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 20 20" />
    </svg>
  );
}
