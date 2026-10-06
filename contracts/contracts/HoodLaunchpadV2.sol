// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {HoodToken} from "./HoodToken.sol";
import {IUniswapV3Factory, IUniswapV3Pool, IWETH9} from "./IUniswapV3.sol";

/**
 * The three ERC20 methods this contract calls on a quote asset.
 *
 * Declared with return values so the selectors are right, but every call site
 * goes through `_pay` or `_pull`, which tolerate a token that returns nothing.
 * A surprising number do, and a plain interface call against one of those
 * reverts on decoding a boolean that was never there.
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * The launchpad.
 *
 * A creator launches a token with nothing up front. The token opens on a
 * bonding curve holding no liquidity: buyers send ETH, the curve prices and
 * sells them tokens, and the ETH accumulates inside this contract. Once the
 * curve has taken in its graduation amount, the token is finished here and its
 * reserves are released for a real pool.
 *
 * ── The curve ──────────────────────────────────────────────────────────────
 *
 * Constant product, seeded with virtual reserves:
 *
 *     (virtualEth + realEth) * tokenReserve = k
 *
 * Virtual reserves are what let a curve open with zero liquidity and still
 * quote a finite price for the first buyer. Without them the first purchase
 * would be priced against a zero reserve, which is a division by zero at best
 * and a free supply at worst.
 *
 * The curve only ever sells from a fixed allocation, so it cannot mint, and it
 * only ever pays out ETH it has actually received, so it cannot become
 * insolvent. Both properties are asserted in the invariant tests.
 *
 * ── Fees ───────────────────────────────────────────────────────────────────
 *
 * Two, and both are stated on the page that charges them:
 *
 *   1. A flat `launchFee` at deploy time, which is the platform's.
 *   2. `TRADE_FEE_BPS` on every buy and sell, split between the token's creator
 *      and the platform on `creatorShareBps`. That figure is the one thing here
 *      the owner can change afterwards, and it cannot be taken below
 *      `MIN_CREATOR_SHARE_BPS`.
 *
 * Fees are credited to a balance and withdrawn on demand rather than pushed on
 * every trade. Pushing ETH inside a swap hands control to whatever the
 * recipient's fallback does, which is a reentrancy surface bought for nothing.
 *
 * ── What version two adds ──────────────────────────────────────────────────
 *
 * 1. A token can be paired against something other than ETH. The quote asset
 *    is chosen at launch and every reserve, price and payout for that token is
 *    denominated in it.
 *
 *    Only assets the owner has allowed can be chosen. That allowlist is a
 *    safety mechanism rather than a curation one: a fee-on-transfer or
 *    rebasing token silently breaks reserve accounting, because the contract
 *    would credit a trader for more than it actually received. There is no way
 *    to detect that cheaply at runtime, so the answer is to decide in advance
 *    which assets behave.
 *
 * 2. A creator can charge their own tax on trades of their token, up to
 *    `MAX_CREATOR_TAX_BPS`. It is taken alongside the platform fee, it is
 *    fixed at launch, and it cannot be raised afterwards. A tax that could be
 *    changed later is a rug with extra steps.
 *
 * Fees are now owed per asset rather than per account, because a creator with
 * two tokens paired against two different assets is owed two different things.
 *
 * ── What this contract is not ──────────────────────────────────────────────
 *
 * It has not been audited. It should run on testnet 46630 with real
 * transactions before it ever holds a stranger's money on mainnet.
 */
contract HoodLaunchpadV2 {
    // ── Curve shape ────────────────────────────────────────────────────────

    /// Tokens the curve is allowed to sell. The rest is reserved for the pool.
    uint256 public constant CURVE_SUPPLY = 800_000_000e18;

    /// Held back for the pool created at graduation.
    uint256 public constant POOL_SUPPLY = 200_000_000e18;

    uint256 public constant TOTAL_SUPPLY = CURVE_SUPPLY + POOL_SUPPLY;

    /**
     * Virtual ETH reserve. Sets the opening price and how fast it climbs.
     *
     * At 1.5 ETH virtual against 800M tokens the first buyer pays roughly
     * 1.9 gwei per token, and the curve fills at 3 ETH.
     */
    /** The virtual reserve native ETH is configured with at deployment. */
    uint256 public constant VIRTUAL_ETH = 1.5 ether;

    /**
     * The most a creator may charge on trades of their own token.
     *
     * Nine percent, and fixed at launch. Two separate reasons for the cap:
     * above roughly ten percent the sniper bots that give a new token its first
     * volume stop picking it up, and a tax large enough to matter is
     * indistinguishable to a buyer from the token simply being worse.
     */
    uint16 public constant MAX_CREATOR_TAX_BPS = 900;

    /**
     * ETH taken in before the curve is done.
     *
     * Four ETH, roughly ten thousand dollars at the price this was set at.
     *
     * This is the single biggest lever on revenue in the contract, bigger than
     * the fee rate. Fees accrue only while a token is on the curve: once it
     * graduates it moves to a real pool and earns the platform nothing. So this
     * number decides how much of a successful token's life is captured here.
     *
     * The trade is that a higher bar means a token spends longer without a
     * public market, which is worse for a launch that catches on quickly.
     */
    uint256 public constant GRADUATION_ETH = 4 ether;

    /**
     * Both of the above are now only the defaults for native ETH, written into
     * `quotes[address(0)]` by the constructor. Every other asset carries its
     * own pair of figures, because four of something is not four of everything.
     */

    // ── Fees ───────────────────────────────────────────────────────────────

    /// 1% on every trade, in basis points.
    uint16 public constant TRADE_FEE_BPS = 100;

    /**
     * The creator's share of that fee, in basis points of the fee itself.
     *
     * Sixty percent, and the only number on this contract the owner can move
     * after deployment. The split is a market position rather than a safety
     * property: what it costs to attract creators is not knowable in advance
     * and will not hold still. Frozen in bytecode it took a redeploy to change
     * one number, and a redeploy strands every curve already holding money.
     *
     * `MIN_CREATOR_SHARE_BPS` is what makes that lever safe to have. The owner
     * can raise the creator's cut to the whole fee and can lower it only as far
     * as the floor, so the worst a creator faces is a published figure they can
     * read before they launch, not a number decided behind them afterwards.
     *
     * A change applies from that moment on, to every token on the curve at
     * once. Snapshotting it per launch would pin each token to the split it
     * opened under, at the cost of a slot per launch and a second figure to
     * explain on the page; the floor is what makes that unnecessary.
     */
    uint16 public creatorShareBps;

    /// The floor `creatorShareBps` can never go below. Half, as version one paid.
    uint16 public constant MIN_CREATOR_SHARE_BPS = 5_000;

    uint16 private constant BPS = 10_000;

    // ── State ──────────────────────────────────────────────────────────────

    /**
     * What a token may be paired against, and on what terms.
     *
     * `virtualReserve` and `graduation` cannot be constants any more. Four ETH
     * is a meaningful bar; four units of a six-decimal stablecoin is four
     * dollars, and four units of an eighteen-decimal one is four dollars
     * written very differently. Both numbers are properties of the asset, so
     * they are stored with it.
     */
    struct Quote {
        bool allowed;
        /// Opens the curve at a finite price. Denominated in the quote asset.
        uint128 virtualReserve;
        /// What the curve must take in before the token graduates.
        uint128 graduation;
    }

    /** Keyed by quote asset. `address(0)` is the chain's native coin. */
    mapping(address => Quote) public quotes;

    struct Launch {
        address creator;
        /**
         * What this token trades against. `address(0)` means native ETH.
         *
         * Fixed at launch and never changed. Every reserve, quote and payout
         * for this token is denominated in it.
         */
        address quote;
        /// Quote asset actually paid in, net of fees. Excludes virtual reserve.
        uint128 quoteReserve;
        /// Tokens the curve still holds.
        uint128 tokenReserve;
        /// The creator's own tax, in basis points. Fixed at launch.
        uint16 creatorTaxBps;
        bool graduated;
    }

    address public owner;
    uint256 public launchFee;

    /**
     * Wrapped ETH on this chain, once it is known.
     *
     * Zero until set. Robinhood Chain is an Arbitrum Orbit chain and its WETH
     * is not at the address the OP stack uses, so this cannot be a constant
     * written from memory. Withdrawing as WETH reverts while it is unset rather
     * than sending ETH to address zero.
     */
    address public weth;

    /**
     * Uniswap V3, for the pool a graduating token moves into.
     *
     * Set at construction rather than hardcoded. The canonical V3 factory
     * address holds something else entirely on this chain, so the correct one
     * has to be passed in and can be re-pointed if the chain's deployment ever
     * moves.
     */
    address public immutable v3Factory;

    /**
     * The fee tier graduated pools open at.
     *
     * One percent. The standard tier for a volatile pair: 0.3% is for majors
     * and 0.05% for stables, and a token four hours old is neither. Too low a
     * tier hands the spread to arbitrage rather than to liquidity providers.
     */
    uint24 public constant POOL_FEE = 10_000;

    /**
     * Full range, at the 1% tier's spacing of 200.
     *
     * A concentrated position would earn more fees and would need managing.
     * Nobody is going to manage this one: it is seeded once, at graduation, and
     * left alone forever. Full range is the position that cannot go out of
     * range and cannot be abandoned in the wrong place.
     */
    int24 internal constant TICK_LOWER = -887_200;
    int24 internal constant TICK_UPPER = 887_200;

    /** Where a graduated pool's LP position lives. */
    mapping(address => address) public graduatedPool;

    mapping(address => Launch) public launches;

    /**
     * What an account is owed, per asset.
     *
     * Was a single balance per account, which stopped being enough the moment
     * two tokens could settle in two different assets: a creator owed both
     * would have had them added together into a number that means nothing.
     */
    mapping(address => mapping(address => uint256)) public feesOwed;

    address[] public allTokens;

    event Launched(
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        address quote,
        uint16 creatorTaxBps
    );
    /** Emitted when the earning wallet is not the launching wallet. */
    event FeeRecipientSet(address indexed token, address indexed recipient);
    event QuoteSet(
        address indexed asset,
        bool allowed,
        uint128 virtualReserve,
        uint128 graduation
    );
    event Bought(
        address indexed token,
        address indexed buyer,
        uint256 amountIn,
        uint256 tokensOut
    );
    event Sold(
        address indexed token,
        address indexed seller,
        uint256 tokensIn,
        uint256 amountOut
    );
    event Graduated(address indexed token, uint256 quoteReserve, uint256 tokens);
    /** The token now has a real market that aggregators can see. */
    event PoolCreated(
        address indexed token,
        address indexed pool,
        uint256 ethSeeded,
        uint256 tokensSeeded
    );
    /** The split moved. Emitted so the page can show the current figure. */
    event CreatorShareSet(uint16 bps);
    event FeesWithdrawn(
        address indexed to,
        address indexed asset,
        uint256 amount
    );

    error NotOwner();
    error WrongLaunchFee();
    error UnknownToken();
    error AlreadyGraduated();
    error NothingIn();
    error SlippageExceeded();
    error CurveExhausted();
    error NothingOwed();
    error TransferFailed();
    error Reentrancy();
    error EmptyString();
    error BadCreatorShare();

    uint256 private locked = 1;

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 _launchFee, address _weth, address _v3Factory) {
        owner = msg.sender;
        launchFee = _launchFee;
        creatorShareBps = 6_000;
        weth = _weth;
        v3Factory = _v3Factory;

        /**
         * Native ETH is allowed from the start, on the terms version one used.
         *
         * Everything else is added deliberately by the owner. A launchpad that
         * accepted any asset as a pairing would accept fee-on-transfer and
         * rebasing tokens, and both of those break reserve accounting in ways
         * that cost the last seller rather than the person who chose them.
         */
        quotes[address(0)] = Quote({
            allowed: true,
            virtualReserve: uint128(VIRTUAL_ETH),
            graduation: uint128(GRADUATION_ETH)
        });
        emit QuoteSet(address(0), true, uint128(VIRTUAL_ETH), uint128(GRADUATION_ETH));
    }

    /**
     * Allows an asset to be paired against, or withdraws that permission.
     *
     * Both figures are the asset's own units. For a six-decimal stablecoin a
     * graduation of ten thousand dollars is `10_000e6`, not `10_000e18`, and
     * getting that wrong is the difference between a curve that fills in an
     * afternoon and one that fills on the first buy.
     *
     * Disallowing an asset stops new launches against it. Tokens already
     * launched keep trading: their reserves are already denominated in it, and
     * freezing them would strand the money of people who had no say in it.
     */
    function setQuote(
        address asset,
        bool allowed,
        uint128 virtualReserve,
        uint128 graduation
    ) external onlyOwner {
        if (allowed && (virtualReserve == 0 || graduation == 0)) {
            revert BadQuoteConfig();
        }
        quotes[asset] = Quote({
            allowed: allowed,
            virtualReserve: virtualReserve,
            graduation: graduation
        });
        emit QuoteSet(asset, allowed, virtualReserve, graduation);
    }

    // ── Launching ──────────────────────────────────────────────────────────

    /**
     * Deploys a token and opens its curve.
     *
     * Any ETH sent above the launch fee is treated as the creator's own first
     * buy, which is the common case: a creator who wants a position takes it in
     * the same transaction rather than racing the first sniper for it.
     *
     * `feeRecipient` is who the creator's half of every trade fee accrues to.
     * Zero means the caller, which is what almost everyone wants. It exists for
     * the cases where the launching wallet should not be the earning wallet: a
     * hot wallet launching on behalf of a cold one, or a team splitting through
     * a multisig. Set once, at launch, and never changeable afterwards, because
     * a mutable fee recipient is a lever for taking someone else's earnings.
     */
    function launch(
        string calldata name,
        string calldata symbol,
        address feeRecipient,
        address quote,
        uint16 creatorTaxBps
    ) external payable nonReentrant returns (address token) {
        if (bytes(name).length == 0 || bytes(symbol).length == 0) {
            revert EmptyString();
        }
        if (msg.value < launchFee) revert WrongLaunchFee();
        if (!quotes[quote].allowed) revert QuoteNotAllowed();
        if (creatorTaxBps > MAX_CREATOR_TAX_BPS) revert TaxTooHigh();

        token = address(new HoodToken(name, symbol, TOTAL_SUPPLY, address(this)));

        launches[token] = Launch({
            creator: feeRecipient == address(0) ? msg.sender : feeRecipient,
            quote: quote,
            quoteReserve: 0,
            tokenReserve: uint128(CURVE_SUPPLY),
            creatorTaxBps: creatorTaxBps,
            graduated: false
        });
        allTokens.push(token);

        // The launch fee is always native, whatever the token trades against.
        feesOwed[owner][address(0)] += launchFee;
        emit Launched(token, launches[token].creator, name, symbol, quote, creatorTaxBps);
        if (feeRecipient != address(0) && feeRecipient != msg.sender) {
            emit FeeRecipientSet(token, feeRecipient);
        }

        /**
         * The creator's own first buy, from whatever they sent above the fee.
         *
         * Only possible on a natively paired token. Buying an ERC20-paired one
         * in the same transaction would need an allowance and a `transferFrom`
         * of an amount the caller never named, so that path is a separate call
         * they make deliberately.
         */
        uint256 remainder = msg.value - launchFee;
        if (remainder > 0) {
            if (quote != address(0)) revert QuoteMismatch();
            _buy(token, remainder, 0, msg.sender);
        }
    }

    // ── Trading ────────────────────────────────────────────────────────────

    /** Buying a token paired against the chain's native coin. */
    function buy(address token, uint256 minTokensOut)
        external
        payable
        nonReentrant
    {
        if (launches[token].quote != address(0)) revert QuoteMismatch();
        _buy(token, msg.value, minTokensOut, msg.sender);
    }

    /**
     * Buying a token paired against an ERC20.
     *
     * The amount is pulled here rather than in `_buy`, and the balance is
     * measured either side of the pull rather than trusted. An asset that
     * takes a cut on transfer would otherwise have the curve credit the trader
     * for more than it received, and the shortfall comes out of whoever sells
     * last. The allowlist is meant to keep such assets out; this measures
     * anyway, because the cost of being wrong is somebody else's money.
     */
    function buyWithQuote(address token, uint256 amountIn, uint256 minTokensOut)
        external
        nonReentrant
    {
        address quote = launches[token].quote;
        if (quote == address(0)) revert QuoteMismatch();
        if (amountIn == 0) revert NothingIn();

        uint256 before = IERC20(quote).balanceOf(address(this));
        _pull(quote, msg.sender, amountIn);
        uint256 received = IERC20(quote).balanceOf(address(this)) - before;
        if (received == 0) revert NothingIn();

        _buy(token, received, minTokensOut, msg.sender);
    }

    function _buy(
        address token,
        uint256 amountIn,
        uint256 minTokensOut,
        address to
    ) private {
        Launch storage l = launches[token];
        if (l.creator == address(0)) revert UnknownToken();
        if (l.graduated) revert AlreadyGraduated();
        if (amountIn == 0) revert NothingIn();

        (uint256 platformFee, uint256 creatorTax) = _fees(amountIn, l.creatorTaxBps);
        uint256 net = amountIn - platformFee - creatorTax;

        uint256 tokensOut = _tokensForQuote(l, net);
        if (tokensOut == 0) revert CurveExhausted();
        if (tokensOut > l.tokenReserve) tokensOut = l.tokenReserve;
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        l.quoteReserve += uint128(net);
        l.tokenReserve -= uint128(tokensOut);

        _creditFee(l.creator, l.quote, platformFee, creatorTax);

        HoodToken(token).transfer(to, tokensOut);
        emit Bought(token, to, amountIn, tokensOut);

        if (l.quoteReserve >= quotes[l.quote].graduation) {
            l.graduated = true;
            emit Graduated(token, l.quoteReserve, POOL_SUPPLY);
        }
    }

    function sell(address token, uint256 tokensIn, uint256 minAmountOut)
        external
        nonReentrant
    {
        Launch storage l = launches[token];
        if (l.creator == address(0)) revert UnknownToken();
        if (l.graduated) revert AlreadyGraduated();
        if (tokensIn == 0) revert NothingIn();

        uint256 gross = _quoteForTokens(l, tokensIn);
        (uint256 platformFee, uint256 creatorTax) = _fees(gross, l.creatorTaxBps);
        uint256 out = gross - platformFee - creatorTax;
        if (out < minAmountOut) revert SlippageExceeded();

        // Taken before the payout, so the contract can never owe more of the
        // quote asset than it holds even if the curve maths were wrong.
        l.quoteReserve -= uint128(gross);
        l.tokenReserve += uint128(tokensIn);

        _creditFee(l.creator, l.quote, platformFee, creatorTax);

        HoodToken(token).transferFrom(msg.sender, address(this), tokensIn);

        _pay(l.quote, msg.sender, out);

        emit Sold(token, msg.sender, tokensIn, out);
    }

    // ── Quotes ─────────────────────────────────────────────────────────────

    /**
     * What a buy would return right now, both fees included. For the UI.
     *
     * The creator tax is taken out here as well as the platform fee. A quote
     * that ignored it would be optimistic by up to nine percent, which is the
     * difference between a slippage guard that protects a trader and one that
     * fails their transaction for no reason they can see.
     */
    function quoteBuy(address token, uint256 amountIn)
        external
        view
        returns (uint256 tokensOut)
    {
        Launch memory l = launches[token];
        if (l.creator == address(0) || l.graduated || amountIn == 0) return 0;
        (uint256 platformFee, uint256 creatorTax) = _fees(amountIn, l.creatorTaxBps);
        tokensOut = _tokensForQuote(l, amountIn - platformFee - creatorTax);
        if (tokensOut > l.tokenReserve) tokensOut = l.tokenReserve;
    }

    /// What a sell would return right now, both fees included. For the UI.
    function quoteSell(address token, uint256 tokensIn)
        external
        view
        returns (uint256 amountOut)
    {
        Launch memory l = launches[token];
        if (l.creator == address(0) || l.graduated || tokensIn == 0) return 0;
        uint256 gross = _quoteForTokens(l, tokensIn);
        (uint256 platformFee, uint256 creatorTax) = _fees(gross, l.creatorTaxBps);
        amountOut = gross - platformFee - creatorTax;
    }

    // ── Curve maths ────────────────────────────────────────────────────────
    //
    // Constant product against virtual reserves, k = (virtual + real) * tokens.
    //
    // Every division rounds UP, which means every result is rounded against the
    // trader and in favour of the pool. That is not a nicety. With floor
    // division the remaining reserve is truncated downward on a buy, so the
    // buyer receives fractionally more tokens than exact maths allows; selling
    // those back then computes a payout fractionally larger than what was paid
    // in. Repeated, it drains the curve, and at the boundary it underflows
    // `quoteReserve` outright.
    //
    // A fuzz run found it on the fourteenth input. Rounding direction in an AMM
    // is not a detail, it is the whole safety property.

    // ── Moving assets ──────────────────────────────────────────────────────

    /**
     * Pays `to` in `asset`, native or ERC20.
     *
     * Both branches check the outcome. A native send can fail on a recipient
     * with a reverting fallback, and plenty of ERC20s return nothing at all
     * rather than a boolean, so a bare `transfer` call would appear to succeed
     * against a token that had done nothing.
     */
    function _pay(address asset, address to, uint256 amount) private {
        if (amount == 0) return;

        if (asset == address(0)) {
            (bool ok, ) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
            return;
        }

        (bool sent, bytes memory data) = asset.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!sent || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    /** Pulls `amount` of an ERC20 from `from`, tolerating a silent token. */
    function _pull(address asset, address from, uint256 amount) private {
        (bool sent, bytes memory data) = asset.call(
            abi.encodeWithSelector(
                IERC20.transferFrom.selector, from, address(this), amount
            )
        );
        if (!sent || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    /// Ceiling division. Reverts on a zero denominator like any division would.
    function _divUp(uint256 a, uint256 b) private pure returns (uint256) {
        return a == 0 ? 0 : ((a - 1) / b) + 1;
    }

    function _tokensForQuote(Launch memory l, uint256 amountIn)
        private
        view
        returns (uint256)
    {
        uint256 reserve = quotes[l.quote].virtualReserve + l.quoteReserve;
        uint256 k = reserve * l.tokenReserve;
        // Rounded up, so the reserve left behind is never understated and the
        // buyer never receives the rounding.
        uint256 newTokens = _divUp(k, reserve + amountIn);
        if (newTokens > l.tokenReserve) return 0;
        return l.tokenReserve - newTokens;
    }

    function _quoteForTokens(Launch memory l, uint256 tokensIn)
        private
        view
        returns (uint256)
    {
        uint256 reserve = quotes[l.quote].virtualReserve + l.quoteReserve;
        uint256 k = reserve * l.tokenReserve;
        // Rounded up for the same reason, so the payout is never overstated.
        uint256 newReserve = _divUp(k, l.tokenReserve + tokensIn);
        if (newReserve >= reserve) return 0;
        uint256 gross = reserve - newReserve;
        // The virtual reserve is not real money. A payout can never exceed what
        // the curve has actually taken in, whatever the maths says.
        return gross > l.quoteReserve ? l.quoteReserve : gross;
    }

    // ── Fees ───────────────────────────────────────────────────────────────

    /**
     * What a trade of `amount` costs, split into the two things it pays for.
     *
     * The platform fee is unchanged at 1%, and the creator's tax is charged on
     * top of it rather than carved out of it. Carving it out would mean a
     * creator raising their tax quietly reduced the platform's share, which
     * makes one party's setting the other party's problem.
     */
    function _fees(uint256 amount, uint16 creatorTaxBps)
        private
        pure
        returns (uint256 platformFee, uint256 creatorTax)
    {
        platformFee = (amount * TRADE_FEE_BPS) / BPS;
        creatorTax = creatorTaxBps == 0 ? 0 : (amount * creatorTaxBps) / BPS;
    }

    /**
     * Credits both fees, in the asset the trade settled in.
     *
     * The platform fee still splits evenly with the creator. The creator's own
     * tax is theirs entirely, which is the whole point of it.
     */
    function _creditFee(
        address creator,
        address asset,
        uint256 platformFee,
        uint256 creatorTax
    ) private {
        if (platformFee > 0) {
            uint256 creatorCut = (platformFee * creatorShareBps) / BPS;
            feesOwed[creator][asset] += creatorCut;
            feesOwed[owner][asset] += platformFee - creatorCut;
        }
        if (creatorTax > 0) {
            feesOwed[creator][asset] += creatorTax;
        }
    }

    /**
     * Pulls whatever the caller is owed.
     *
     * Pull, not push: paying out inside a trade would hand control to the
     * recipient's fallback mid-swap. Zeroed before the transfer so a
     * reentrant call finds nothing left, on top of the guard.
     */
    function withdrawFees(address asset) public nonReentrant {
        uint256 amount = feesOwed[msg.sender][asset];
        if (amount == 0) revert NothingOwed();
        feesOwed[msg.sender][asset] = 0;

        _pay(asset, msg.sender, amount);

        emit FeesWithdrawn(msg.sender, asset, amount);
    }

    /**
     * Takes fees as the creator's own token instead of ETH.
     *
     * Spends everything owed through that token's curve and sends the tokens
     * out. For a creator this is the difference between collecting fees and
     * compounding them: the ETH their token earned goes straight back into it,
     * in one transaction, at the curve price rather than at whatever a market
     * order would cost.
     *
     * Routed through the same `_buy` as any other purchase, so it pays the same
     * trade fee, moves the price the same way, and can graduate the curve like
     * anyone else's buy. A privileged path that skipped those would be a way
     * for a creator to accumulate below market.
     *
     * One consequence worth stating: because the withdrawal is itself a trade,
     * it pays the trade fee, and half of that fee belongs to the creator. So a
     * creator who withdraws everything is left owed a small rebate on their own
     * purchase rather than exactly zero. That is correct, not a rounding leak,
     * and it converges to nothing on repeat.
     */
    function withdrawFeesAsToken(address token, uint256 minTokensOut)
        external
        nonReentrant
    {
        Launch storage l = launches[token];
        if (l.creator == address(0)) revert UnknownToken();
        if (l.graduated) revert AlreadyGraduated();

        /**
         * Spends the balance held in that token's own quote asset.
         *
         * Fees are owed per asset now, so compounding has to spend the right
         * one. Buying a USDG-paired token with an ETH balance would credit the
         * curve with reserves the contract never received in that asset.
         */
        address asset = l.quote;
        uint256 amount = feesOwed[msg.sender][asset];
        if (amount == 0) revert NothingOwed();

        // Zeroed first. The buy moves value between internal balances rather
        // than out of the contract, so leaving it set would credit it twice.
        feesOwed[msg.sender][asset] = 0;
        _buy(token, amount, minTokensOut, msg.sender);
    }

    /**
     * Takes fees as WETH rather than ETH.
     *
     * Useful because a fee balance in WETH is immediately usable in a pool or a
     * router without a wrapping step. Reverts rather than guessing while the
     * WETH address is unset.
     */
    function withdrawFeesAsWeth() external nonReentrant {
        address token = weth;
        if (token == address(0)) revert WethNotSet();

        // Wraps the native balance specifically. An ERC20 balance is already
        // a token and has nothing to wrap.
        uint256 amount = feesOwed[msg.sender][address(0)];
        if (amount == 0) revert NothingOwed();
        feesOwed[msg.sender][address(0)] = 0;

        // deposit() then transfer. Both checked: a silent failure here would
        // burn the caller's balance.
        (bool wrapped, ) = token.call{value: amount}(
            abi.encodeWithSignature("deposit()")
        );
        if (!wrapped) revert WrapFailed();

        (bool sent, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount)
        );
        if (!sent || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }

        emit FeesWithdrawn(msg.sender, token, amount);
    }

    // ── Graduation ─────────────────────────────────────────────────────────

    /**
     * Moves a filled curve into a real Uniswap pool.
     *
     * This is what makes a launched token exist to the rest of the world.
     * Aggregators do not watch this contract; they watch DEX factories for pool
     * creation and then follow swaps. Until a pool exists, a token here is
     * invisible on GeckoTerminal, on DexScreener, and on any screener that
     * reads them. Creating the pool is not a nicety at the end of the
     * lifecycle, it is the point of the lifecycle.
     *
     * ── Why this is a separate transaction ─────────────────────────────────
     *
     * The obvious design runs this inside the buy that fills the curve. It was
     * built that way first and it is wrong: measured against the real factory,
     * creating, initialising and minting into a V3 pool costs 5,083,530 gas.
     * Bolting that onto a trade charges whoever happens to cross the threshold
     * roughly five million gas for a pool the whole market benefits from, and
     * makes their trade fail outright if they did not send enough.
     *
     * So graduation stops trading and this opens the market, and anyone may
     * call it. There is nothing to choose: the token, the reserves and the fee
     * tier are all fixed by then, so the only thing a caller supplies is the
     * gas. In practice the product calls it seconds after graduation, and if it
     * ever fails to, an arbitrageur wanting to trade the new pool has every
     * reason to do it instead.
     *
     * The LP position is minted to this contract and never withdrawn, which is
     * the on-chain form of locked liquidity. Nobody, the owner included, has a
     * path to pull it.
     */
    function finalisePool(address token) external nonReentrant {
        Launch storage l = launches[token];
        if (l.creator == address(0)) revert UnknownToken();
        if (!l.graduated) revert NotGraduated();
        if (graduatedPool[token] != address(0)) revert PoolExists();
        // Only a natively paired curve needs WETH; the rest pair as themselves.
        if (l.quote == address(0) && weth == address(0)) revert WethNotSet();
        if (v3Factory == address(0)) revert FactoryNotSet();

        _openPool(token, l.quote, l.quoteReserve);
    }

    /**
     * Creates the pool, sets its opening price, and mints the liquidity.
     *
     * The opening price is not chosen, it is inherited. The curve's final
     * reserves are what the last buyer paid, so seeding the pool at any other
     * price would hand the first trader a free gap to close. Price continuity
     * across graduation is the whole point of seeding from the reserves.
     *
     * Order matters in one place: `graduatedPool` is written before `mint`,
     * because the mint callback fires during that call and authenticates the
     * caller by reading it. Written after, every mint would revert.
     */
    function _openPool(address token, address quote, uint256 quoteAmount) private {
        /**
         * A pool needs two ERC20s, so a natively paired curve wraps on the way
         * in. Anything else is already a token and is paired as itself, which
         * is what makes a USDG or NVDA pairing come out the far side of
         * graduation as a real USDG or NVDA market.
         */
        address paired = quote == address(0) ? weth : quote;

        address pool = IUniswapV3Factory(v3Factory).getPool(token, paired, POOL_FEE);
        if (pool == address(0)) {
            pool = IUniswapV3Factory(v3Factory).createPool(token, paired, POOL_FEE);
        }
        if (pool == address(0)) revert PoolCreationFailed();

        graduatedPool[token] = pool;

        if (quote == address(0)) {
            // The curve held plain ETH; a pool only understands WETH.
            IWETH9(paired).deposit{value: quoteAmount}();
        }

        // Uniswap orders a pair by address, not by which asset is the money.
        bool tokenIsZero = token < paired;
        uint256 amount0 = tokenIsZero ? POOL_SUPPLY : quoteAmount;
        uint256 amount1 = tokenIsZero ? quoteAmount : POOL_SUPPLY;

        uint160 sqrtPriceX96 = _sqrtPriceX96(amount0, amount1);
        if (sqrtPriceX96 == 0) revert PoolCreationFailed();

        // A freshly created pool needs a price; one that somehow already had
        // one keeps it. Either way there is a price after this.
        try IUniswapV3Pool(pool).initialize(sqrtPriceX96) {} catch {}

        uint128 liquidity = _liquidityFor(amount0, amount1, sqrtPriceX96);
        if (liquidity == 0) revert PoolCreationFailed();

        (uint256 used0, uint256 used1) = IUniswapV3Pool(pool).mint(
            address(this), TICK_LOWER, TICK_UPPER, liquidity, abi.encode(token)
        );

        emit PoolCreated(
            token,
            pool,
            tokenIsZero ? used1 : used0,
            tokenIsZero ? used0 : used1
        );
    }

    /**
     * Uniswap pulls what it is owed here rather than being pushed.
     *
     * Only a pool this contract created may call it, checked by asking the
     * factory. Without that check anyone could call this and drain the
     * contract's balances by pretending to be a pool.
     */
    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external {
        address token = abi.decode(data, (address));
        if (msg.sender != graduatedPool[token]) revert NotOwner();

        address t0 = IUniswapV3Pool(msg.sender).token0();
        address t1 = IUniswapV3Pool(msg.sender).token1();

        if (amount0Owed > 0) _payPool(t0, msg.sender, amount0Owed);
        if (amount1Owed > 0) _payPool(t1, msg.sender, amount1Owed);
    }

    function _payPool(address asset, address pool, uint256 amount) private {
        (bool ok, bytes memory ret) = asset.call(
            abi.encodeWithSignature("transfer(address,uint256)", pool, amount)
        );
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) {
            revert TransferFailed();
        }
    }

    /**
     * sqrt(amount1 / amount0) in Q64.96, which is how a V3 pool states price.
     *
     * Babylonian iteration rather than a library. It converges in well under
     * the iterations allowed for any input this contract can produce, and the
     * alternative is importing a maths package for one square root.
     */
    function _sqrtPriceX96(uint256 amount0, uint256 amount1)
        internal
        pure
        returns (uint160)
    {
        if (amount0 == 0 || amount1 == 0) return 0;

        // The obvious form is sqrt((amount1 << 192) / amount0), and it is
        // wrong. With a two hundred million token supply at eighteen decimals,
        // `amount1 << 192` is about 1.26e84 against a uint256 ceiling of
        // 1.16e77. Solidity does not check shifts, so it truncates in silence
        // and every number downstream is nonsense.
        //
        // A fork test caught it: the pool was seeded with thirteen tokens
        // instead of two hundred million, and nothing reverted.
        //
        // Splitting the shift is exact and cannot overflow:
        //
        //     sqrt(x * 2^192 / y)  ==  sqrt(x * 2^96 / y) * 2^48
        //
        // and `amount1 << 96` is about 1.58e55, which fits with room to spare.
        uint256 ratio = (amount1 << 96) / amount0;
        uint256 root = _sqrt(ratio) << 48;

        return root > type(uint160).max ? type(uint160).max : uint160(root);
    }

    /**
     * Liquidity for a full-range position, from the smaller of what each side
     * supports.
     *
     * Taking the minimum is what stops the mint callback asking for more of
     * either asset than this contract holds.
     */
    function _liquidityFor(uint256 amount0, uint256 amount1, uint160 sqrtPriceX96)
        internal
        pure
        returns (uint128)
    {
        if (sqrtPriceX96 == 0) return 0;

        // Full range, so the bounds are effectively zero and infinity and the
        // usual tick maths collapses to these two.
        uint256 fromToken0 = (amount0 * sqrtPriceX96) >> 96;
        uint256 fromToken1 = (amount1 << 96) / sqrtPriceX96;

        uint256 liquidity = fromToken0 < fromToken1 ? fromToken0 : fromToken1;
        // A hair under, so rounding in the pool's own maths cannot ask for more
        // than was set aside.
        liquidity = (liquidity * 999) / 1000;

        return liquidity > type(uint128).max
            ? type(uint128).max
            : uint128(liquidity);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    // ── Views ──────────────────────────────────────────────────────────────

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    /// How far along the curve is, in basis points. For the progress bar.
    function progressBps(address token) external view returns (uint256) {
        Launch memory l = launches[token];
        if (l.creator == address(0)) return 0;
        if (l.graduated) return BPS;
        uint256 target = quotes[l.quote].graduation;
        if (target == 0) return 0;
        return (uint256(l.quoteReserve) * BPS) / target;
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    function setLaunchFee(uint256 next) external onlyOwner {
        launchFee = next;
    }

    /**
     * Move the creator's share of the trade fee.
     *
     * Bounded at both ends: never below the floor, and never above the whole
     * fee, which would credit the creator more than was taken and underflow
     * the platform's side of the same trade.
     */
    function setCreatorShare(uint16 next) external onlyOwner {
        if (next < MIN_CREATOR_SHARE_BPS || next > BPS) revert BadCreatorShare();
        creatorShareBps = next;
        emit CreatorShareSet(next);
    }

    /// Set once the chain's WETH address is known from its own documentation.
    function setWeth(address next) external onlyOwner {
        weth = next;
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroOwner();
        owner = next;
    }

    error ZeroOwner();
    error WethNotSet();
    error FactoryNotSet();
    error NotGraduated();
    error PoolExists();
    error PoolCreationFailed();
    error WrapFailed();
    error QuoteNotAllowed();
    error QuoteMismatch();
    error TaxTooHigh();
    error BadQuoteConfig();
}
