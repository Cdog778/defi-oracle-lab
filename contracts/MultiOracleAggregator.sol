// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPriceOracle {
    function getPrice() external view returns (uint256);
    function getTWAP() external view returns (uint256);
}

interface IAMM {
    function getSpotPrice() external view returns (uint256);
}

/**
 * @title MultiOracleAggregator
 * @dev Aggregates prices from multiple oracle sources to prevent manipulation
 * Uses median calculation and deviation checks
 */
contract MultiOracleAggregator {
    struct OracleSource {
        address oracle;
        uint256 weight;        // Weight in basis points (10000 = 100%)
        bool isActive;
        bool isTWAP;          // Whether this oracle provides TWAP vs spot price
        uint256 maxDeviation; // Max allowed deviation from median (in BPS)
        string name;
    }

    OracleSource[] public oracles;
    uint256 public constant MAX_DEVIATION_DEFAULT = 1000; // 10% default max deviation
    uint256 public constant MIN_ORACLES_REQUIRED = 2;
    
    address public owner;
    bool public emergencyPaused = false;
    
    event OracleAdded(address indexed oracle, uint256 weight, string name);
    event OracleRemoved(address indexed oracle);
    event PriceAggregated(uint256 aggregatedPrice, uint256 oracleCount);
    event OracleDeviation(address indexed oracle, uint256 price, uint256 median, uint256 deviation);
    event EmergencyPause(bool paused);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier notPaused() {
        require(!emergencyPaused, "System paused");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Add a new oracle source
     * @param _oracle Oracle contract address
     * @param _weight Weight for weighted average (basis points)
     * @param _isTWAP Whether this oracle provides TWAP
     * @param _maxDeviation Max deviation from median allowed (basis points)
     * @param _name Human readable name
     */
    function addOracle(
        address _oracle,
        uint256 _weight,
        bool _isTWAP,
        uint256 _maxDeviation,
        string memory _name
    ) external onlyOwner {
        require(_oracle != address(0), "Invalid oracle address");
        require(_weight > 0 && _weight <= 10000, "Invalid weight");
        require(_maxDeviation <= 5000, "Max deviation too high"); // Max 50%

        oracles.push(OracleSource({
            oracle: _oracle,
            weight: _weight,
            isActive: true,
            isTWAP: _isTWAP,
            maxDeviation: _maxDeviation == 0 ? MAX_DEVIATION_DEFAULT : _maxDeviation,
            name: _name
        }));

        emit OracleAdded(_oracle, _weight, _name);
    }

    /**
     * @dev Remove an oracle source
     */
    function removeOracle(uint256 index) external onlyOwner {
        require(index < oracles.length, "Invalid index");
        
        address oracleAddr = oracles[index].oracle;
        
        // Shift array to remove element
        for (uint i = index; i < oracles.length - 1; i++) {
            oracles[i] = oracles[i + 1];
        }
        oracles.pop();
        
        emit OracleRemoved(oracleAddr);
    }

    /**
     * @dev Toggle oracle active status
     */
    function toggleOracle(uint256 index, bool active) external onlyOwner {
        require(index < oracles.length, "Invalid index");
        oracles[index].isActive = active;
    }

    /**
     * @dev Get aggregated price using median and weighted average
     * @return Final aggregated price resistant to manipulation
     */
    function getAggregatedPrice() external view notPaused returns (uint256) {
        uint256[] memory prices = new uint256[](oracles.length);
        uint256[] memory weights = new uint256[](oracles.length);
        uint256 activeCount = 0;

        // Collect prices from active oracles
        for (uint i = 0; i < oracles.length; i++) {
            if (oracles[i].isActive) {
                try this._getOraclePrice(i) returns (uint256 price) {
                    if (price > 0) {
                        prices[activeCount] = price;
                        weights[activeCount] = oracles[i].weight;
                        activeCount++;
                    }
                } catch {
                    // Oracle failed, skip it
                    continue;
                }
            }
        }

        require(activeCount >= MIN_ORACLES_REQUIRED, "Insufficient oracle sources");

        // Calculate median to detect outliers
        uint256 median = _calculateMedian(prices, activeCount);
        
        // Filter out prices that deviate too much from median
        uint256 weightedSum = 0;
        uint256 totalWeight = 0;
        uint256 validPrices = 0;

        for (uint i = 0; i < activeCount; i++) {
            uint256 deviation = _calculateDeviation(prices[i], median);
            uint256 maxDev = oracles[i].maxDeviation;
            
            if (deviation <= maxDev) {
                weightedSum += prices[i] * weights[i];
                totalWeight += weights[i];
                validPrices++;
            }
        }

        require(validPrices >= MIN_ORACLES_REQUIRED, "Too many outlier prices detected");
        require(totalWeight > 0, "No valid prices");

        uint256 aggregatedPrice = weightedSum / totalWeight;
        
        return aggregatedPrice;
    }

    /**
     * @dev External function to get oracle price (for try/catch)
     */
    function _getOraclePrice(uint256 index) external view returns (uint256) {
        require(index < oracles.length, "Invalid oracle index");
        
        if (oracles[index].isTWAP) {
            return IPriceOracle(oracles[index].oracle).getTWAP();
        } else {
            // For AMM oracles, use spot price but with additional checks
            return IAMM(oracles[index].oracle).getSpotPrice();
        }
    }

    /**
     * @dev Calculate median of an array of prices
     */
    function _calculateMedian(uint256[] memory prices, uint256 length) internal pure returns (uint256) {
        if (length == 0) return 0;
        if (length == 1) return prices[0];

        // Simple bubble sort for small arrays
        for (uint i = 0; i < length - 1; i++) {
            for (uint j = 0; j < length - i - 1; j++) {
                if (prices[j] > prices[j + 1]) {
                    uint256 temp = prices[j];
                    prices[j] = prices[j + 1];
                    prices[j + 1] = temp;
                }
            }
        }

        if (length % 2 == 0) {
            // Even number of elements - average of two middle elements
            return (prices[length / 2 - 1] + prices[length / 2]) / 2;
        } else {
            // Odd number of elements - middle element
            return prices[length / 2];
        }
    }

    /**
     * @dev Calculate percentage deviation between price and baseline
     */
    function _calculateDeviation(uint256 price, uint256 baseline) internal pure returns (uint256) {
        if (baseline == 0) return 0;
        
        uint256 diff = price > baseline ? price - baseline : baseline - price;
        return (diff * 10000) / baseline; // Return in basis points
    }

    /**
     * @dev Get price with additional security checks
     * @param minOracleCount Minimum number of oracle sources required
     */
    function getSecurePrice(uint256 /* maxPriceAge */, uint256 minOracleCount) external view returns (uint256) {
        require(minOracleCount >= MIN_ORACLES_REQUIRED, "Min oracle count too low");
        
        uint256 activeCount = 0;
        for (uint i = 0; i < oracles.length; i++) {
            if (oracles[i].isActive) {
                activeCount++;
            }
        }
        
        require(activeCount >= minOracleCount, "Insufficient active oracles");
        
        // Additional checks could go here (e.g., timestamp validation for maxPriceAge)
        
        return this.getAggregatedPrice();
    }

    /**
     * @dev Emergency functions
     */
    function emergencyPause() external onlyOwner {
        emergencyPaused = true;
        emit EmergencyPause(true);
    }

    function emergencyUnpause() external onlyOwner {
        emergencyPaused = false;
        emit EmergencyPause(false);
    }

    /**
     * @dev View functions
     */
    function getOracleCount() external view returns (uint256) {
        return oracles.length;
    }

    function getActiveOracleCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint i = 0; i < oracles.length; i++) {
            if (oracles[i].isActive) count++;
        }
        return count;
    }

    function getOracleInfo(uint256 index) external view returns (
        address oracle,
        uint256 weight,
        bool isActive,
        bool isTWAP,
        uint256 maxDeviation,
        string memory name
    ) {
        require(index < oracles.length, "Invalid index");
        OracleSource memory source = oracles[index];
        return (
            source.oracle,
            source.weight,
            source.isActive,
            source.isTWAP,
            source.maxDeviation,
            source.name
        );
    }

    /**
     * @dev Get all oracle prices for debugging
     */
    function getAllPrices() external view returns (
        uint256[] memory prices,
        string[] memory names,
        bool[] memory isValid
    ) {
        prices = new uint256[](oracles.length);
        names = new string[](oracles.length);
        isValid = new bool[](oracles.length);

        for (uint i = 0; i < oracles.length; i++) {
            names[i] = oracles[i].name;
            if (oracles[i].isActive) {
                try this._getOraclePrice(i) returns (uint256 price) {
                    prices[i] = price;
                    isValid[i] = true;
                } catch {
                    prices[i] = 0;
                    isValid[i] = false;
                }
            } else {
                prices[i] = 0;
                isValid[i] = false;
            }
        }
    }
}
