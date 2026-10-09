import { Card } from "@/components/primitives/Card";
import { Reveal } from "@/components/primitives/Reveal";
import { clsx } from "@/lib/clsx";
import { LAUNCH_FEE_ETH, formatLaunchFee } from "@/lib/chain/launch-fee";

/**
 * What the product is for, placed directly under the hero.
 *
 * Everything below this on the page is a screener, and a screener is table
 * stakes. Launching a token and earning its trading fees is the reason to be
 * here rather than on any other Robinhood Chain front end, so it goes above
 * every board on the page.
 *
 * The still is one window rather than three floating widgets. Loose panels read
 * as clip art dropped onto a card; a window with a title bar and a URL reads as
 * a picture of software, which is what it is meant to be. Everything inside it
 * is built from the same tokens as the real create screen, so it cannot drift
 * out of date the way a screenshot does, it weighs nothing, and it stays sharp
 * at any pixel density.
 *
 * No button of its own. The rail carries one permanently and the hero carries
 * one directly above this; a third would be the same ask three times on one
 * screen, which reads as a page that does not trust its own offer.
 */

const STEPS = [
  {
    title: "Name it",
    body: "A name, a ticker, a supply. No code.",
  },
  {
    title: "Open it",
    body: "Buyers fund it as they buy. At four ETH it opens as a normal market.",
  },
  {
    title: "Earn from it",
        /**
     * "for as long as it trades" was false.
     *
     * The launchpad splits a 1% trade fee with the creator while the token is
     * on the bonding curve. At four ETH it graduates into a Uniswap pool, the
     * curve stops being the venue, and the contract stops paying the creator.
     * Promising earnings that end at graduation is the one claim on this page
     * somebody could lose money believing.
     */
    body: "You take a share of the 1% fee on every trade, until it opens as a normal market.",
  },
];

export function CreatePitch() {
  return (
    <section className="gutter flex min-h-dvh flex-col justify-center py-14 md:py-20">
      <Reveal>
        <Card className="overflow-hidden">
          <div className="grid gap-8 p-6 lg:grid-cols-12 lg:gap-12 lg:p-12">
            {/* ── The claim ───────────────────────────────────────── */}
            <div className="flex flex-col justify-center lg:col-span-5">
              <h2 className="text-h1 leading-none font-bold tracking-tight text-ink">
                Launch a token and earn from every trade
              </h2>
              <p className="mt-4 text-lead text-ink-2">
                Live in under a minute. You put in no money of your own, and
                you take a share of every trade until it opens as a normal
                market.
              </p>

              <dl className="mt-8 flex flex-col divide-y divide-line-soft border-t border-line-soft">
                {STEPS.map((step, i) => (
                  <Reveal key={step.title} delay={80 + i * 70}>
                    <div className="py-4">
                      <dt className="text-body font-semibold text-ink">
                        {step.title}
                      </dt>
                      <dd className="mt-1 text-body text-ink-2">{step.body}</dd>
                    </div>
                  </Reveal>
                ))}
              </dl>
            </div>

            {/* ── The still ───────────────────────────────────────── */}
            <div className="flex items-center lg:col-span-7">
              <Reveal delay={140} className="w-full">
                <AppWindow />
              </Reveal>
            </div>
          </div>
        </Card>
      </Reveal>
    </section>
  );
}

/**
 * A picture of the create screen, framed as a desktop window.
 *
 * `pointer-events-none` and `aria-hidden` throughout: it looks like software,
 * so a reader will try to click it, and a control that depresses under the
 * pointer but does nothing is worse than one that is plainly a picture.
 */
function AppWindow() {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        "pointer-events-none select-none overflow-hidden rounded-lg border border-line bg-ground",
        "shadow-[0_28px_60px_-28px_var(--shadow-2)]",
        // Held back from the live interface it depicts. Full saturation and
        // full contrast made it read as a working panel, and a button that
        // looks pressable but is not is worse than no button. The window
        // controls opt back out of this, since they are what identify it as a
        // window in the first place.
        "opacity-90",
      )}
    >
      {/* Title bar. */}
      <div className="flex items-center gap-3 border-b border-line-soft bg-surface px-3 py-2.5">
        <span className="flex shrink-0 gap-2">
          <Dot colour="#ff5f57" />
          <Dot colour="#febc2e" />
          <Dot colour="#28c840" />
        </span>
        <span className="mx-auto truncate rounded-sm border border-line-soft bg-surface-2 px-3 py-0.5 text-micro text-ink-3">
          hoodterminus.app/create
        </span>
        {/* Balances the traffic lights so the address sits centred. */}
        <span className="w-[44px] shrink-0" />
      </div>

      <div className="flex">
        {/* Rail. */}
        <div className="hidden w-[68px] shrink-0 flex-col gap-2 border-r border-line-soft bg-surface p-2.5 saturate-[0.6] sm:flex">
          <span className="h-5 rounded-sm bg-line" />
          <span className="mt-2 h-2 w-4/5 rounded-full bg-line" />
          <span className="h-2 w-3/5 rounded-full bg-line-soft" />
          <span className="h-2 w-4/5 rounded-full bg-line-soft" />
          <span className="h-2 w-2/5 rounded-full bg-line-soft" />
        </div>

        {/* Screen. */}
        <div className="min-w-0 flex-1 p-3.5 saturate-[0.6] sm:p-4">
          <p className="text-lead font-bold text-ink">Launch a token</p>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-5">
            <div className="flex flex-col gap-2.5 rounded-md border border-line-soft bg-surface p-3 sm:col-span-3">
              <MockMode />
              <MockField label="Name" value="Cash Cat" />
              <MockField label="Ticker" value="CASHCAT" mono />
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-line-soft bg-surface p-3 sm:col-span-2">
              <p className="text-body font-semibold text-ink">Review</p>
              <MockRow label="Ticker" value="CASHCAT" />
              <MockRow label="Supply" value="1,000,000,000" />
              <MockRow label="Paired with" value="ETH" />
              <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-line-soft pt-2">
                <span className="text-micro text-ink-3">You pay</span>
                {/* Read from the shared constant, not typed in. This still
                    sat at 0.0020 while the form charged the real fee, so the
                    page selling the launch quoted a price the launch did not
                    ask for. */}
                <span className="tnum text-body font-semibold text-ink">
                  {formatLaunchFee(LAUNCH_FEE_ETH)}
                </span>
              </div>
              {/* Outlined, not filled. The accent fill is the product's one
                  "this does something" signal and it does not belong in a
                  still. */}
              <span className="mt-1 rounded-sm border border-line py-1.5 text-center text-micro text-ink-3">
                Launch
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A traffic light.
 *
 * The literal macOS colours rather than the product palette. These three are
 * the most recognisable window control in software, and recolouring them into
 * the brand ramp costs the one thing they are here for: making the still read
 * instantly as a window. They are the exception to the palette, not a hole in
 * it.
 *
 * The desaturation on the frame is lifted here so they stay their own colour
 * while everything inside the window stays held back.
 */
function Dot({ colour }: { colour: string }) {
  return (
    <span
      className="h-3 w-3 rounded-full saturate-100"
      style={{ background: colour }}
    />
  );
}

/**
 * The pairing choice, which is the one the form actually offers.
 *
 * This drew two launch modes, "On a curve" and "With a pool", and only the
 * first has ever existed: every token opens on a curve and a pool is what it
 * graduates into. A still that advertises a choice the form does not have is a
 * promise the product breaks the moment somebody clicks through.
 *
 * The pairing replaced it because it is the real choice, and because it is the
 * thing this launchpad can do that the others on this chain cannot.
 */
function MockMode() {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <span className="rounded-sm border border-green-line bg-green-deep px-2 py-1.5 text-center text-micro text-green">
        ETH
      </span>
      <span className="rounded-sm border border-line px-2 py-1.5 text-center text-micro text-ink-3">
        USDG
      </span>
      <span className="rounded-sm border border-line px-2 py-1.5 text-center text-micro text-ink-3">
        NVDA
      </span>
    </div>
  );
}

function MockField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-micro text-ink-3">{label}</span>
      <span
        className={clsx(
          "truncate rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 text-micro text-ink",
          mono && "tnum",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MockRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-micro text-ink-3">{label}</span>
      <span className="tnum truncate text-micro text-ink-2">{value}</span>
    </div>
  );
}
