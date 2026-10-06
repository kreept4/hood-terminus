// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {HoodToken} from "./HoodToken.sol";
import {IUniswapV3Factory, IUniswapV3Pool, IWETH9} from "./IUniswapV3.sol";

/**
 * The launchpad.
 *
 * A creator launches a token with nothing up front. The token opens on a
 * bonding curve holding no liquidity: buyers send ETH, the curve prices and
 * sells them tokens, and the ETH accumulates inside this contract. Once the
 * curve has taken in `GRADUATION_ETH`, the token is finished here and its
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
 *      and the platform.
 *
 * Fees are credited to a balance and withdrawn on demand rather than pushed on
 * every trade. Pushing ETH inside a swap hands control to whatever the
 * recipient's fallback does, which is a reentrancy surface bought for nothing.
 *
 * ── What this contract is not ──────────────────────────────────────────────
 *
 * It has not been audited. It should run on testnet 46630 with real
 * transactions before it ever holds a stranger's money on mainnet.
 */
contract HoodLaunchpad {
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
    uint256 public constant VIRTUAL_ETH = 1.5 ether;

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

    // ── Fees ───────────────────────────────────────────────────────────────

    /// 1% on every trade, in basis points.
    uint16 public constant TRADE_FEE_BPS = 100;

    /// The creator's share of that fee, in basis points of the fee itself.
    uint16 public constant CREATOR_SHARE_BPS = 5_000;

    uint16 private constant BPS = 10_000;

    // ── State ──────────────────────────────────────────────────────────────

    struct Launch {
        address creator;
        /// ETH actually paid in, net of fees. Never includes virtual reserve.
        uint128 ethReserve;
        /// Tokens the curve still holds.
        uint128 tokenReserve;
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
    mapping(address => uint256) public feesOwed;

    address[] public allTokens;

    event Launched(
        address indexed token,
        address indexed creator,
        string name,
        string symbol
    );
    /** Emitted when the earning wallet is not the launching wallet. */
    event FeeRecipientSet(address indexed token, address indexed recipient);
    event Bought(
        address indexed token,
        address indexed buyer,
        uint256 ethIn,
        uint256 tokensOut
    );
    event Sold(
        address indexed token,
        address indexed seller,
        uint256 tokensIn,
        uint256 ethOut
    );
    event Graduated(address indexed token, uint256 ethReserve, uint256 tokens);
    /** The token now has a real market that aggregators can see. */
    event PoolCreated(
        address indexed token,
        address indexed pool,
        uint256 ethSeeded,
        uint256 tokensSeeded
    );
    event FeesWithdrawn(address indexed to, uint256 amount);

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
        weth = _weth;
        v3Factory = _v3Factory;
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
        address feeRecipient
    ) external payable nonReentrant returns (address token) {
        if (bytes(name).length == 0 || bytes(symbol).length == 0) {
            revert EmptyString();
        }
        if (msg.value < launchFee) revert WrongLaunchFee();

        token = address(new HoodToken(name, symbol, TOTAL_SUPPLY, address(this)));

        launches[token] = Launch({
            creator: feeRecipient == address(0) ? msg.sender : feeRecipient,
            ethReserve: 0,
            tokenReserve: uint128(CURVE_SUPPLY),
            graduated: false
        });
        allTokens.push(token);

        feesOwed[owner] += launchFee;
        emit Launched(token, launches[token].creator, name, symbol);
        if (feeRecipient != address(0) && feeRecipient != msg.sender) {
            emit FeeRecipientSet(token, feeRecipient);
        }

        uint256 remainder = msg.value - launchFee;
        if (remainder > 0) {
            _buy(token, remainder, 0, msg.sender);
        }
    }

    // ── Trading ────────────────────────────────────────────────────────────

    function buy(address token, uint256 minTokensOut)
        external
        payable
        nonReentrant
    {
        _buy(token, msg.value, minTokensOut, msg.sender);
    }

    function _buy(
        address token,
        uint256 ethIn,
        uint256 minTokensOut,
        address to
    ) private {
        Launch storage l = launches[token];
        if (l.creator == address(0)) revert UnknownToken();
        if (l.graduated) revert AlreadyGraduated();
        if (ethIn == 0) revert NothingIn();

        uint256 fee = (ethIn * TRADE_FEE_BPS) / BPS;
        uint256 net = ethIn - fee;

        uint256 tokensOut = _tokensForEth(l, net);
        if (tokensOut == 0) revert CurveExhausted();
        if (tokensOut > l.tokenReserve) tokensOut = l.tokenReserve;
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        l.ethReserve += uint128(net);
        l.tokenReserve -= uint128(tokensOut);

        _creditFee(l.creator, fee);

        HoodToken(token).transfer(to, tokensOut);
        emit Bought(token, to, ethIn, tokensOut);

        if (l.ethReserve >= GRADUATION_ETH) {
            l.graduated = true;
            emit Graduated(token, l.ethReserve, POOL_SUPPLY);
        }
    }

    function sell(address token, uint256 tokensIn, uint256 minEthOut)
        external
        nonReentrant
    {
        Launch storage l = launches[token];
        if (l.creator == address(0)) revert UnknownToken();
        if (l.graduated) revert AlreadyGraduated();
        if (tokensIn == 0) revert NothingIn();

        uint256 gross = _ethForTokens(l, tokensIn);
        uint256 fee = (gross * TRADE_FEE_BPS) / BPS;
        uint256 out = gross - fee;
        if (out < minEthOut) revert SlippageExceeded();

        // Taken before the payout, so the contract can never owe more ETH than
        // it holds even if the curve maths were wrong.
        l.ethReserve -= uint128(gross);
        l.tokenReserve += uint128(tokensIn);

        _creditFee(l.creator, fee);

        HoodToken(token).transferFrom(msg.sender, address(this), tokensIn);

        (bool ok, ) = msg.sender.call{value: out}("");
        if (!ok) revert TransferFailed();

        emit Sold(token, msg.sender, tokensIn, out);
    }

    // ── Quotes ─────────────────────────────────────────────────────────────

    /// What a buy would return right now, fee included. For the UI.
    function quoteBuy(address token, uint256 ethIn)
        external
        view
        returns (uint256 tokensOut)
    {
        Launch memory l = launches[token];
        if (l.creator == address(0) || l.graduated || ethIn == 0) return 0;
        uint256 net = ethIn - (ethIn * TRADE_FEE_BPS) / BPS;
        tokensOut = _tokensForEth(l, net);
        if (tokensOut > l.tokenReserve) tokensOut = l.tokenReserve;
    }

    /// What a sell would return right now, fee included. For the UI.
    function quoteSell(address token, uint256 tokensIn)
        external
        view
        returns (uint256 ethOut)
    {
        Launch memory l = launches[token];
        if (l.creator == address(0) || l.graduated || tokensIn == 0) return 0;
        uint256 gross = _ethForTokens(l, tokensIn);
        ethOut = gross - (gross * TRADE_FEE_BPS) / BPS;
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
    // `ethReserve` outright.
    //
    // A fuzz run found it on the fourteenth input. Rounding direction in an AMM
    // is not a detail, it is the whole safety property.

    /// Ceiling division. Reverts on a zero denominator like any division would.
    function _divUp(uint256 a, uint256 b) private pure returns (uint256) {
        return a == 0 ? 0 : ((a - 1) / b) + 1;
    }

    function _tokensForEth(Launch memory l, uint256 ethIn)
        private
        pure
        returns (uint256)
    {
        uint256 eth = VIRTUAL_ETH + l.ethReserve;
        uint256 k = eth * l.tokenReserve;
        // Rounded up, so the reserve left behind is never understated and the
        // buyer never receives the rounding.
        uint256 newTokens = _divUp(k, eth + ethIn);
        if (newTokens > l.tokenReserve) return 0;
        return l.tokenReserve - newTokens;
    }

    function _ethForTokens(Launch memory l, uint256 tokensIn)
        private
        pure
        returns (uint256)
    {
        uint256 eth = VIRTUAL_ETH + l.ethReserve;
        uint256 k = eth * l.tokenReserve;
        // Rounded up for the same reason, so the payout is never overstated.
        uint256 newEth = _divUp(k, l.tokenReserve + tokensIn);
        if (newEth >= eth) return 0;
        uint256 gross = eth - newEth;
        // The virtual reserve is not real ETH. A payout can never exceed what
        // the curve has actually taken in, whatever the maths says.
        return gross > l.ethReserve ? l.ethReserve : gross;
    }

    // ── Fees ───────────────────────────────────────────────────────────────

    function _creditFee(address creator, uint256 fee) private {
        if (fee == 0) return;
        uint256 creatorCut = (fee * CREATOR_SHARE_BPS) / BPS;
        feesOwed[creator] += creatorCut;
        feesOwed[owner] += fee - creatorCut;
    }

    /**
     * Pulls whatever the caller is owed.
     *
     * Pull, not push: paying out inside a trade would hand control to the
     * recipient's fallback mid-swap. Zeroed before the transfer so a
     * reentrant call finds nothing left, on top of the guard.
     */
    function withdrawFees() external nonReentrant {
        uint256 amount = feesOwed[msg.sender];
        if (amount == 0) revert NothingOwed();
        feesOwed[msg.sender] = 0;

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit FeesWithdrawn(msg.sender, amount);
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
        uint256 amount = feesOwed[msg.sender];
        if (amount == 0) revert NothingOwed();

        Launch storage l = launches[token];
        if (l.creator == address(0)) revert UnknownToken();
        if (l.graduated) revert AlreadyGraduated();

        // Zeroed first. The buy moves ETH between internal balances rather than
        // out of the contract, so leaving it set would credit it twice.
        feesOwed[msg.sender] = 0;
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

        uint256 amount = feesOwed[msg.sender];
        if (amount == 0) revert NothingOwed();
        feesOwed[msg.sender] = 0;

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

        emit FeesWithdrawn(msg.sender, amount);
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
        if (weth == address(0)) revert WethNotSet();
        if (v3Factory == address(0)) revert FactoryNotSet();

        _openPool(token, l.ethReserve);
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
    function _openPool(address token, uint256 ethAmount) private {
        address weth_ = weth;

        address pool = IUniswapV3Factory(v3Factory).getPool(token, weth_, POOL_FEE);
        if (pool == address(0)) {
            pool = IUniswapV3Factory(v3Factory).createPool(token, weth_, POOL_FEE);
        }
        if (pool == address(0)) revert PoolCreationFailed();

        graduatedPool[token] = pool;

        // The curve held plain ETH; a pool only understands WETH.
        IWETH9(weth_).deposit{value: ethAmount}();

        // Uniswap orders a pair by address, not by which asset is the money.
        bool tokenIsZero = token < weth_;
        uint256 amount0 = tokenIsZero ? POOL_SUPPLY : ethAmount;
        uint256 amount1 = tokenIsZero ? ethAmount : POOL_SUPPLY;

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
        return (uint256(l.ethReserve) * BPS) / GRADUATION_ETH;
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    function setLaunchFee(uint256 next) external onlyOwner {
        launchFee = next;
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
}
