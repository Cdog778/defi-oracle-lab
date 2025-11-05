// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFlashLoanReceiver {
    function executeOperation(uint256 amount, bytes calldata params) external;
}

contract FlashLoanProvider {
    IERC20 public token; // token lent (TokenA for swap capital)
    uint256 public feeBP = 5; // 0.05% fee (tuneable)
    uint256 public constant BP_DIV = 10000;

    constructor(address _token) {
        token = IERC20(_token);
    }

    // fund provider in tests via direct transfer or approve+fund in script
    function flashLoan(address receiver, uint256 amount, bytes calldata params) external {
        require(amount > 0, "zero amount");
        uint256 balanceBefore = token.balanceOf(address(this));
        require(balanceBefore >= amount, "insufficient pool");

        // transfer loan to receiver
        require(token.transfer(receiver, amount), "transfer failed");

        // call receiver execution
        IFlashLoanReceiver(receiver).executeOperation(amount, params);

        // compute repayment requirement
        uint256 fee = (amount * feeBP) / BP_DIV;
        uint256 owed = amount + fee;

        uint256 balanceAfter = token.balanceOf(address(this));
        require(balanceAfter >= balanceBefore + fee, "repay + fee not met");
        // if satisfied, funds (amount+fee) are back in provider
    }

    // helper for tests to get tokens into the provider
    function fund(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
    }
}

