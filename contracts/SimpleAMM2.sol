// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SimpleAMM2
 * @notice Second constant-product AMM pool for realistic attack flow
 * 
 * DESIGN:
 * - AMM1 is seeded heavily (high liquidity) → used for price manipulation
 * - AMM2 is seeded lightly (low liquidity) → used for "fair price" repayment
 * - Together they demonstrate a realistic attack:
 *   1. Pump B price on AMM1 using flash-loaned A
 *   2. Deposit inflated B as collateral
 *   3. Borrow A against inflated collateral
 *   4. Use some borrowed A to repay flash loan
 *   5. Use remaining borrowed A to swap for B on AMM2 (fair price)
 *   6. Keep leftover A as profit
 */
contract SimpleAMM2 {
    IERC20 public tokenA;
    IERC20 public tokenB;
    uint256 public reserveA;
    uint256 public reserveB;
    uint256 public constant FEE_BP = 30; // 0.3% fee
    uint256 public constant BP_DIVISOR = 10000;

    constructor(address _tokenA, address _tokenB) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    /**
     * @notice Add initial liquidity to the pool
     * @param amountA Amount of TokenA to add
     * @param amountB Amount of TokenB to add
     */
    function addLiquidity(uint256 amountA, uint256 amountB) external {
        require(amountA > 0 && amountB > 0, "invalid amounts");
        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transferFrom(msg.sender, address(this), amountB);
        reserveA += amountA;
        reserveB += amountB;
    }

    /**
     * @notice Swap TokenA for TokenB
     * @param amountIn Amount of TokenA to swap in
     * @return amountOut Amount of TokenB received
     */
    function swapAForB(uint256 amountIn) external returns (uint256 amountOut) {
        require(amountIn > 0, "zero input");
        tokenA.transferFrom(msg.sender, address(this), amountIn);

        uint256 amountInWithFee = amountIn * (BP_DIVISOR - FEE_BP) / BP_DIVISOR;
        uint256 newReserveA = reserveA + amountInWithFee;
        uint256 k = reserveA * reserveB;
        uint256 newReserveB = k / newReserveA;
        amountOut = reserveB - newReserveB;

        tokenB.transfer(msg.sender, amountOut);

        reserveA = reserveA + amountIn;
        reserveB = newReserveB;
    }

    /**
     * @notice Swap TokenB for TokenA
     * @param amountIn Amount of TokenB to swap in
     * @return amountOut Amount of TokenA received
     */
    function swapBForA(uint256 amountIn) external returns (uint256 amountOut) {
        require(amountIn > 0, "zero input");
        tokenB.transferFrom(msg.sender, address(this), amountIn);

        uint256 amountInWithFee = amountIn * (BP_DIVISOR - FEE_BP) / BP_DIVISOR;
        uint256 newReserveB = reserveB + amountInWithFee;
        uint256 k = reserveA * reserveB;
        uint256 newReserveA = k / newReserveB;
        amountOut = reserveA - newReserveA;

        tokenA.transfer(msg.sender, amountOut);

        reserveB = reserveB + amountIn;
        reserveA = newReserveA;
    }

    /**
     * @notice Get the current spot price: how many A per 1 B
     * @return priceAPerB Price of A in terms of B (scaled by 1e18)
     */
    function getSpotPrice() external view returns (uint256) {
        require(reserveA > 0 && reserveB > 0, "empty reserves");
        return (reserveA * 1e18) / reserveB; // A per B, scaled by 1e18
    }

    /**
     * @notice Get current reserves
     */
    function getReserves() external view returns (uint256, uint256) {
        return (reserveA, reserveB);
    }
}
