/**
 * Is this a new session, or the one that was already running?
 *
 * Pulled out of `SessionGuard` so the decision can be tested without a browser.
 * The guard gathers the two signals and this weighs them; everything here is a
 * pure function of what was read.
 *
 * Neither signal is enough alone. The `sessionStorage` marker catches a tab
 * that has never been here, since a new tab starts with an empty store, but not
 * a restored one: Chrome brings `sessionStorage` back with a tab reopened from
 * history or restored at startup, so the marker returns and a browser that was
 * closed for hours looks like a session that never ended. The heartbeat is what
 * catches that, because a gap means no tab was open, whatever the marker says.
 */

/** How long a gap has to be before the browser is taken to have been closed. */
export const GAP_MS = 120_000;

export type SessionSignals = {
  /** Whether this tab's `sessionStorage` already held the marker. */
  marker: boolean;
  /** Milliseconds since any tab last checked in, or null when none ever has. */
  gap: number | null;
};

export function isNewSession({ marker, gap }: SessionSignals): boolean {
  // A tab that has never been here, whatever any other tab was doing.
  if (!marker) return true;
  // A marker with no heartbeat at all: the heartbeat is newer than the marker
  // it travelled with, so this is a tab restored from before it existed.
  if (gap === null) return true;
  return gap > GAP_MS;
}
