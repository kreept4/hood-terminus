import { describe, expect, it } from "vitest";
import { GAP_MS, isNewSession } from "./session";

describe("isNewSession", () => {
  it("a fresh tab has no marker, so it is a new session", () => {
    expect(isNewSession({ marker: false, gap: 0 })).toBe(true);
  });

  it("a fresh tab opened beside a live one is still a new session", () => {
    // The heartbeat is current because the other tab is running. The marker is
    // what matters here: this tab has never been here.
    expect(isNewSession({ marker: false, gap: 500 })).toBe(true);
  });

  it("a reload keeps the marker and the heartbeat, so the session continues", () => {
    expect(isNewSession({ marker: true, gap: 1_000 })).toBe(false);
  });

  it("navigating within the site continues the session", () => {
    expect(isNewSession({ marker: true, gap: 0 })).toBe(false);
  });

  it("a tab restored hours later is a new session despite its marker", () => {
    // The case that was broken: Chrome restores sessionStorage with the tab, so
    // the marker survives a browser that was closed overnight.
    expect(isNewSession({ marker: true, gap: 8 * 60 * 60_000 })).toBe(true);
  });

  it("a background tab throttled to one beat a minute is not a new session", () => {
    // Chrome throttles timers in a hidden tab to roughly once a minute, so a
    // heartbeat up to a minute old is a tab that is alive, not one that closed.
    expect(isNewSession({ marker: true, gap: 60_000 })).toBe(false);
  });

  it("holds the session right up to the gap and ends it just past", () => {
    expect(isNewSession({ marker: true, gap: GAP_MS })).toBe(false);
    expect(isNewSession({ marker: true, gap: GAP_MS + 1 })).toBe(true);
  });

  it("a marker with no heartbeat ever recorded is a new session", () => {
    // A marker that predates the heartbeat, so it came from a restore.
    expect(isNewSession({ marker: true, gap: null })).toBe(true);
  });
});
