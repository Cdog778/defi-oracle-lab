// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimpleAMM {
    IERC20 public tokenA;
    IERC20 public tokenB;
    uint256 public reserveA;
    uint256 public reserveB;
    uint256 public constant FEE_BP = 30; // 0.3% fee (30 basis points)
    uint256 public constant BP_DIVISOR = 10000;

    constructor(address _tokenA, address _tokenB) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    // Add initial liquidity
    function addLiquidity(uint256 amountA, uint256 amountB) external {
        require(amountA > 0 && amountB > 0, "invalid amounts");
        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transferFrom(msg.sender, address(this), amountB);
        reserveA += amountA;
        reserveB += amountB;
    }

    // Simple constant-product swap: TokenA → TokenB
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

    // Get the current on-chain spot price (TokenB per TokenA)
    function getSpotPrice() external view returns (uint256) {
        require(reserveA > 0 && reserveB > 0, "empty reserves");
        return (reserveB * 1e18) / reserveA; // scaled by 1e18 for decimals
    }
}