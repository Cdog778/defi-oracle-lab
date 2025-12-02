// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISimpleAMM {
    function getSpotPrice() external view returns (uint256); // scaled by 1e18 (B per A)
}

contract VulnerableLending {
    IERC20 public tokenA; // collateral token
    IERC20 public tokenB; // borrow token
    ISimpleAMM public amm;

    mapping(address => uint256) public collateralA; // amount of A deposited
    mapping(address => uint256) public debtB;       // amount of B borrowed

    uint256 public constant LTV_BP = 5000; // 50% LTV
    uint256 public constant BP = 10000;

    constructor(address _tokenA, address _tokenB, address _amm) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        amm = ISimpleAMM(_amm);
    }

    // -----------------------------------------
    // FIXED depositCollateral FUNCTION
    // -----------------------------------------
    function depositCollateral(uint256 amount) external {
        require(amount > 0, "zero deposit");

        tokenA.transferFrom(msg.sender, address(this), amount);
        collateralA[msg.sender] += amount;
    }

    // -----------------------------------------
    // BORROW FUNCTION (unchanged vulnerability)
    // -----------------------------------------
    function borrow(uint256 amountB) external {
        require(amountB > 0, "zero borrow");

        uint256 spot = amm.getSpotPrice();
        uint256 collValueB = (collateralA[msg.sender] * spot) / 1e18;

        uint256 allowed = (collValueB * LTV_BP) / BP;
        require(debtB[msg.sender] + amountB <= allowed, "exceeds allowed");

        uint256 poolBal = tokenB.balanceOf(address(this));
        require(poolBal >= amountB, "insufficient pool");

        debtB[msg.sender] += amountB;
        tokenB.transfer(msg.sender, amountB);
    }

    function repay(uint256 amountB) external {
        require(amountB > 0, "zero");

        tokenB.transferFrom(msg.sender, address(this), amountB);

        if (amountB >= debtB[msg.sender]) {
            debtB[msg.sender] = 0;
        } else {
            debtB[msg.sender] -= amountB;
        }
    }

    function fundPool(uint256 amountB) external {
        tokenB.transferFrom(msg.sender, address(this), amountB);
    }
}
