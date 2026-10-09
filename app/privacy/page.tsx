import Link from "next/link";
import { LegalPage, Clause } from "@/components/legal/LegalPage";
import { BRAND } from "@/lib/brand";
import { robinhoodChain } from "@/lib/chain";

export const metadata = {
  title: "Privacy",
  description:
    "What Hood Terminus collects, who processes it, what stays in your browser, and what is on a public blockchain and therefore permanent.",
};

/**
 * Privacy notice.
 *
 * Every factual claim below was read out of the code rather than assumed, and
 * the inventory is worth keeping written down here because this page is the
 * file nobody remembers is downstream of a new feature.
 *
 *   - Browser storage, all on-device and never sent to us: `ht:alerts` (alert
 *     rules), `ht:tracked` (watched addresses), `ht:currency` (USD/GBP/EUR),
 *     `ht:rail` (sidebar collapsed), `ht:loaded` (first-visit marker) and
 *     `ht:install-dismissed` (the install prompt), `ht:assistant` (what the
 *     check is called) and `ht:verify-recent` (the last few tokens checked).
 *     The `-changed` keys beside some of them are event names, not storage.
 *   - Supabase tables: `swaps`, `token_metadata`, `wallet_pnl`,
 *     `wallet_rankings`. Every one of these is keyed by a wallet address or a
 *     token address read off a public chain. None of them holds a name, an
 *     email or anything a person typed about themselves, except the token
 *     description and image a creator chooses to attach.
 *   - Supabase storage bucket `token-images`, added 8 September, holds uploaded
 *     token artwork. Public by design, because a token's logo is public.
 *   - No identity provider, as of 8 October 2026. Privy held an email, an X
 *     or Telegram account and key material for a wallet it created; it was the
 *     most sensitive thing in this system and it is gone. A wallet address is
 *     now the only identifier the product has.
 *   - Vercel Analytics counts page views, added 9 October 2026. Cookieless, no
 *     cross-site identity, nothing written to the device. No advertising, no
 *     gtag, no Plausible, no PostHog. The cookie banner stays absent because
 *     there is still no tracking to consent to, and clause 5 says exactly that.
 *     Swapping this for anything that follows people between sites makes that
 *     clause false.
 *   - `/api/fx` proxies Frankfurter server-side specifically so the rate
 *     provider never sees a visitor's browser.
 *
 * If any of that changes, this page changes with it.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      updated="9 October 2026"
      intro="What we collect, what never leaves your browser, and what is on a public chain and therefore beyond anyone's power to delete. Written to be read, not to be survived."
      summary={{
        heading: "Headnote",
        points: [
          "There is no account here. We do not ask for your name, and we do not know it.",
          "There is no sign-in. You connect a wallet, and we learn its address and nothing else.",
          "Your alerts, tracked wallets and currency choice never leave your browser.",
          "We hold public chain data keyed by wallet address, which we did not get from you.",
          "We count page views without cookies. No advertising, no trackers, and so no cookie banner.",
          "Anything already on the blockchain cannot be deleted by us or by anyone.",
        ],
        footnote:
          "A précis. The clauses below are the operative description.",
      }}
    >
      <p>
        {BRAND.name} is a website for reading {robinhoodChain.name} and sending
        your own transactions to it. That shape decides most of this notice:
        there is no account, no profile, and no sign-up form asking who you are.
      </p>

      <Clause n={1} heading="What we hold">
        <p>
          <strong>An address, if you connect one.</strong> Connecting a wallet
          tells the site your public address. It is not a name, but it is a
          persistent identifier and everything that address has ever done is
          public, so we treat it as personal data rather than pretending
          otherwise.
        </p>
        <p>
          <strong>Public chain and market data.</strong> We keep tables of swaps,
          token records, wallet profit and loss, and wallet rankings. All of it is
          derived from the public chain and from market data providers. We did not
          get it from you and it exists whether or not you visit.
        </p>
        <p>
          <strong>What a token creator attaches.</strong> If you launch a token
          you can add a description and upload an image. Both are stored by us,
          both are published, and both are meant to be seen by everybody. Do not
          put anything private in either.
        </p>
        <p>
          <strong>Ordinary server logs.</strong> Vercel records requests to the
          site, including IP addresses, for the security and reliability of the
          service.
        </p>
        <p>
          We do not ask for your name, your date of birth, your address, your
          documents or your phone number. There is no identity check because
          there is nothing here that requires one.
        </p>
      </Clause>

      <Clause n={2} heading="Connecting a wallet">
        <p>
          There is one way in: a wallet you already have. Connecting it tells us
          your address and nothing else. We never see a name, an email or a
          social account, because there is no longer anywhere to enter one.
        </p>
        <p>
          Until 8 October 2026 there was a second route. You could sign in with
          an email address, an X account or Telegram, and have a wallet created
          for you, which was operated by Privy. Privy held the identifier you
          signed in with and key material for that wallet, and was the one party
          able to associate your email or social account with your address.
        </p>
        <p>
          That route has been removed and the integration is gone from this site.
          If you used it, Privy still holds whatever it held, and that is between
          you and Privy: their privacy policy governs it and their support can
          act on it. We never received those identifiers, so there is nothing
          here for us to delete.
        </p>
      </Clause>

      <Clause n={3} heading="Checking a token with Travis">
        <p>
          Travis is the name of the check this site runs on a token. You can
          rename him on the check page; that name lives in your browser and is
          never sent to us.
        </p>
        <p>
          <strong>Checking a token needs nothing from you.</strong> No wallet,
          no account, no sign-in. He copies the current state of the blockchain,
          spends imaginary money inside that copy to buy the token and sell it
          straight back, and reports what happened. Nothing is signed, nothing
          reaches the chain, and your money is never used.
        </p>
        <p>
          What we learn is the token address you asked about, in an ordinary
          server log alongside your IP, exactly as with any other page. We do
          not connect that to a wallet, because checking does not involve one,
          and we build no profile from it.
        </p>
        <p>
          Running a check does send that token&rsquo;s address to the parties in
          the next clause: the chain endpoint, to read the contracts, and
          GeckoTerminal, for the market figures. They see a request about a
          public token, not a request about you.
        </p>
        <p>
          The last few tokens you checked are kept in your browser so the page
          can offer them again. They never leave the device, and clearing your
          browser data removes them.
        </p>
      </Clause>

      <Clause n={4} heading="What stays in your browser">
        <p>
          Several things you set are kept in your browser&rsquo;s local storage
          and are never sent to us:
        </p>
        <ul>
          <li>your alert rules, and which of them have fired</li>
          <li>the wallet addresses you have chosen to track</li>
          <li>
            what you have chosen to call your assistant, and the last few tokens
            you checked
          </li>
          <li>whether you display secondary figures in dollars, pounds or euros</li>
          <li>
            whether the sidebar is collapsed, whether you have visited before, and
            whether you dismissed the install prompt
          </li>
        </ul>
        <p>
          They live on the device you set them on. They do not follow you to
          another browser, we cannot read them, and clearing your browser data
          removes them permanently.
        </p>
      </Clause>

      <Clause n={5} heading="Counting visits, and why there is still no cookie banner">
        <p>
          We count page views, using Vercel Analytics. It records that a page
          was loaded, roughly where in the world from, and what kind of device.
          It sets no cookie, stores nothing on your device, and cannot follow
          you to another site.
        </p>
        <p>
          There is no Google Analytics here, no advertising network, no
          third-party tracking script and no pixel. We do not build a profile of
          what you look at and we have nothing to sell to anyone who would want
          one.
        </p>
        <p>
          <strong>
            This is why the site does not interrupt you with a cookie banner.
          </strong>{" "}
          The consent that a banner exists to collect is consent for tracking,
          and there is none to consent to: counting a page view without a cookie
          and without following anyone between sites is not tracking. The
          browser storage in clause 4 is functional too, holding settings you
          chose, on your own device.
        </p>
      </Clause>

      <Clause n={6} heading="Who else processes this">
        <p>
          The site runs on services we do not own. Each sees a limited part of
          what happens:
        </p>
        <ul>
          <li>
            <strong>Vercel</strong> hosts the site and receives every request to
            it, including IP addresses
          </li>
          <li>
            <strong>Supabase</strong> stores the chain-derived tables and the
            uploaded token images
          </li>
          <li>
            <strong>Alchemy</strong> and the public Robinhood Chain endpoint serve
            chain data, and see requests from the site
          </li>
          <li>
            <strong>GeckoTerminal</strong> supplies market data
          </li>
          <li>
            <strong>WalletConnect and Coinbase</strong> are contacted only if you
            choose to connect through them
          </li>
        </ul>
        <p>
          Exchange rates for the pounds and euros display are fetched by our own
          server rather than by your browser, so the rate provider never sees you
          at all. That was a deliberate choice and it is the kind of thing worth
          doing when it is this cheap.
        </p>
        <p>
          <strong>We do not sell your data, and we never will.</strong> We do not
          share it for advertising and there is no arrangement under which
          anybody pays us for it.
        </p>
      </Clause>

      <Clause n={7} heading="The blockchain part cannot be deleted">
        <p>
          Every transaction you send is recorded permanently on a public
          blockchain by design. Your address, what you traded, when, for how much,
          and any token you launched are all public forever and readable by
          anyone, whether or not they ever visit this site.
        </p>
        <p>
          <strong>
            Nobody can delete that, including us. It is not a policy choice and
            no request can change it.
          </strong>{" "}
          It is worth understanding before you decide how you want to use a
          public chain.
        </p>
        <p>
          What we can do is remove what we hold ourselves: a token image and
          description you uploaded, and the rows in our own tables. What that
          cannot do is un-publish the chain.
        </p>
      </Clause>

      <Clause n={8} heading="What you can ask us to do">
        <p>
          Under the data protection law that applies to you, you can ask us for
          a copy of what we hold about you, ask us to correct it, ask us to
          delete it, or object to us holding it. We answer those requests
          wherever you are, rather than only where we are obliged to.
        </p>
        <p>
          In practice, for this site that means the token metadata and images
          attached to a token you launched, and the rows keyed to your address in
          our own tables. Ask and we will do it.
        </p>
        <p>
          One honest limit. We cannot delete anything from the blockchain, as
          clause 7 explains.
        </p>
        <p>
          Reach us through the links in the footer. If you are not satisfied
          with how we answer, you can complain to the data protection authority
          where you live.
        </p>
      </Clause>

      <Clause n={9} heading="How long we keep it">
        <p>
          Chain-derived data is kept for as long as the site runs, because it
          describes a public chain rather than a person and its usefulness does
          not expire.
        </p>
        <p>
          Token images and descriptions are kept while the token exists, which in
          practice means indefinitely.
        </p>
        <p>
          Server logs are kept for as long as Vercel retains them under their own
          policy.
        </p>
      </Clause>

      <Clause n={10} heading="Changes, and how to reach us">
        <p>
          We update this notice when what we do changes, and the date at the top
          says when it last did. A notice that describes a system we no longer run
          would be worse than none.
        </p>
        <p>
          For anything in this notice, or to make a request under clause 8, write
          to us through the links in the footer, or read the{" "}
          <Link href="/terms">terms of use</Link> for what the service is and
          is not.
        </p>
      </Clause>
    </LegalPage>
  );
}
