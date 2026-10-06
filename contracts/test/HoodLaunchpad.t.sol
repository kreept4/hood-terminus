// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {HoodLaunchpad} from "../contracts/HoodLaunchpad.sol";
import {HoodToken} from "../contracts/HoodToken.sol";

/**
 * Tests for the launchpad.
 *
 * Written in Solidity against forge-std rather than in TypeScript, for two
 * reasons: fuzzing, which is what actually finds the input that breaks a curve,
 * and portability, since these run unchanged under Foundry if the toolchain
 * ever moves.
 *
 * The fuzz tests matter more than the unit tests here. A bonding curve is a
 * division, and divisions round. The question is never "does a normal buy
 * work", it is "is there an amount, or a sequence of amounts, where rounding
 * pays someone more than they put in". That is what these look for.
 */
contract HoodLaunchpadTest is Test {
    HoodLaunchpad internal pad;

    address internal creator = address(0xC0FFEE);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant LAUNCH_FEE = 0.002 ether;

    function setUp() public {
        // Zero addresses: these tests exercise the curve, not the pool. Pool
        // creation is covered against a fork of mainnet, where the real
        // factory and WETH exist.
        pad = new HoodLaunchpad(LAUNCH_FEE, address(0), address(0));
        vm.deal(creator, 100 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
    }

    function _launch() internal returns (address token) {
        vm.prank(creator);
        token = pad.launch{value: LAUNCH_FEE}("Cash Cat", "CASHCAT", address(0));
    }

    // ── Launching ──────────────────────────────────────────────────────────

    function test_launch_mintsFullSupplyToThePad() public {
        address token = _launch();
        assertEq(HoodToken(token).totalSupply(), pad.TOTAL_SUPPLY());
        assertEq(HoodToken(token).balanceOf(address(pad)), pad.TOTAL_SUPPLY());
    }

    function test_launch_creditsTheLaunchFeeToTheOwner() public {
        _launch();
        assertEq(pad.feesOwed(address(this)), LAUNCH_FEE);
    }

    function test_launch_revertsWhenUnderpaid() public {
        vm.prank(creator);
        vm.expectRevert(HoodLaunchpad.WrongLaunchFee.selector);
        pad.launch{value: LAUNCH_FEE - 1}("Cash Cat", "CASHCAT", address(0));
    }

    function test_launch_revertsOnEmptyName() public {
        vm.prank(creator);
        vm.expectRevert(HoodLaunchpad.EmptyString.selector);
        pad.launch{value: LAUNCH_FEE}("", "CASHCAT", address(0));
    }

    /// Surplus above the fee is the creator's own first buy.
    function test_launch_surplusBuysForTheCreator() public {
        vm.prank(creator);
        address token = pad.launch{value: LAUNCH_FEE + 1 ether}("Cat", "CAT", address(0));
        assertGt(HoodToken(token).balanceOf(creator), 0);
    }

    /// A launch can name a different wallet as the one that earns.
    function test_launch_honoursAFeeRecipient() public {
        vm.prank(creator);
        address token = pad.launch{value: LAUNCH_FEE}("Cat", "CAT", bob);

        vm.prank(alice);
        pad.buy{value: 1 ether}(token, 0);

        // Bob earns, the launcher does not.
        assertEq(pad.feesOwed(bob), 0.005 ether);
        assertEq(pad.feesOwed(creator), 0);
    }

    // ── Buying ─────────────────────────────────────────────────────────────

    function test_buy_deliversTokensAndTakesFee() public {
        address token = _launch();

        vm.prank(alice);
        pad.buy{value: 1 ether}(token, 0);

        assertGt(HoodToken(token).balanceOf(alice), 0);
        // 1% of 1 ETH, split evenly between creator and platform.
        assertEq(pad.feesOwed(creator), 0.005 ether);
        assertEq(pad.feesOwed(address(this)), LAUNCH_FEE + 0.005 ether);
    }

    function test_buy_priceRises() public {
        address token = _launch();

        vm.prank(alice);
        pad.buy{value: 1 ether}(token, 0);
        uint256 first = HoodToken(token).balanceOf(alice);

        vm.prank(bob);
        pad.buy{value: 1 ether}(token, 0);
        uint256 second = HoodToken(token).balanceOf(bob);

        // Same money, later, buys strictly less. If this ever fails the curve
        // is flat or inverted, and an inverted curve is a free money printer.
        assertLt(second, first);
    }

    function test_buy_honoursSlippageBound() public {
        address token = _launch();
        uint256 expected = pad.quoteBuy(token, 1 ether);

        vm.prank(alice);
        vm.expectRevert(HoodLaunchpad.SlippageExceeded.selector);
        pad.buy{value: 1 ether}(token, expected + 1);
    }

    function test_quoteBuy_matchesWhatABuyActuallyPays() public {
        address token = _launch();
        uint256 quoted = pad.quoteBuy(token, 0.5 ether);

        vm.prank(alice);
        pad.buy{value: 0.5 ether}(token, 0);

        assertEq(HoodToken(token).balanceOf(alice), quoted);
    }

    // ── Selling ────────────────────────────────────────────────────────────

    function test_sell_returnsEthAndTakesFee() public {
        address token = _launch();

        vm.prank(alice);
        pad.buy{value: 1 ether}(token, 0);
        uint256 held = HoodToken(token).balanceOf(alice);

        uint256 before = alice.balance;
        vm.startPrank(alice);
        HoodToken(token).approve(address(pad), held);
        pad.sell(token, held, 0);
        vm.stopPrank();

        assertGt(alice.balance, before);
    }

    /**
     * The round trip must always lose money.
     *
     * Buying and immediately selling the same tokens pays two fees, so it has
     * to come back worth less. If it ever came back worth more, the curve
     * would be drainable in a loop.
     */
    function test_roundTripAlwaysLoses() public {
        address token = _launch();

        // Under the graduation threshold, or the sell reverts for an
        // unrelated reason and this asserts nothing.
        uint256 before = alice.balance;
        vm.startPrank(alice);
        pad.buy{value: 1 ether}(token, 0);
        uint256 held = HoodToken(token).balanceOf(alice);
        HoodToken(token).approve(address(pad), held);
        pad.sell(token, held, 0);
        vm.stopPrank();

        assertLt(alice.balance, before);
    }

    // ── Graduation ─────────────────────────────────────────────────────────

    function test_graduatesOnceTheCurveFills() public {
        address token = _launch();

        vm.prank(alice);
        pad.buy{value: 12 ether}(token, 0);

        (, , , bool graduated) = pad.launches(token);
        assertTrue(graduated);
        assertEq(pad.progressBps(token), 10_000);
    }

    function test_cannotTradeAfterGraduation() public {
        address token = _launch();

        vm.prank(alice);
        pad.buy{value: 12 ether}(token, 0);

        vm.prank(bob);
        vm.expectRevert(HoodLaunchpad.AlreadyGraduated.selector);
        pad.buy{value: 1 ether}(token, 0);
    }

    // ── Fees ───────────────────────────────────────────────────────────────

    function test_withdrawFees_paysAndZeroes() public {
        address token = _launch();

        vm.prank(alice);
        pad.buy{value: 1 ether}(token, 0);

        uint256 owed = pad.feesOwed(creator);
        uint256 before = creator.balance;

        vm.prank(creator);
        pad.withdrawFees();

        assertEq(creator.balance, before + owed);
        assertEq(pad.feesOwed(creator), 0);
    }

    function test_withdrawFees_revertsWhenNothingOwed() public {
        vm.prank(bob);
        vm.expectRevert(HoodLaunchpad.NothingOwed.selector);
        pad.withdrawFees();
    }

    // ── Taking fees as tokens ──────────────────────────────────────────────

    function test_withdrawFeesAsToken_buysAndZeroes() public {
        address token = _launch();

        vm.prank(alice);
        pad.buy{value: 1 ether}(token, 0);

        uint256 owed = pad.feesOwed(creator);
        assertGt(owed, 0);

        uint256 heldBefore = HoodToken(token).balanceOf(creator);
        vm.prank(creator);
        pad.withdrawFeesAsToken(token, 0);

        assertGt(HoodToken(token).balanceOf(creator), heldBefore);

        // Not zero afterwards, and that is correct. The withdrawal is a buy, so
        // it pays the trade fee like any other, and half of that fee is the
        // creator's. What is left is the rebate on their own purchase, which is
        // strictly smaller than what they came in with.
        uint256 rebate = pad.feesOwed(creator);
        assertLt(rebate, owed);
        assertEq(rebate, (((owed * pad.TRADE_FEE_BPS()) / 10_000) * pad.CREATOR_SHARE_BPS()) / 10_000);
    }

    /// The creator buys at the same price as anybody else, fee included.
    function test_withdrawFeesAsToken_paysTheSameTradeFee() public {
        address token = _launch();

        vm.prank(alice);
        pad.buy{value: 1 ether}(token, 0);

        uint256 owed = pad.feesOwed(creator);
        uint256 quoted = pad.quoteBuy(token, owed);

        vm.prank(creator);
        pad.withdrawFeesAsToken(token, 0);

        assertEq(HoodToken(token).balanceOf(creator), quoted);
    }

    function test_withdrawFeesAsToken_honoursSlippageBound() public {
        address token = _launch();

        vm.prank(alice);
        pad.buy{value: 1 ether}(token, 0);

        uint256 owed = pad.feesOwed(creator);
        uint256 quoted = pad.quoteBuy(token, owed);

        vm.prank(creator);
        vm.expectRevert(HoodLaunchpad.SlippageExceeded.selector);
        pad.withdrawFeesAsToken(token, quoted + 1);
    }

    function test_withdrawFeesAsToken_revertsWhenNothingOwed() public {
        address token = _launch();
        vm.prank(bob);
        vm.expectRevert(HoodLaunchpad.NothingOwed.selector);
        pad.withdrawFeesAsToken(token, 0);
    }

    /// Taking fees as tokens must not leave the contract owing more than it has.
    function test_withdrawFeesAsToken_keepsThePadSolvent() public {
        address token = _launch();

        vm.prank(alice);
        pad.buy{value: 2 ether}(token, 0);

        vm.prank(creator);
        pad.withdrawFeesAsToken(token, 0);

        (, uint128 ethReserve, , ) = pad.launches(token);
        uint256 owed = pad.feesOwed(creator) + pad.feesOwed(address(this));
        assertGe(address(pad).balance, uint256(ethReserve) + owed);
    }

    // ── Taking fees as WETH ────────────────────────────────────────────────

    function test_withdrawFeesAsWeth_revertsUntilTheAddressIsSet() public {
        address token = _launch();

        vm.prank(alice);
        pad.buy{value: 1 ether}(token, 0);

        vm.prank(creator);
        vm.expectRevert(HoodLaunchpad.WethNotSet.selector);
        pad.withdrawFeesAsWeth();
    }

    // ── Fuzzing ────────────────────────────────────────────────────────────

    /**
     * No buy of any size may take more than the curve holds.
     *
     * The one bound that stops the curve minting supply it does not have.
     */
    function testFuzz_buyNeverOversells(uint96 amount) public {
        amount = uint96(bound(amount, 1e12, 50 ether));
        address token = _launch();

        vm.deal(alice, uint256(amount) + 1 ether);
        vm.prank(alice);
        pad.buy{value: amount}(token, 0);

        assertLe(HoodToken(token).balanceOf(alice), pad.CURVE_SUPPLY());
    }

    /**
     * The pad must always hold at least what it owes.
     *
     * Every reserve plus every unpaid fee has to be covered by the actual
     * balance. This is the property that says the contract is solvent, and it
     * is the one worth fuzzing hardest.
     */
    function testFuzz_staysSolvent(uint96 buyAmount, uint96 sellFraction) public {
        buyAmount = uint96(bound(buyAmount, 1e12, 2 ether));
        sellFraction = uint96(bound(sellFraction, 1, 10_000));

        address token = _launch();

        vm.deal(alice, uint256(buyAmount) + 1 ether);
        vm.prank(alice);
        pad.buy{value: buyAmount}(token, 0);

        uint256 held = HoodToken(token).balanceOf(alice);
        uint256 toSell = (held * sellFraction) / 10_000;

        if (toSell > 0) {
            vm.startPrank(alice);
            HoodToken(token).approve(address(pad), toSell);
            pad.sell(token, toSell, 0);
            vm.stopPrank();
        }

        (, uint128 ethReserve, , ) = pad.launches(token);
        uint256 owed = pad.feesOwed(creator) + pad.feesOwed(address(this));

        assertGe(address(pad).balance, uint256(ethReserve) + owed);
    }

    /**
     * A sell can never return more than the same tokens just cost.
     *
     * Rounding in the curve maths is the thing this is looking for: an amount
     * where the two divisions disagree in the buyer's favour.
     */
    function testFuzz_sellNeverBeatsBuy(uint96 amount) public {
        amount = uint96(bound(amount, 1e14, 2 ether));
        address token = _launch();

        vm.deal(alice, uint256(amount) + 1 ether);

        vm.startPrank(alice);
        pad.buy{value: amount}(token, 0);
        uint256 held = HoodToken(token).balanceOf(alice);

        uint256 before = alice.balance;
        HoodToken(token).approve(address(pad), held);
        pad.sell(token, held, 0);
        vm.stopPrank();

        assertLe(alice.balance - before, uint256(amount));
    }

    /// The pad has to be able to receive the ETH a sell pays out.
    receive() external payable {}
}
