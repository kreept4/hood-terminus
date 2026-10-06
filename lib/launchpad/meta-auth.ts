/**
 * The statement a creator signs to attach artwork to their token.
 *
 * ── The hole this closes ───────────────────────────────────────────────────
 *
 * `/api/token-meta` used to authorise a write by reading the creator off the
 * launchpad and comparing it to a `creator` field in the request body. That
 * compares a public value to a value the caller typed. Every launch's creator
 * is readable on chain by anyone, so satisfying the check was a copy and a
 * paste: any stranger could rewrite any token's image and blurb, and the only
 * thing standing in the way was that nobody had tried.
 *
 * Proving control of an address means asking it to sign something. That is the
 * one thing a wallet can do that an onlooker cannot forge, and it needs no
 * session, no cookie and no account, which matters because this route runs for
 * people who have never signed in to anything.
 *
 * ── Why the whole payload is inside the message ────────────────────────────
 *
 * The signature covers every field it authorises, not just the token. If it
 * only said "I am the creator of X", that sentence would be a bearer token for
 * unlimited future edits to X the moment it leaked from a log, a proxy or a
 * browser extension. Binding the image and the description into the text means
 * a captured signature can only ever re-assert the exact values it was made
 * for, which is not an attack, it is a no-op.
 *
 * `issuedAt` bounds that further and is checked server side. Together they
 * mean a stolen signature is worth nothing after a few minutes and worth
 * nothing but a repeat of itself before then.
 *
 * ── Why it is written out in words ─────────────────────────────────────────
 *
 * A wallet shows this text to the person signing it. Anything opaque there
 * trains people to approve things they cannot read, which is the habit every
 * signature phishing attack is built on. Someone who did not expect to be
 * changing a token's artwork should be able to tell from the dialog alone.
 *
 * Shared by the client and the route so the two can never drift. A mismatch of
 * one character verifies as a different address and fails closed.
 */

export type TokenMetaClaim = {
  token: string;
  creator: string;
  imageUrl: string | null;
  description: string | null;
  /** Unix milliseconds, from the client, checked for freshness on the server. */
  issuedAt: number;
};

/** How long a signed claim stays acceptable. */
export const META_CLAIM_TTL_MS = 10 * 60 * 1000;

/**
 * Addresses are lowercased and empty fields are spelled "none" rather than
 * left blank, so that the string is built one way and only one way. Two
 * spellings of the same claim would verify as two different messages, and the
 * failure would look like a wallet problem rather than a formatting one.
 */
export function tokenMetaMessage(claim: TokenMetaClaim): string {
  return [
    "Hood Terminus: set token artwork",
    "",
    `Token: ${claim.token.toLowerCase()}`,
    `Creator: ${claim.creator.toLowerCase()}`,
    `Image: ${claim.imageUrl ?? "none"}`,
    `Description: ${claim.description ?? "none"}`,
    `Issued at: ${new Date(claim.issuedAt).toISOString()}`,
    "",
    "Signing this proves you control the creator wallet. It moves no funds.",
  ].join("\n");
}
