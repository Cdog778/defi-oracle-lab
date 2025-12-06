// SPDX-License-Identifier: MIT

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISimpleAMM {
    function getSpotPrice() external view returns (uint256); // scaled by 1e18 (A per B)
}

/**
 * @title VulnerableLending
 * @notice Lending protocol that accepts TokenB as collateral and allows borrowing TokenA.
 * VULNERABILITY: Uses spot price from AMM without any price checks, allowing price manipulation attacks.
 * 
 * The protocol works as follows:
 * - Users deposit TokenB as collateral
 * - Users can borrow TokenA up to 50% LTV (Loan-to-Value)
 * - LTV calculation: (collateral_B * spot_price_A_per_B) * 50% = max_borrow_A
 * - Spot price can be manipulated by large trades in the AMM
 */
contract VulnerableLending {
    IERC20 public tokenA; // token to borrow
    IERC20 public tokenB; // collateral token
    ISimpleAMM public amm;

    // User collateral and debt
    mapping(address => uint256) public collateralB; // amount of B deposited as collateral
    mapping(address => uint256) public debtA;       // amount of A borrowed (owed back)

    uint256 public constant LTV_BP = 7500; // 75% LTV (75% of collateral value can be borrowed)
    uint256 public constant BP = 10000;

    constructor(address _tokenA, address _tokenB, address _amm) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        amm = ISimpleAMM(_amm);
    }

    /**
     * @notice Deposit TokenB as collateral
     * @param amount Amount of TokenB to deposit
     */
    function depositCollateral(uint256 amount) external {
        require(amount > 0, "zero deposit");

        tokenB.transferFrom(msg.sender, address(this), amount);
        collateralB[msg.sender] += amount;
    }

    /**
     * @notice Withdraw TokenB collateral (only if sufficient debt ratio remains)
     * @param amount Amount of TokenB to withdraw
     */
    function withdrawCollateral(uint256 amount) external {
        require(amount > 0, "zero withdrawal");
        require(collateralB[msg.sender] >= amount, "insufficient collateral");

        // Check that withdrawal maintains valid LTV
        uint256 newCollateral = collateralB[msg.sender] - amount;
        uint256 spot = amm.getSpotPrice();
        uint256 newCollValueA = (newCollateral * spot) / 1e18;
        uint256 maxBorrow = (newCollValueA * LTV_BP) / BP;
        require(debtA[msg.sender] <= maxBorrow, "withdrawal violates LTV");

        collateralB[msg.sender] -= amount;
        tokenB.transfer(msg.sender, amount);
    }

    /**
     * @notice Borrow TokenA against TokenB collateral at the current spot price
     * VULNERABILITY: No price oracle validation, only spot price
     * @param amountA Amount of TokenA to borrow
     */
    function borrow(uint256 amountA) external {
        require(amountA > 0, "zero borrow");

        // Get current spot price from AMM (A per B)
        uint256 spotPrice = amm.getSpotPrice();
        
        // Calculate collateral value in terms of A
        uint256 collateralValueInA = (collateralB[msg.sender] * spotPrice) / 1e18;

        // Calculate max borrow amount (50% LTV)
        uint256 maxBorrow = (collateralValueInA * LTV_BP) / BP;
        
        // Check that borrowing doesn't exceed LTV
        require(debtA[msg.sender] + amountA <= maxBorrow, "exceeds LTV");

        // Check that lending pool has enough TokenA
        uint256 poolBal = tokenA.balanceOf(address(this));
        require(poolBal >= amountA, "insufficient liquidity");

        // Record debt and transfer tokens
        debtA[msg.sender] += amountA;
        tokenA.transfer(msg.sender, amountA);
    }

    /**
     * @notice Repay borrowed TokenA
     * @param amountA Amount of TokenA to repay
     */
    function repay(uint256 amountA) external {
        require(amountA > 0, "zero repay");

        tokenA.transferFrom(msg.sender, address(this), amountA);

        if (amountA >= debtA[msg.sender]) {
            debtA[msg.sender] = 0;
        } else {
            debtA[msg.sender] -= amountA;
        }
    }

    /**
     * @notice Fund the lending pool with TokenA (only called by pool admin)
     * @param amountA Amount of TokenA to add to pool
     */
    function fundPool(uint256 amountA) external {
        tokenA.transferFrom(msg.sender, address(this), amountA);
    }

    /**
     * @notice Get current borrowing power for a user
     * @param user User address
     * @return maxBorrowA Maximum amount of TokenA the user can borrow
     * @return currentDebtA Current amount of TokenA the user owes
     * @return availableBorrowA Amount of TokenA the user can still borrow
     */
    function getBorrowingPower(address user) external view returns (uint256 maxBorrowA, uint256 currentDebtA, uint256 availableBorrowA) {
        uint256 spotPrice = amm.getSpotPrice();
        uint256 collValueA = (collateralB[user] * spotPrice) / 1e18;
        maxBorrowA = (collValueA * LTV_BP) / BP;
        currentDebtA = debtA[user];
        availableBorrowA = maxBorrowA > currentDebtA ? maxBorrowA - currentDebtA : 0;
    }
}
