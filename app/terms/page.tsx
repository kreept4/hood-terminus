import Link from "next/link";
import { LegalPage, Clause } from "@/components/legal/LegalPage";
import { BRAND } from "@/lib/brand";
import { robinhoodChain } from "@/lib/chain";


export const metadata = {
  title: "Terms of use",
  description:
    "The terms on which Hood Terminus is provided: what the software does, what the contracts do, what we never hold, and the limits of our responsibility.",
};

/**
 * Terms of use.
 *
 * The temptation with a crypto product is to write a disclaimer and call it
 * terms. That protects nobody. A blanket exclusion in a consumer-facing
 * document invites a court to strike it as unfair and take the enforceable
 * parts down with it, and liability for fraud, death and personal injury cannot
 * be excluded whatever the document says.
 *
 * So the heavy lifting happens early, in clauses 1 to 4, by defining what this
 * thing actually is: an interface to public contracts on a public chain, which
 * never takes custody of anyone's funds and cannot reverse anything. A claim
 * mostly fails because the service never promised the thing, not because a
 * clause at the bottom says it is not liable.
 *
 * Every factual assertion here is checked against the contract and the code. If
 * either changes, this page changes with it. Terms that describe a system you
 * no longer run are worse than none, because they are evidence you were told
 * what you were doing and said otherwise.
 */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="8 September 2026"
      intro="What this software does, what the contracts do, and where our responsibility begins and ends. Plain terms, because terms nobody reads protect nobody."
      summary={{
        heading: "Headnote",
        points: [
          "We are software for reading a public blockchain and sending your own transactions to it.",
          "We never hold your funds and we cannot move, freeze, refund or reverse anything.",
          "Anyone can launch a token here. A token launched here is not vetted, endorsed or checked by us.",
          "Trades cost 1% of the amount traded. Half goes to the token's creator and half to us.",
          "Most tokens go to zero. Treat every one of them as money you can afford to lose entirely.",
          "We limit our liability as far as the law allows, and no further.",
        ],
        footnote:
          "The gist, not the grounds. The numbered clauses below are what govern.",
      }}
    >
      <p>
        By using {BRAND.name} you agree to these terms. If you do not, please do
        not use the site. There is no account to create and nothing to sign:
        connecting a wallet or signing in is itself acceptance.
      </p>

      <Clause n={1} heading="What Hood Terminus is">
        <p>
          {BRAND.name} is an interface. It reads public data from {robinhoodChain.name}{" "}
          and from market data providers, presents it, and helps you build
          transactions that your own wallet signs and sends to public smart
          contracts.
        </p>
        <p>
          We are not any of the following, and nothing on the site should be read
          as suggesting otherwise:
        </p>
        <ul>
          <li>a broker, dealer, exchange, or money transmitter</li>
          <li>a custodian of your funds or of your private keys</li>
          <li>
            a provider of financial, investment, tax or legal advice, and nothing
            here is a recommendation to buy or sell anything
          </li>
          <li>
            the issuer of any token launched through the launchpad, or a party to
            any trade between you and anyone else
          </li>
        </ul>
        <p>
          <strong>
            We never take possession of your funds at any point.
          </strong>{" "}
          Every trade and every launch is a transaction sent from your wallet
          directly to a contract. We do not sit in the middle of it and could not
          stop, reverse or redirect one if we wanted to.
        </p>
      </Clause>

      <Clause n={2} heading="Your wallet is yours to keep safe">
        <p>
          You can arrive with a wallet you already have, or sign in with an email
          address, an X account or Telegram and have a wallet created for you.
          That second route is provided by Privy, and the clause on it in our{" "}
          <Link href="/privacy">privacy notice</Link> explains what they hold.
        </p>
        <p>
          Either way, the wallet is yours and its security is your
          responsibility. We cannot recover a lost key, reverse a transaction you
          signed, or help you retrieve funds sent to a wrong address. Blockchain
          transactions are final when they confirm.
        </p>
        <p>
          <strong>
            Nobody at {BRAND.name} will ever ask for your private key or your
            recovery phrase.
          </strong>{" "}
          Anyone who does is stealing from you, whatever they appear to be.
        </p>
      </Clause>

      <Clause n={3} heading="Anyone can launch a token, and we check none of them">
        <p>
          The launchpad is a public contract. Anybody holding the launch fee and
          gas can create a token through it, and they do not need our permission
          or our knowledge. We do not review, approve, audit or endorse any token
          launched this way, and the presence of a token on this site says
          nothing whatever about it.
        </p>
        <p>
          A creator chooses the name, ticker, description and image. They may
          impersonate a real company, a real person, or a token that already
          exists. They may sell everything they hold the moment other people buy.
          None of that is within our control and none of it is prevented by
          anything we do.
        </p>
        <p>
          <strong>
            Assume a token is worthless and check it yourself before you spend
            anything on it.
          </strong>{" "}
          Read the contract, look at who holds the supply, and treat a familiar
          name as a reason for more suspicion rather than less.
        </p>
      </Clause>

      <Clause n={4} heading="Market data comes from other people">
        <p>
          Prices, volumes, liquidity figures, charts and wallet rankings are
          assembled from public sources including GeckoTerminal and the chain
          itself. They can be delayed, incomplete, or wrong, and a figure on a
          screen is not a quote or an offer.
        </p>
        <p>
          Wallet performance figures are calculated by us from on-chain activity.
          They describe what an address did in the past. They are not a
          prediction and copying a wallet is not a strategy we endorse.
        </p>
      </Clause>

      <Clause n={5} heading="What it costs">
        <p>
          Creating a token costs a launch fee, which is set on the contract and
          shown on the create form before you commit. The fee can change, so the
          figure shown at the moment you launch is the one that applies.
        </p>
        <p>
          Every buy and sell on the bonding curve costs <strong>1% of the
          amount traded</strong>. That 1% is split evenly: half is credited to
          the token&rsquo;s creator, half to us. Both are credited to a balance
          on the contract and withdrawn on demand rather than paid out
          automatically.
        </p>
        <p>
          Network gas is separate, goes to the network rather than to us, and we
          neither set it nor receive it.
        </p>
      </Clause>

      <Clause n={6} heading="How the curve and graduation work">
        <p>
          A new token opens on a bonding curve rather than in a pool. The price
          rises as people buy and falls as they sell, and the contract is the
          only place it can be traded while it is on the curve. It will not
          appear on other exchanges or aggregators during this period, because no
          pool exists for them to see.
        </p>
        <p>
          When the curve has taken in its graduation threshold the token
          graduates: the contract opens a Uniswap V3 pool and moves the reserves
          into it. That threshold is set per paired asset, is held on the
          contract, and is shown on the token&rsquo;s own page in the units of
          whatever it is paired against. The
          liquidity position is minted to the contract and never withdrawn, which
          is what people mean by locked liquidity. Nobody, including us, can pull
          it out.
        </p>
        <p>
          <strong>Most tokens never graduate.</strong> A token that does not reach
          the threshold stays on the curve indefinitely, and its holders can only
          sell back to the curve.
        </p>
      </Clause>

      <Clause n={7} heading="Using the site properly">
        <p>You agree not to use {BRAND.name} to:</p>
        <ul>
          <li>
            break any law that applies to you, including sanctions, securities and
            anti-money-laundering law
          </li>
          <li>
            manipulate a market, wash trade, or launch a token to defraud the
            people who buy it
          </li>
          <li>
            impersonate a person or organisation in a token&rsquo;s name, ticker,
            image or description
          </li>
          <li>
            attack, overload or attempt to gain unauthorised access to the site or
            its infrastructure
          </li>
        </ul>
        <p>
          We can remove a token&rsquo;s image and description from our own
          interface, and we will where it is impersonation or abuse. We cannot
          remove the token, and it remains on the chain and tradeable through the
          contract whatever we display.
        </p>
        <p>
          It is your responsibility to know whether using this is lawful where you
          are. Some countries restrict or prohibit trading digital assets.
        </p>
      </Clause>

      <Clause n={8} heading="The site can change or stop">
        <p>
          We may change, suspend or discontinue any part of the interface at any
          time, and we may do so without notice. The site is provided as it is
          and as it is available. We do not promise it will be uninterrupted,
          available in your country, or free of errors.
        </p>
        <p>
          The contracts are a separate matter. They are deployed on a public
          chain and continue to exist and operate whether or not this site does.
          If this site disappeared tomorrow, tokens launched through it would
          still be there and could still be traded by anyone able to call the
          contract directly.
        </p>
      </Clause>

      <Clause n={9} heading="Risk, stated plainly">
        <p>
          Digital assets are volatile and speculative. The tokens launched here
          are memecoins with no underlying business, no revenue and no
          intrinsic value.
        </p>
        <p>
          <strong>
            You should expect to lose everything you put in, and you should only
            ever put in what you can afford to lose entirely.
          </strong>{" "}
          Most tokens of this kind go to zero. Past performance of any token,
          wallet or strategy tells you nothing about what happens next.
        </p>
        <p>
          Nothing on this site is a recommendation, and nothing here takes account
          of your circumstances, your finances or your objectives. If you want
          advice, get it from someone licensed to give it.
        </p>
      </Clause>

      <Clause n={10} heading="Limits on our liability">
        <p>
          Nothing in these terms limits or excludes our liability for death or
          personal injury caused by our negligence, for fraud or fraudulent
          misrepresentation, or for anything else that cannot lawfully be limited
          or excluded. The rest of this clause is subject to that.
        </p>
        <p>
          Subject to the paragraph above, we are not liable for losses arising
          from:
        </p>
        <ul>
          <li>
            the value of any token going up or down, or going to zero
          </li>
          <li>
            the conduct of a token creator or of any other user
          </li>
          <li>
            transactions you signed, including those sent to a wrong address
          </li>
          <li>
            errors, delays or gaps in third-party market data
          </li>
          <li>
            failures of the chain, of a wallet provider, or of any other service
            we do not run
          </li>
          <li>
            loss of a private key, a recovery phrase, or access to a wallet
          </li>
        </ul>
        <p>
          Where we are liable to you despite the above, our total liability is
          limited to the fees we actually received from you in the three months
          before the claim arose.
        </p>
      </Clause>

      <Clause n={11} heading="Changes to these terms">
        <p>
          We may update these terms. The date at the top says when they last
          changed, and continuing to use the site after a change means you accept
          the updated version. Where a change is significant we will say so on
          the site rather than rely on you noticing the date.
        </p>
      </Clause>

      <Clause n={12} heading="General">
        <p>
          Nothing in these terms takes away rights you have under the law where
          you live that cannot be contracted out of, including any consumer
          rights and any right to bring a claim in your local courts.
        </p>
        <p>
          If any part of these terms is found unenforceable, that part is severed
          and the rest continues to apply. If we do not enforce a term
          immediately, that is not a waiver of it.
        </p>
        <p>
          These terms are the whole agreement between us about the site, and they
          replace anything said elsewhere about it.
        </p>
      </Clause>
    </LegalPage>
  );
}
