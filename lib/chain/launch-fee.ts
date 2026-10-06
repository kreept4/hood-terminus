/**
 * The launch fee this app expects to pay, in ETH.
 *
 * Not the source of truth. That is `launchFee()` on the launchpad, which has an
 * owner-only setter so it can change without a redeploy, and the create form
 * reads it before sending anything. A form that hardcoded the fee would send
 * the wrong `value` and revert with WrongLaunchFee the moment the real one
 * moved.
 *
 * This exists for the two places that cannot ask the chain: the form's first
 * paint, before the read comes back, and the marketing still on the create
 * page, which is a server-rendered picture of the form rather than the form.
 *
 * It lives in its own module for that second one. The still is a server
 * component, and importing a constant out of the client-side form would drag
 * the whole form module across the boundary with it.
 *
 * Keep it in step with the chain. It is currently ahead of it: run
 * `npm run set:fee` in `contracts/` to move the live value to match.
 */
export const LAUNCH_FEE_ETH = 0.000444;

/** Formatted the way both the form and the still show it. */
export function formatLaunchFee(eth: number): string {
  return `${eth.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} ETH`;
}
