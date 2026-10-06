// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {HoodLaunchpadV2} from "../contracts/HoodLaunchpadV2.sol";
import {HoodToken} from "../contracts/HoodToken.sol";

/**
 * A quote asset that behaves.
 *
 * Eighteen decimals, returns a boolean, no transfer hooks. This is what the
 * allowlist is supposed to guarantee, so it is what most of these tests use.
 */
contract MockERC20 {
    string public name = "Mock USD";
    string public symbol = "MUSD";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/** Six decimals, and returns nothing at all, like plenty of real stablecoins. */
contract MockSilentERC20 {
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transfer(address to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/** Takes one percent on every transfer. The allowlist exists to keep this out. */
contract MockTaxedERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += (amount * 99) / 100;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += (amount * 99) / 100;
        return true;
    }
}

/**
 * Tests for version two.
 *
 * Two things are new and both can lose money, so both are tested for the
 * property rather than the happy path: a curve denominated in an arbitrary
 * ERC20, and a creator tax charged on top of the platform fee.
 *
 * The invariant that matters has not changed and is asserted throughout: the
 * curve can never pay out more of an asset than it took in. Everything else is
 * an implementation detail of getting there.
 */
contract HoodLaunchpadV2Test is Test {
    HoodLaunchpadV2 internal pad;
    MockERC20 internal usd;

    address internal creator = address(0xC0FFEE);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant LAUNCH_FEE = 0.000444 ether;
    uint128 internal constant USD_VIRTUAL = 3_000e18;
    uint128 internal constant USD_GRADUATION = 8_000e18;

    function setUp() public {
        pad = new HoodLaunchpadV2(LAUNCH_FEE, address(0), address(0));

        usd = new MockERC20();
        pad.setQuote(address(usd), true, USD_VIRTUAL, USD_GRADUATION);

        vm.deal(creator, 100 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);

        usd.mint(alice, 1_000_000e18);
        usd.mint(bob, 1_000_000e18);
        vm.prank(alice);
        usd.approve(address(pad), type(uint256).max);
        vm.prank(bob);
        usd.approve(address(pad), type(uint256).max);
    }

    function _launchNative(uint16 taxBps) internal returns (address token) {
        vm.prank(creator);
        token = pad.launch{value: LAUNCH_FEE}(
            "Cash Cat", "CASHCAT", address(0), address(0), taxBps
        );
    }

    function _launchUsd(uint16 taxBps) internal returns (address token) {
        vm.prank(creator);
        token = pad.launch{value: LAUNCH_FEE}(
            "Dollar Dog", "DDOG", address(0), address(usd), taxBps
        );
    }

    // ── The quote allowlist ────────────────────────────────────────────────

    function test_launch_againstAnUnapprovedAssetReverts() public {
        MockERC20 stranger = new MockERC20();
        vm.prank(creator);
        vm.expectRevert(HoodLaunchpadV2.QuoteNotAllowed.selector);
        pad.launch{value: LAUNCH_FEE}(
            "Nope", "NOPE", address(0), address(stranger), 0
        );
    }

    function test_setQuote_isOwnerOnly() public {
        MockERC20 other = new MockERC20();
        vm.prank(alice);
        vm.expectRevert(HoodLaunchpadV2.NotOwner.selector);
        pad.setQuote(address(other), true, 1e18, 1e18);
    }

    function test_setQuote_rejectsZeroedConfig() public {
        MockERC20 other = new MockERC20();
        vm.expectRevert(HoodLaunchpadV2.BadQuoteConfig.selector);
        pad.setQuote(address(other), true, 0, 1e18);
    }

    /**
     * Disallowing an asset must not freeze tokens already using it.
     *
     * Their reserves are denominated in it and the people holding them had no
     * say in the decision, so trading has to continue.
     */
    function test_disallowingAnAssetLeavesExistingTokensTradeable() public {
        address token = _launchUsd(0);
        pad.setQuote(address(usd), false, USD_VIRTUAL, USD_GRADUATION);

        vm.prank(alice);
        pad.buyWithQuote(token, 100e18, 0);
        assertGt(HoodToken(token).balanceOf(alice), 0);
    }

    // ── Pairing against an ERC20 ───────────────────────────────────────────

    function test_erc20Buy_takesTheQuoteAssetAndGivesTokens() public {
        address token = _launchUsd(0);
        uint256 before = usd.balanceOf(alice);

        vm.prank(alice);
        pad.buyWithQuote(token, 500e18, 0);

        assertEq(usd.balanceOf(alice), before - 500e18);
        assertEq(usd.balanceOf(address(pad)), 500e18);
        assertGt(HoodToken(token).balanceOf(alice), 0);
    }

    function test_erc20Sell_paysBackInTheQuoteAsset() public {
        address token = _launchUsd(0);

        vm.prank(alice);
        pad.buyWithQuote(token, 500e18, 0);
        uint256 held = HoodToken(token).balanceOf(alice);

        vm.startPrank(alice);
        HoodToken(token).approve(address(pad), held);
        uint256 before = usd.balanceOf(alice);
        pad.sell(token, held, 0);
        vm.stopPrank();

        assertGt(usd.balanceOf(alice), before);
        // Round trip through two fees can never return more than it cost.
        assertLt(usd.balanceOf(alice), before + 500e18);
    }

    function test_nativeBuyOnAnErc20PairedTokenReverts() public {
        address token = _launchUsd(0);
        vm.prank(alice);
        vm.expectRevert(HoodLaunchpadV2.QuoteMismatch.selector);
        pad.buy{value: 1 ether}(token, 0);
    }

    function test_erc20BuyOnANativePairedTokenReverts() public {
        address token = _launchNative(0);
        vm.prank(alice);
        vm.expectRevert(HoodLaunchpadV2.QuoteMismatch.selector);
        pad.buyWithQuote(token, 100e18, 0);
    }

    /** A token that skims on transfer is credited only what actually arrived. */
    function test_feeOnTransferAssetIsCreditedByWhatArrived() public {
        MockTaxedERC20 taxed = new MockTaxedERC20();
        pad.setQuote(address(taxed), true, 1_000e18, 5_000e18);
        taxed.mint(alice, 10_000e18);
        vm.prank(alice);
        taxed.approve(address(pad), type(uint256).max);

        vm.prank(creator);
        address token = pad.launch{value: LAUNCH_FEE}(
            "Taxed", "TAX", address(0), address(taxed), 0
        );

        vm.prank(alice);
        pad.buyWithQuote(token, 1_000e18, 0);

        // The curve holds what it actually received, never what was sent.
        assertEq(taxed.balanceOf(address(pad)), 990e18);
    }

    function test_silentErc20IsSupported() public {
        MockSilentERC20 silent = new MockSilentERC20();
        pad.setQuote(address(silent), true, 3_000e6, 8_000e6);
        silent.mint(alice, 1_000_000e6);
        vm.prank(alice);
        silent.approve(address(pad), type(uint256).max);

        vm.prank(creator);
        address token = pad.launch{value: LAUNCH_FEE}(
            "Silent", "SLNT", address(0), address(silent), 0
        );

        vm.prank(alice);
        pad.buyWithQuote(token, 500e6, 0);
        assertGt(HoodToken(token).balanceOf(alice), 0);
    }

    // ── The creator tax ────────────────────────────────────────────────────

    function test_creatorTax_isCappedAtNinePercent() public {
        vm.prank(creator);
        vm.expectRevert(HoodLaunchpadV2.TaxTooHigh.selector);
        pad.launch{value: LAUNCH_FEE}(
            "Greedy", "GREED", address(0), address(0), 901
        );
    }

    function test_creatorTax_atTheCapIsAccepted() public {
        address token = _launchNative(900);
        (, , , , uint16 taxBps, ) = pad.launches(token);
        assertEq(taxBps, 900);
    }

    /**
     * The tax is charged on top of the platform fee, not carved out of it.
     *
     * Asserted against the platform's own balance rather than the creator's,
     * because the failure this guards against is a creator's setting quietly
     * reducing somebody else's income.
     */
    function test_creatorTax_doesNotReduceThePlatformShare() public {
        address plain = _launchNative(0);
        address taxed = _launchNative(900);

        uint256 owedBefore = pad.feesOwed(address(this), address(0));

        vm.prank(alice);
        pad.buy{value: 10 ether}(plain, 0);
        uint256 fromPlain = pad.feesOwed(address(this), address(0)) - owedBefore;

        owedBefore = pad.feesOwed(address(this), address(0));
        vm.prank(bob);
        pad.buy{value: 10 ether}(taxed, 0);
        uint256 fromTaxed = pad.feesOwed(address(this), address(0)) - owedBefore;

        assertEq(fromPlain, fromTaxed);
    }

    function test_creatorTax_isCreditedToTheCreator() public {
        address token = _launchNative(900);

        vm.prank(alice);
        pad.buy{value: 10 ether}(token, 0);

        // The creator's share of the 1% platform fee, plus the whole 9% tax.
        uint256 fee = 10 ether * 100 / 10_000;
        uint256 expected =
            (fee * pad.creatorShareBps()) / 10_000 + (10 ether * 900 / 10_000);
        assertEq(pad.feesOwed(creator, address(0)), expected);
    }

    /**
     * The split opens at sixty percent to the creator.
     *
     * Asserted as a literal rather than read back off the contract, because
     * the point of the test is the number itself. Reading it back would pass
     * against any value and catch nothing.
     */
    function test_creatorShare_opensAtSixtyPercent() public view {
        assertEq(pad.creatorShareBps(), 6_000);
    }

    function test_setCreatorShare_movesTheSplit() public {
        address token = _launchNative(0);
        pad.setCreatorShare(8_000);

        uint256 before = pad.feesOwed(creator, address(0));
        vm.prank(alice);
        pad.buy{value: 10 ether}(token, 0);

        uint256 fee = 10 ether * 100 / 10_000;
        assertEq(pad.feesOwed(creator, address(0)) - before, (fee * 8_000) / 10_000);
    }

    /**
     * The floor is the whole reason the setter is safe to have.
     *
     * Without it a mutable split is a lever for taking a creator's earnings
     * after they have already launched under a different number.
     */
    function test_setCreatorShare_cannotGoBelowTheFloor() public {
        // Read first. `expectRevert` arms the very next call, and that would
        // otherwise be this getter, which succeeds.
        uint16 belowFloor = pad.MIN_CREATOR_SHARE_BPS() - 1;

        vm.expectRevert(HoodLaunchpadV2.BadCreatorShare.selector);
        pad.setCreatorShare(belowFloor);
    }

    function test_setCreatorShare_cannotExceedTheWholeFee() public {
        vm.expectRevert(HoodLaunchpadV2.BadCreatorShare.selector);
        pad.setCreatorShare(10_001);
    }

    function test_setCreatorShare_isOwnerOnly() public {
        vm.prank(alice);
        vm.expectRevert(HoodLaunchpadV2.NotOwner.selector);
        pad.setCreatorShare(9_000);
    }

    /**
     * Whatever the split, the two sides add up to the fee and nothing leaks.
     *
     * Rounding is the thing being watched here: `creatorCut` rounds down and
     * the platform takes the remainder, so an odd fee at an odd split must
     * still credit exactly what was charged.
     */
    function testFuzz_creatorShare_splitIsConserved(uint16 share, uint96 amountIn)
        public
    {
        share = uint16(bound(share, pad.MIN_CREATOR_SHARE_BPS(), 10_000));
        amountIn = uint96(bound(amountIn, 1e12, 3 ether));
        pad.setCreatorShare(share);

        address token = _launchNative(0);
        uint256 creatorBefore = pad.feesOwed(creator, address(0));
        uint256 platformBefore = pad.feesOwed(address(this), address(0));

        vm.deal(alice, amountIn);
        vm.prank(alice);
        pad.buy{value: amountIn}(token, 0);

        uint256 fee = (uint256(amountIn) * 100) / 10_000;
        assertEq(
            (pad.feesOwed(creator, address(0)) - creatorBefore) +
                (pad.feesOwed(address(this), address(0)) - platformBefore),
            fee
        );
    }

    function test_quoteBuy_accountsForTheCreatorTax() public {
        address plain = _launchNative(0);
        address taxed = _launchNative(900);
        assertLt(pad.quoteBuy(taxed, 1 ether), pad.quoteBuy(plain, 1 ether));
    }

    // ── Fees are owed per asset ────────────────────────────────────────────

    function test_feesAreTrackedSeparatelyPerAsset() public {
        address nativeToken = _launchNative(0);
        address usdToken = _launchUsd(0);

        vm.prank(alice);
        pad.buy{value: 10 ether}(nativeToken, 0);
        vm.prank(alice);
        pad.buyWithQuote(usdToken, 1_000e18, 0);

        assertGt(pad.feesOwed(creator, address(0)), 0);
        assertGt(pad.feesOwed(creator, address(usd)), 0);
    }

    function test_withdrawFees_paysTheRightAsset() public {
        address token = _launchUsd(0);

        vm.prank(alice);
        pad.buyWithQuote(token, 1_000e18, 0);

        uint256 owed = pad.feesOwed(creator, address(usd));
        assertGt(owed, 0);

        uint256 before = usd.balanceOf(creator);
        vm.prank(creator);
        pad.withdrawFees(address(usd));

        assertEq(usd.balanceOf(creator), before + owed);
        assertEq(pad.feesOwed(creator, address(usd)), 0);
    }

    function test_withdrawFees_revertsWhenNothingIsOwedInThatAsset() public {
        _launchNative(0);
        vm.prank(creator);
        vm.expectRevert(HoodLaunchpadV2.NothingOwed.selector);
        pad.withdrawFees(address(usd));
    }

    // ── Graduation on a per-asset threshold ────────────────────────────────

    function test_graduation_usesTheAssetsOwnThreshold() public {
        address token = _launchUsd(0);

        vm.prank(alice);
        pad.buyWithQuote(token, USD_GRADUATION * 2, 0);

        (, , , , , bool graduated) = pad.launches(token);
        assertTrue(graduated);
    }

    function test_graduation_doesNotFireBelowTheThreshold() public {
        address token = _launchUsd(0);

        vm.prank(alice);
        pad.buyWithQuote(token, 100e18, 0);

        (, , , , , bool graduated) = pad.launches(token);
        assertFalse(graduated);
    }

    // ── The invariant, on both kinds of pairing ────────────────────────────

    /**
     * A round trip can never return more of the quote asset than it cost.
     *
     * This is the property the whole rounding discipline exists for, and the
     * one a new denomination could plausibly have broken. Fuzzed, because the
     * input that breaks a curve is never the one you would think to write.
     */
    function testFuzz_erc20RoundTripNeverProfits(uint96 amountIn) public {
        amountIn = uint96(bound(amountIn, 1e15, 5_000e18));
        address token = _launchUsd(0);

        vm.startPrank(alice);
        uint256 before = usd.balanceOf(alice);
        pad.buyWithQuote(token, amountIn, 0);

        uint256 held = HoodToken(token).balanceOf(alice);
        vm.assume(held > 0);
        HoodToken(token).approve(address(pad), held);
        pad.sell(token, held, 0);
        vm.stopPrank();

        assertLe(usd.balanceOf(alice), before);
    }

    /** The contract can never owe more of an asset than it is holding. */
    function testFuzz_erc20CurveStaysSolvent(uint96 a, uint96 b) public {
        a = uint96(bound(a, 1e15, 3_000e18));
        b = uint96(bound(b, 1e15, 3_000e18));
        address token = _launchUsd(300);

        vm.prank(alice);
        pad.buyWithQuote(token, a, 0);
        vm.prank(bob);
        pad.buyWithQuote(token, b, 0);

        (, , uint128 reserve, , , ) = pad.launches(token);
        uint256 owed = uint256(reserve) +
            pad.feesOwed(creator, address(usd)) +
            pad.feesOwed(address(this), address(usd));

        assertLe(owed, usd.balanceOf(address(pad)));
    }

    /** Native pairing must behave exactly as it did in version one. */
    function testFuzz_nativeRoundTripNeverProfits(uint96 amountIn) public {
        amountIn = uint96(bound(amountIn, 1e12, 3 ether));
        address token = _launchNative(0);

        vm.startPrank(alice);
        uint256 before = alice.balance;
        pad.buy{value: amountIn}(token, 0);

        uint256 held = HoodToken(token).balanceOf(alice);
        vm.assume(held > 0);
        HoodToken(token).approve(address(pad), held);
        pad.sell(token, held, 0);
        vm.stopPrank();

        assertLe(alice.balance, before);
    }

    receive() external payable {}
}
