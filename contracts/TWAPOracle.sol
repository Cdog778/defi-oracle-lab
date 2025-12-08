// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAMM {
    function getSpotPrice() external view returns (uint256);
}

/**
 * @title TWAPOracle
 * @dev Time-Weighted Average Price Oracle that prevents flash loan manipulation
 * by averaging prices over multiple blocks/time periods
 */
contract TWAPOracle {
    struct PricePoint {
        uint256 price;
        uint256 timestamp;
        uint256 blockNumber;
    }

    IAMM public immutable amm;
    uint256 public constant TWAP_WINDOW = 300; // 5 minutes (assuming 12s blocks)
    uint256 public constant MIN_UPDATE_INTERVAL = 60; // 1 minute minimum between updates
    uint256 public constant MAX_PRICE_POINTS = 50; // Store last 50 price points
    
    PricePoint[] public priceHistory;
    mapping(address => bool) public authorizedUpdaters;
    uint256 public lastUpdateTime;
    
    event PriceUpdated(uint256 indexed price, uint256 timestamp, uint256 blockNumber);
    event TWAPCalculated(uint256 indexed twapPrice, uint256 dataPoints);

    modifier onlyAuthorized() {
        require(authorizedUpdaters[msg.sender], "Not authorized to update prices");
        _;
    }

    constructor(address _amm, address _initialUpdater) {
        amm = IAMM(_amm);
        authorizedUpdaters[_initialUpdater] = true;
        
        // Initialize with current price
        _updatePrice();
    }

    /**
     * @dev Updates price from the underlying AMM
     * Can be called by anyone, but has rate limiting
     */
    function updatePrice() external {
        require(
            block.timestamp >= lastUpdateTime + MIN_UPDATE_INTERVAL,
            "Update too frequent"
        );
        _updatePrice();
    }

    /**
     * @dev Emergency price update for authorized updaters (e.g., keepers)
     */
    function emergencyUpdatePrice() external onlyAuthorized {
        _updatePrice();
    }

    function _updatePrice() internal {
        uint256 currentPrice = amm.getSpotPrice();
        uint256 currentTime = block.timestamp;
        
        // Add new price point
        priceHistory.push(PricePoint({
            price: currentPrice,
            timestamp: currentTime,
            blockNumber: block.number
        }));
        
        // Remove old data points beyond our storage limit
        if (priceHistory.length > MAX_PRICE_POINTS) {
            // Shift array left to remove oldest element
            for (uint i = 0; i < priceHistory.length - 1; i++) {
                priceHistory[i] = priceHistory[i + 1];
            }
            priceHistory.pop();
        }
        
        lastUpdateTime = currentTime;
        emit PriceUpdated(currentPrice, currentTime, block.number);
    }

    /**
     * @dev Get Time-Weighted Average Price over the specified window
     * @return TWAP price, resistant to flash loan manipulation
     */
    function getTWAP() external view returns (uint256) {
        require(priceHistory.length > 0, "No price data available");
        
        uint256 cutoffTime = block.timestamp - TWAP_WINDOW;
        uint256 weightedSum = 0;
        uint256 totalWeight = 0;
        uint256 validPoints = 0;
        
        // Calculate time-weighted average
        for (uint i = 0; i < priceHistory.length; i++) {
            if (priceHistory[i].timestamp >= cutoffTime) {
                uint256 weight;
                
                if (i == priceHistory.length - 1) {
                    // Most recent point: weight from its timestamp to now
                    weight = block.timestamp - priceHistory[i].timestamp + 1;
                } else {
                    // Weight is time until next price point
                    weight = priceHistory[i + 1].timestamp - priceHistory[i].timestamp;
                }
                
                weightedSum += priceHistory[i].price * weight;
                totalWeight += weight;
                validPoints++;
            }
        }
        
        require(validPoints > 0, "No recent price data");
        require(totalWeight > 0, "Invalid weight calculation");
        
        uint256 twapPrice = weightedSum / totalWeight;
        
        return twapPrice;
    }

    /**
     * @dev Get TWAP with minimum data points requirement
     * @param minDataPoints Minimum number of price points required
     */
    function getTWAPWithMinPoints(uint256 minDataPoints) external view returns (uint256) {
        uint256 cutoffTime = block.timestamp - TWAP_WINDOW;
        uint256 validPoints = 0;
        
        // Count valid points first
        for (uint i = 0; i < priceHistory.length; i++) {
            if (priceHistory[i].timestamp >= cutoffTime) {
                validPoints++;
            }
        }
        
        require(validPoints >= minDataPoints, "Insufficient data points for reliable TWAP");
        
        return this.getTWAP();
    }

    /**
     * @dev Check if price has deviated significantly from TWAP (circuit breaker)
     * @param maxDeviationBPS Maximum allowed deviation in basis points (e.g., 500 = 5%)
     */
    function isPriceWithinDeviation(uint256 maxDeviationBPS) external view returns (bool) {
        if (priceHistory.length == 0) return false;
        
        uint256 currentPrice = amm.getSpotPrice();
        uint256 twapPrice = this.getTWAP();
        
        uint256 deviation;
        if (currentPrice > twapPrice) {
            deviation = ((currentPrice - twapPrice) * 10000) / twapPrice;
        } else {
            deviation = ((twapPrice - currentPrice) * 10000) / twapPrice;
        }
        
        return deviation <= maxDeviationBPS;
    }

    /**
     * @dev Get price statistics for monitoring
     */
    function getPriceStats() external view returns (
        uint256 latestPrice,
        uint256 twapPrice,
        uint256 dataPoints,
        uint256 oldestTimestamp
    ) {
        if (priceHistory.length == 0) {
            return (0, 0, 0, 0);
        }
        
        latestPrice = priceHistory[priceHistory.length - 1].price;
        twapPrice = this.getTWAP();
        dataPoints = priceHistory.length;
        oldestTimestamp = priceHistory[0].timestamp;
    }

    /**
     * @dev Admin functions
     */
    function addAuthorizedUpdater(address updater) external onlyAuthorized {
        authorizedUpdaters[updater] = true;
    }

    function removeAuthorizedUpdater(address updater) external onlyAuthorized {
        authorizedUpdaters[updater] = false;
    }

    /**
     * @dev Get the price history array length
     */
    function getPriceHistoryLength() external view returns (uint256) {
        return priceHistory.length;
    }
}
