// SPDX-License-Identifier: MIT

//this contract uses the AMM spot price directly (no TWAP), calculates collateral value and allows borrowing up to 50% LTV. That direct reliance on getSpotPrice() is the vulnerability.

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISimpleAMM {
    function getSpotPrice() external view returns (uint256); // scaled by 1e18 (B per A)
}

contract VulnerableLending {
    IERC20 public tokenA; // collateral token
    IERC20 public tokenB; // borrow token
    ISimpleAMM public amm;

    // simple per-user collateral tracking (amount of A deposited)
    mapping(address => uint256) public collateralA;
    // simple per-user debt tracking (amount of B borrowed)
    mapping(address => uint256) public debtB;

    uint256 public constant LTV_BP = 5000; // 50% LTV (50% of collateral value)
    uint256 public constant BP = 10000;

    constructor(address _tokenA, address _tokenB, address _amm) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        amm = ISimpleAMM(_amm);
    }

    // deposit collateral (TokenA)
    function depositCollateral(uint256 amount) external {
        require(amount > 0, "zero");
        tokenA.transferFrom(msg.sender, address(this), amount);
        collateralA[msg.sender] += amount;
    }

    // borrow TokenB, amount in tokenB units
    function borrow(uint256 amountB) external {
        require(amountB > 0, "zero borrow");

        // compute collateral value in TokenB using AMM spot price (B per A scaled by 1e18)
        uint256 spot = amm.getSpotPrice(); // spot scaled by 1e18
        // collateralA * spot / 1e18 = collateral value in tokenB
        uint256 collValueB = (collateralA[msg.sender] * spot) / 1e18;

        // allowed borrow = collValueB * LTV_BP / BP, ensure debt + amountB <= allowed
        uint256 allowed = (collValueB * LTV_BP) / BP;
        require(debtB[msg.sender] + amountB <= allowed, "exceeds allowed");

        // check pool has enough B
        uint256 poolBal = tokenB.balanceOf(address(this));
        require(poolBal >= amountB, "insufficient pool");

        debtB[msg.sender] += amountB;
        tokenB.transfer(msg.sender, amountB);
    }

    // simple repay
    function repay(uint256 amountB) external {
        require(amountB > 0, "zero");
        tokenB.transferFrom(msg.sender, address(this), amountB);
        // reduce debt (clamp)
        if (amountB >= debtB[msg.sender]) debtB[msg.sender] = 0;
        else debtB[msg.sender] -= amountB;
    }

    // helper to fund lending pool (owner or test script)
    function fundPool(uint256 amountB) external {
        tokenB.transferFrom(msg.sender, address(this), amountB);
    }
}

