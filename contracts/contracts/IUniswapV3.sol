// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * The slices of Uniswap V3 and WETH the launchpad touches.
 *
 * Declared here rather than pulled in as a dependency. The launchpad calls four
 * methods across three contracts, and vendoring the whole periphery to get them
 * would add thousands of lines and a version to keep in step, for interfaces
 * that have not changed since V3 shipped.
 */

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee)
        external
        view
        returns (address pool);

    function createPool(address tokenA, address tokenB, uint24 fee)
        external
        returns (address pool);
}

interface IUniswapV3Pool {
    /**
     * Sets the opening price.
     *
     * A pool exists but cannot be traded until this is called, so it is part of
     * creating a market rather than an optional extra.
     */
    function initialize(uint160 sqrtPriceX96) external;

    function mint(
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount,
        bytes calldata data
    ) external returns (uint256 amount0, uint256 amount1);

    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IWETH9 {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}
