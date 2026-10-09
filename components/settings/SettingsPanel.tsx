"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_ASSISTANT,
  useAssistantName,
  useRenameAssistant,
} from "@/lib/assistant";
import { CURRENCIES, setCurrency, useCurrency } from "@/lib/currency";

/**
 * The settings themselves.
 *
 * One section per preference, each saying what it does and where it is kept,
 * because "settings" with no explanation is how people end up afraid to touch
 * anything.
 */
export function SettingsPanel() {
  return (
    <div className="mt-8 max-w-xl space-y-4">
      <AssistantSection />
      <CurrencySection />
      <RecentChecksSection />
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="border-b border-line-soft px-4 py-3">
        <h2 className="text-body font-medium text-ink">{title}</h2>
        <p className="mt-1 text-micro text-ink-3">{description}</p>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

/**
 * The assistant's name, which belongs to the connected wallet.
 *
 * With nothing connected there is nowhere to put a name, so this says that
 * rather than offering a box that saves into nothing.
 */
function AssistantSection() {
  const assistant = useAssistantName();
  const { canRename, rename, reset } = useRenameAssistant();
  const [draft, setDraft] = useState(assistant);
  const [saved, setSaved] = useState(false);

  // Follows the stored name, including when a different wallet connects and
  // brings a different one with it.
  useEffect(() => {
    setDraft(assistant);
  }, [assistant]);

  return (
    <Section
      title="Your assistant's name"
      description={`He runs the checks. He is called ${DEFAULT_ASSISTANT} until you name him, and the name is kept against your wallet.`}
    >
      {!canRename ? (
        <p className="text-micro text-ink-3">
          Connect a wallet to give him a name. Without one he is{" "}
          {DEFAULT_ASSISTANT}.
        </p>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            rename(draft);
            setSaved(true);
          }}
        >
          <label htmlFor="assistant-name" className="sr-only">
            What to call your assistant
          </label>
          <input
            id="assistant-name"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaved(false);
            }}
            maxLength={24}
            className="h-10 w-48 rounded-md border border-line bg-surface-2 px-3 text-body text-ink focus:border-green focus:outline-none"
          />
          <button
            type="submit"
            className="h-10 rounded-md border border-line px-3 text-micro text-ink-2 transition-colors duration-100 hover:border-green hover:text-green"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setSaved(false);
            }}
            className="h-10 rounded-md px-2 text-micro text-ink-3 transition-colors duration-100 hover:text-ink"
          >
            Reset to {DEFAULT_ASSISTANT}
          </button>
          {saved ? (
            <span role="status" className="text-micro text-green">
              Saved
            </span>
          ) : null}
        </form>
      )}
    </Section>
  );
}

/** Which currency prices are shown in. Rates are fetched; the choice is local. */
function CurrencySection() {
  const { currency } = useCurrency();

  return (
    <Section
      title="Currency"
      description="Prices are quoted in dollars on chain and converted for display only."
    >
      <div className="flex flex-wrap gap-2">
        {CURRENCIES.map((c) => {
          const active = c === currency;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              aria-pressed={active}
              className={`h-10 rounded-md border px-4 text-body transition-colors duration-100 ${
                active
                  ? "border-green-line bg-green-deep text-green"
                  : "border-line text-ink-2 hover:border-green hover:text-green"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/** The list of addresses you have checked, kept so the check page can offer them back. */
function RecentChecksSection() {
  const [count, setCount] = useState<number | null>(null);

  // Read after mount. The server has no idea what this browser has checked, and
  // rendering a count during SSR would be a guess that then changes.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ht:verify-recent");
      const list: unknown = raw ? JSON.parse(raw) : [];
      setCount(Array.isArray(list) ? list.length : 0);
    } catch {
      setCount(0);
    }
  }, []);

  function clear() {
    try {
      localStorage.removeItem("ht:verify-recent");
    } catch {
      // Nothing stored means nothing to clear.
    }
    setCount(0);
  }

  return (
    <Section
      title="Recent checks"
      description="The addresses you have checked, so the check page can offer them back."
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-micro text-ink-3">
          {count === null
            ? "Counting."
            : count === 0
              ? "Nothing stored."
              : `${count} address${count === 1 ? "" : "es"} on this browser.`}
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={!count}
          className="h-9 rounded-md border border-line px-3 text-micro text-ink-2 transition-colors duration-100 hover:border-green hover:text-green disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </Section>
  );
}
