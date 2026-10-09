"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { VerifyPanel } from "@/components/verify/VerifyPanel";
import { truncateAddress } from "@/lib/format";
import {
  useAssistantName,
  useRenameAssistant,
  DEFAULT_ASSISTANT,
} from "@/lib/assistant";

/**
 * The paste box, and the last few things checked.
 *
 * The address lives in the URL rather than in state, so a result can be sent to
 * somebody. That is most of the point: the reason to check a token is usually
 * that someone sent it to you, and the reply worth sending back is the report
 * rather than a verdict retyped by hand.
 *
 * Recent checks are per-browser and local. They are a convenience for somebody
 * working through a list, not history worth keeping, and they never leave the
 * device.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const RECENT_KEY = "ht:verify-recent";
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // Site data blocked, or something else wrote nonsense to the key. Neither
    // is worth failing the page over.
    return [];
  }
}

function remember(token: string) {
  try {
    const next = [token, ...readRecent().filter((t) => t !== token)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // As above. The check still runs.
  }
}

export function VerifyBox() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [text, setText] = useState(token);
  const [recent, setRecent] = useState<string[]>([]);

  // Follow the URL when it changes under us, for a back button or a shared
  // link. Adjusted during render, not in an effect, which would render the
  // stale value once and then correct it.
  const [lastToken, setLastToken] = useState(token);
  if (token !== lastToken) {
    setLastToken(token);
    setText(token);
  }

  // Local storage is only readable after mount, so the list arrives a frame
  // late rather than mismatching what the server rendered.
  useEffect(() => {
    setRecent(readRecent());
  }, []);

  useEffect(() => {
    if (ADDRESS.test(token)) {
      remember(token);
      setRecent(readRecent());
    }
  }, [token]);

  const trimmed = text.trim();
  const valid = ADDRESS.test(trimmed);
  const typedSomething = trimmed.length > 0;

  function submit() {
    if (!valid) return;
    router.push(`/verify?token=${trimmed}`);
  }

  return (
    <div className="mt-8">
      <form
        className="flex max-w-2xl flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Token address"
          className="tnum h-12 min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-4 text-body text-ink transition-colors duration-100 placeholder:text-ink-3 focus:border-green focus:outline-none"
        />
        <button
          type="submit"
          disabled={!valid}
          className="h-12 shrink-0 rounded-lg bg-green px-5 text-body font-semibold text-on-accent transition-opacity duration-100 hover:opacity-90 disabled:opacity-40"
        >
          Verify
        </button>
      </form>

      {/* Only once there is something wrong to say. An address is 42 characters
          and nobody types one, so a validation message while somebody is still
          pasting is noise. */}
      {typedSomething && !valid && (
        <p className="mt-2 text-micro text-ink-3">
          That is not a token address. It should be 0x followed by 40
          characters.
        </p>
      )}

      <AssistantName />

      {recent.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-micro text-ink-3">Recent</span>
          {recent.map((t) => (
            <Link
              key={t}
              href={`/verify?token=${t}`}
              className="tnum rounded-md border border-line px-2.5 py-1 text-micro text-ink-2 transition-colors duration-100 hover:border-green hover:text-green"
            >
              {truncateAddress(t, 6)}
            </Link>
          ))}
        </div>
      )}

      {ADDRESS.test(token) ? (
        <div className="mt-6">
          <VerifyPanel token={token} />
          <ShareLink token={token} />
        </div>
      ) : (
        <p className="mt-8 max-w-2xl text-body text-ink-3">
          Works on every kind of pool on this chain, including the newer ones
          most tools cannot read. If a check cannot run, it says so. It never
          guesses, and it never calls something safe just because it could not
          test it.
        </p>
      )}
    </div>
  );
}

/** The reply worth sending back to whoever shared the token. */
function ShareLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        const url = `${window.location.origin}/verify?token=${token}`;
        void navigator.clipboard
          .writeText(url)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => {
            // Clipboard refused, which happens without a secure context. The
            // address bar already holds the same URL.
          });
      }}
      className="mt-3 rounded-md border border-line px-3 py-2 text-micro text-ink-2 transition-colors duration-100 hover:border-green hover:text-green"
    >
      {copied ? "Link copied" : "Copy a link to this report"}
    </button>
  );
}

/**
 * Renaming the assistant.
 *
 * Travis is a default, not a brand. Somebody who renames him has decided he is
 * theirs, which is the point of giving him a name rather than a product label.
 *
 * It lives here rather than behind a settings page because this is where he is,
 * and a preference two clicks from the thing it affects is a preference nobody
 * finds. Stored in this browser and never sent anywhere.
 */
function AssistantName() {
  const assistant = useAssistantName();
  const { canRename, rename, reset } = useRenameAssistant();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(assistant);

  /**
   * No wallet, no name to keep.
   *
   * The name is stored against the wallet, so there is nowhere to put one
   * until something is connected. Saying that is better than a control that
   * saves into nothing, and better than hiding it with no explanation.
   */
  if (!canRename) {
    return (
      <p className="mt-3 text-micro text-ink-3">
        Your assistant is called {DEFAULT_ASSISTANT}. Connect a wallet to give
        him another name.
      </p>
    );
  }

  if (!editing) {
    return (
      <p className="mt-3 text-micro text-ink-3">
        Your assistant is called {assistant}.{" "}
        <button
          type="button"
          onClick={() => {
            setDraft(assistant);
            setEditing(true);
          }}
          className="text-ink-2 underline underline-offset-2 transition-colors duration-100 hover:text-green"
        >
          Give him another name
        </button>
      </p>
    );
  }

  function save() {
    rename(draft);
    setEditing(false);
  }

  return (
    <form
      className="mt-3 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={24}
        autoFocus
        aria-label="What to call your assistant"
        className="h-9 w-44 rounded-md border border-line bg-surface-2 px-3 text-body text-ink focus:border-green focus:outline-none"
      />
      <button
        type="submit"
        className="h-9 rounded-md border border-line px-3 text-micro text-ink-2 transition-colors duration-100 hover:border-green hover:text-green"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          reset();
          setEditing(false);
        }}
        className="h-9 rounded-md px-2 text-micro text-ink-3 transition-colors duration-100 hover:text-ink"
      >
        Reset
      </button>
    </form>
  );
}
