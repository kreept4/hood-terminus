// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * VerifySim: a buy-then-sell simulation that never touches the chain.
 *
 * This contract is never deployed. Verify runs it inside a single `eth_call`,
 * injecting its runtime bytecode at a throwaway address with a state override
 * and giving that address a balance to trade with. Nothing is signed, nothing
 * is broadcast, and nothing it does survives the call.
 *
 * What it answers: if someone buys a small amount of this token through this
 * exact pool and sells it straight back, what happens? It measures what the pool
 * said it would deliver against what actually arrived, on the way in and on
 * the way out. That difference is where transfer taxes, hook fees and outright
 * sell blocks show up.
 *
 * Each leg runs as an external self-call, so a sell that reverts is caught and
 * reported instead of taking the buy result down with it.
 */

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

interface IWETH {
    function deposit() external payable;
}

struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

interface IPoolManager {
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData) external returns (int256);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

interface IV3Pool {
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes calldata data)
        external
        returns (int256, int256);
    function token0() external view returns (address);
}

interface IV2Pair {
    function getReserves() external view returns (uint112, uint112, uint32);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
    function token0() external view returns (address);
}

contract VerifySim {
    /// Price limits one step inside the protocol bounds, so a swap is never capped by them.
    uint160 internal constant MIN_SQRT = 0x1000276A4; // TickMath.MIN_SQRT_PRICE + 1
    uint160 internal constant MAX_SQRT = 1461446703485210103287273052203988822378723970341; // TickMath.MAX_SQRT_PRICE - 1

    uint8 internal constant KIND_V2 = 2;
    uint8 internal constant KIND_V3 = 3;
    uint8 internal constant KIND_V4 = 4;

    struct Request {
        uint8 kind; // 2, 3 or 4
        address pool; // v2 pair, v3 pool, or the v4 PoolManager
        PoolKey key; // v4 only
        address token; // the token being checked
        address quote; // what it trades against; address(0) means native ETH (v4 only)
        address weth; // wraps native ETH when the pool needs an ERC-20
        bool payWithNative; // the simulator starts with ETH and must wrap or settle natively
        uint256 amountIn; // quote spent on the buy
        uint16 v2FeeBps; // v2 forks differ: 30 for Uniswap, 25 for Pancake
    }

    struct Leg {
        bool ok;
        uint256 quoted; // what the pool reported it would send
        uint256 received; // what actually arrived
        uint256 poolGot; // what the pool actually received from us (v2 only, otherwise 0)
        bytes err; // revert data when ok is false
    }

    struct Result {
        bool buySkipped; // sell-only run: the caller granted the token balance directly
        Leg buy;
        Leg sell;
        uint256 sold; // token amount offered on the sell
    }

    // Callback context. Storage is fine here: it lives only for the duration of the call.
    address internal cbPool;
    address internal cbPayToken;
    bool internal cbPayNative;
    Request internal req;
    bool internal cbBuying;
    uint256 internal cbAmount;

    receive() external payable {}

    function simulate(Request calldata r) external returns (Result memory res) {
        req = r;

        // amountIn of zero means sell-only. Used when the quote asset's balance
        // cannot be granted (its storage layout is unknown) but the token's can.
        if (r.amountIn == 0) {
            res.buySkipped = true;
        } else {
            try this.legBuy() returns (uint256 quoted, uint256 received) {
                res.buy = Leg(true, quoted, received, 0, "");
            } catch (bytes memory e) {
                res.buy = Leg(false, 0, 0, 0, e);
                return res;
            }
        }

        res.sold = IERC20(r.token).balanceOf(address(this));
        if (res.sold == 0) return res;

        try this.legSell(res.sold) returns (uint256 quoted, uint256 received, uint256 poolGot) {
            res.sell = Leg(true, quoted, received, poolGot, "");
        } catch (bytes memory e) {
            res.sell = Leg(false, 0, 0, 0, e);
        }
    }

    // ---------------------------------------------------------------- legs

    function legBuy() external returns (uint256 quoted, uint256 received) {
        require(msg.sender == address(this), "self");
        Request memory r = req;
        uint256 before = IERC20(r.token).balanceOf(address(this));

        // Only a v4 pool quoted in native ETH takes ETH directly. Everything else
        // speaks ERC-20, so the starting ETH is wrapped first.
        bool nativeV4 = r.kind == KIND_V4 && r.quote == address(0);
        if (r.payWithNative && !nativeV4) IWETH(r.weth).deposit{value: r.amountIn}();

        if (r.kind == KIND_V4) quoted = _v4(true, r.amountIn);
        else if (r.kind == KIND_V3) quoted = _v3(true, r.amountIn);
        else (quoted,) = _v2(true, r.amountIn);
        received = IERC20(r.token).balanceOf(address(this)) - before;
    }

    function legSell(uint256 amount) external returns (uint256 quoted, uint256 received, uint256 poolGot) {
        require(msg.sender == address(this), "self");
        Request memory r = req;
        uint256 before = _quoteBalance(r);

        if (r.kind == KIND_V4) quoted = _v4(false, amount);
        else if (r.kind == KIND_V3) quoted = _v3(false, amount);
        else (quoted, poolGot) = _v2(false, amount);

        received = _quoteBalance(r) - before;
    }

    function _quoteBalance(Request memory r) internal view returns (uint256) {
        if (r.kind == KIND_V4 && r.quote == address(0)) return address(this).balance;
        address q = r.quote == address(0) ? r.weth : r.quote;
        return IERC20(q).balanceOf(address(this));
    }

    /// Some tokens return nothing from `transfer`. Accept that, reject an explicit false.
    function _transfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        require(ret.length == 0 || abi.decode(ret, (bool)), "transfer returned false");
    }

    // ---------------------------------------------------------------- v2

    function _v2(bool buying, uint256 amountIn) internal returns (uint256 quotedOut, uint256 poolGot) {
        Request memory r = req;
        IV2Pair pair = IV2Pair(r.pool);
        address quote = r.quote == address(0) ? r.weth : r.quote;
        address tokenIn = buying ? quote : r.token;
        bool inIs0 = pair.token0() == tokenIn;

        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 rIn, uint256 rOut) = inIs0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));

        // Pay first, then price on what the pair actually holds. That is how
        // fee-on-transfer tokens are traded on v2, and the gap is the tax.
        uint256 balBefore = IERC20(tokenIn).balanceOf(address(pair));
        _transfer(tokenIn, address(pair), amountIn);
        uint256 balAfter = IERC20(tokenIn).balanceOf(address(pair));
        poolGot = balAfter - balBefore;

        uint256 effIn = balAfter - rIn;
        uint256 fee = 10_000 - r.v2FeeBps;
        quotedOut = (effIn * fee * rOut) / (rIn * 10_000 + effIn * fee);
        (uint256 out0, uint256 out1) = inIs0 ? (uint256(0), quotedOut) : (quotedOut, uint256(0));
        pair.swap(out0, out1, address(this), "");
    }

    // ---------------------------------------------------------------- v3

    function _v3(bool buying, uint256 amountIn) internal returns (uint256 quotedOut) {
        Request memory r = req;
        IV3Pool pool = IV3Pool(r.pool);
        address quote = r.quote == address(0) ? r.weth : r.quote;
        address tokenIn = buying ? quote : r.token;
        bool zeroForOne = pool.token0() == tokenIn;

        cbPool = address(pool);
        cbPayToken = tokenIn;
        (int256 a0, int256 a1) =
            pool.swap(address(this), zeroForOne, int256(amountIn), zeroForOne ? MIN_SQRT : MAX_SQRT, "");
        cbPool = address(0);
        quotedOut = uint256(-(zeroForOne ? a1 : a0));
    }

    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata) external {
        _payV3(a0, a1);
    }

    function pancakeV3SwapCallback(int256 a0, int256 a1, bytes calldata) external {
        _payV3(a0, a1);
    }

    function _payV3(int256 a0, int256 a1) internal {
        require(msg.sender == cbPool, "pool");
        uint256 owed = uint256(a0 > 0 ? a0 : a1);
        _transfer(cbPayToken, msg.sender, owed);
    }

    // ---------------------------------------------------------------- v4

    function _v4(bool buying, uint256 amountIn) internal returns (uint256 quotedOut) {
        cbBuying = buying;
        cbAmount = amountIn;
        bytes memory out = IPoolManager(req.pool).unlock("");
        quotedOut = abi.decode(out, (uint256));
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        Request memory r = req;
        require(msg.sender == r.pool, "pm");
        IPoolManager pm = IPoolManager(r.pool);

        address tokenIn = cbBuying ? r.quote : r.token;
        address tokenOut = cbBuying ? r.token : r.quote;
        bool zeroForOne = r.key.currency0 == tokenIn;

        int256 delta = pm.swap(
            r.key, SwapParams(zeroForOne, -int256(cbAmount), zeroForOne ? MIN_SQRT : MAX_SQRT), ""
        );
        int128 d0 = int128(delta >> 128);
        int128 d1 = int128(delta);
        int128 dIn = zeroForOne ? d0 : d1;
        int128 dOut = zeroForOne ? d1 : d0;

        // Pay what we owe.
        uint256 owed = uint256(int256(-dIn));
        if (tokenIn == address(0)) {
            pm.settle{value: owed}();
        } else {
            pm.sync(tokenIn);
            _transfer(tokenIn, address(pm), owed);
            pm.settle();
        }

        // Collect what we are owed. A fee-on-transfer token settles short here,
        // and the PoolManager rejects the whole unlock as unsettled.
        uint256 out = uint256(int256(dOut));
        pm.take(tokenOut, address(this), out);
        return abi.encode(out);
    }
}
