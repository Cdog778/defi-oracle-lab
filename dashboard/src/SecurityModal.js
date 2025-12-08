import React, { useState, useEffect } from "react";
import { Line } from "react-chartjs-2";
import { ethers } from "ethers";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function SecurityModal({ isOpen, onClose, securityData, signer, getContracts }) {
  const [realTimeData, setRealTimeData] = useState({
    preAttackPrice: "0",
    vulnerableCollateralValue: "0", 
    vulnerableMaxBorrow: "0",
    vulnerableProfitability: "0",
    twapCollateralValue: "0",
    twapMaxBorrow: "0", 
    twapProfitability: "0",
    multiOraclePrice: "0",
    multiOracleStatus: "Loading...",
    actualAttackCost: "0",
    flashLoanFee: "0",
    priceHistory: [],
    collateralAmount: "0",
    poolBalanceA: "0",
    // Individual oracle breakdown
    individualOracles: [],
    twapDataPoints: 0,
    twapOldestTimestamp: 0,
    twapPriceHistory: []
  });

  const [attackScenarios, setAttackScenarios] = useState({
    baselineAttack: { flashAmount: "2000", profitVulnerable: "0", profitTwap: "0" },
    aggressiveAttack: { flashAmount: "5000", profitVulnerable: "0", profitTwap: "0" },
    maximalAttack: { flashAmount: "10000", profitVulnerable: "0", profitTwap: "0" }
  });

  const [oracleHealth, setOracleHealth] = useState({
    vulnerable: { status: "Active", risk: "Critical" },
    twap: { status: "Loading", risk: "Low", dataPoints: 0 },
    multiOracle: { status: "Loading", risk: "Very Low", activeOracles: 0 }
  });

  // Fetch real-time oracle and contract data
  useEffect(() => {
    if (!isOpen || !signer || !getContracts) return;
    
    const fetchRealTimeData = async () => {
      try {
        const contracts = getContracts(signer);
        
        // Get current AMM state
        const [reserveA, reserveB, poolBalanceA] = await Promise.all([
          contracts.tokenA.balanceOf(contracts.amm1.address),
          contracts.tokenB.balanceOf(contracts.amm1.address),
          contracts.tokenA.balanceOf(contracts.lending.address)
        ]);

        // Use TWAP price as the true market price baseline when available
        let preAttackPrice = ethers.utils.parseEther("0.667"); // fallback for pre-TWAP state
        if (contracts.twapOracle && securityData.twapPrice && parseFloat(securityData.twapPrice) > 0) {
          preAttackPrice = ethers.utils.parseEther(securityData.twapPrice);
        }

        // Get attacker state for collateral calculations
        const attackerState = await contracts.attacker.getState();
        const collateralB = attackerState.myCollateral.gt(0) ? 
          attackerState.myCollateral : 
          ethers.utils.parseEther("1199"); // Use reasonable default for calculation

        // Calculate scenarios for different flash loan amounts
        const scenarios = {};
        const amounts = [
          { key: 'baselineAttack', amount: ethers.utils.parseEther("2000") },
          { key: 'aggressiveAttack', amount: ethers.utils.parseEther("5000") },
          { key: 'maximalAttack', amount: ethers.utils.parseEther("10000") }
        ];

        for (const { key, amount } of amounts) {
          const flashFee = amount.mul(5).div(10000); // 0.05%
          
          // Vulnerable system profitability
          const spotPrice = ethers.utils.parseEther(securityData.spotPrice || "0.667");
          const vulnerableCollateralValue = collateralB.mul(spotPrice).div(ethers.utils.parseEther("1"));
          const vulnerableMaxBorrow = vulnerableCollateralValue.mul(75).div(100); // 75% LTV
          const vulnerableProfit = vulnerableMaxBorrow.sub(amount).sub(flashFee);

          // TWAP system profitability
          const twapPrice = ethers.utils.parseEther(securityData.twapPrice || "0.667");
          const twapCollateralValue = collateralB.mul(twapPrice).div(ethers.utils.parseEther("1"));
          const twapMaxBorrow = twapCollateralValue.mul(75).div(100);
          const twapProfit = twapMaxBorrow.sub(amount).sub(flashFee);

          scenarios[key] = {
            flashAmount: ethers.utils.formatEther(amount),
            profitVulnerable: ethers.utils.formatEther(vulnerableProfit),
            profitTwap: ethers.utils.formatEther(twapProfit)
          };
        }

        // Get TWAP oracle health
        let twapHealth = { status: "Not Available", risk: "Unknown", dataPoints: 0 };
        if (contracts.twapOracle) {
          try {
            const historyLength = await contracts.twapOracle.getPriceHistoryLength();
            twapHealth = {
              status: historyLength.gt(0) ? "Active" : "Building History",
              risk: historyLength.gt(3) ? "Low" : "Medium",
              dataPoints: historyLength.toNumber()
            };
          } catch (err) {
            twapHealth = { status: "Error", risk: "High", dataPoints: 0 };
          }
        }

        // Get multi-oracle health and individual oracle prices
        let multiOracleHealth = { status: "Not Available", risk: "Unknown", activeOracles: 0 };
        let individualOracles = [];
        
        if (contracts.multiOracle) {
          try {
            const activeCount = await contracts.multiOracle.getActiveOracleCount();
            const oracleCount = await contracts.multiOracle.getOracleCount();
            
            // Get individual oracle prices and info
            for (let i = 0; i < oracleCount.toNumber(); i++) {
              try {
                const [oracle, weight, isActive, isTWAP, maxDeviation, name] = await contracts.multiOracle.getOracleInfo(i);
                
                let price = "0";
                let status = "Inactive";
                let deviation = "0";
                
                // Get actual price that multi-oracle is using
                if (isActive) {
                  try {
                    if (isTWAP) {
                      // Use the same TWAP data as main display
                      price = securityData.twapPrice;
                      status = securityData.twapAvailable ? "Active" : "Building History";
                    } else {
                      // For non-TWAP oracles, get from multi-oracle contract
                      const priceResult = await contracts.multiOracle._getOraclePrice(i);
                      price = ethers.utils.formatEther(priceResult);
                      status = "Active";
                    }
                  } catch (err) {
                    status = "Error: " + err.message.slice(0, 30) + "...";
                  }
                }
                
                individualOracles.push({
                  name,
                  address: oracle.slice(0, 8) + "..." + oracle.slice(-6),
                  price,
                  weight: (weight.toNumber() / 100).toFixed(1),
                  isActive,
                  isTWAP,
                  maxDeviation: (maxDeviation.toNumber() / 100).toFixed(1),
                  status,
                  deviation
                });
                
              } catch (err) {
                console.log(`Failed to get oracle ${i} info:`, err.message);
              }
            }
            
            // Calculate deviations between oracles - FIXED CALCULATION
            if (individualOracles.length >= 2) {
              const activePrices = individualOracles
                .filter(o => o.isActive && parseFloat(o.price) > 0)
                .map(o => parseFloat(o.price));
              
              if (activePrices.length >= 2) {
                // Properly calculate median
                const sortedPrices = [...activePrices].sort((a, b) => a - b);
                let median;
                if (sortedPrices.length % 2 === 0) {
                  // Even number - average of two middle elements
                  median = (sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2;
                } else {
                  // Odd number - middle element
                  median = sortedPrices[Math.floor(sortedPrices.length / 2)];
                }
                
                console.log("Multi-Oracle Debug:", {
                  activePrices,
                  sortedPrices,
                  median,
                  oracleCount: individualOracles.length
                });
                
                // Calculate deviations from median
                individualOracles.forEach(oracle => {
                  if (oracle.isActive && parseFloat(oracle.price) > 0) {
                    const price = parseFloat(oracle.price);
                    oracle.deviation = Math.abs(((price - median) / median) * 100).toFixed(2);
                  }
                });
              }
            }
            
            multiOracleHealth = {
              status: activeCount.gte(2) ? "Active" : "Insufficient Sources",
              risk: activeCount.gte(3) ? "Very Low" : activeCount.gte(2) ? "Low" : "High",
              activeOracles: activeCount.toNumber()
            };
          } catch (err) {
            multiOracleHealth = { status: "Error: " + err.message.slice(0, 30), risk: "High", activeOracles: 0 };
          }
        }

        // Get TWAP statistics and historical data points for better understanding
        let twapDataPoints = 0;
        let twapOldestTimestamp = 0;
        let twapPriceHistory = [];
        
        if (contracts.twapOracle) {
          try {
            const [latestPrice, twapPrice, dataPoints, oldestTimestamp] = await contracts.twapOracle.getPriceStats();
            twapDataPoints = dataPoints.toNumber();
            twapOldestTimestamp = oldestTimestamp.toNumber();
            
            // Fetch individual price history points
            for (let i = 0; i < Math.min(dataPoints.toNumber(), 10); i++) { // Show last 10 points max
              try {
                const pricePoint = await contracts.twapOracle.priceHistory(i);
                twapPriceHistory.push({
                  price: ethers.utils.formatEther(pricePoint.price),
                  timestamp: pricePoint.timestamp.toNumber(),
                  blockNumber: pricePoint.blockNumber.toNumber(),
                  timeAgo: Math.floor((Date.now() / 1000 - pricePoint.timestamp.toNumber()) / 60) // minutes ago
                });
              } catch (err) {
                console.log(`Failed to fetch TWAP history point ${i}:`, err.message);
                break;
              }
            }
          } catch (err) {
            console.log("Failed to get TWAP stats:", err.message);
          }
        }

        setRealTimeData({
          preAttackPrice: ethers.utils.formatEther(preAttackPrice),
          vulnerableCollateralValue: ethers.utils.formatEther(collateralB.mul(ethers.utils.parseEther(securityData.spotPrice || "0.667")).div(ethers.utils.parseEther("1"))),
          vulnerableMaxBorrow: ethers.utils.formatEther(collateralB.mul(ethers.utils.parseEther(securityData.spotPrice || "0.667")).div(ethers.utils.parseEther("1")).mul(75).div(100)),
          twapCollateralValue: ethers.utils.formatEther(collateralB.mul(ethers.utils.parseEther(securityData.twapPrice || "0.667")).div(ethers.utils.parseEther("1"))),
          twapMaxBorrow: ethers.utils.formatEther(collateralB.mul(ethers.utils.parseEther(securityData.twapPrice || "0.667")).div(ethers.utils.parseEther("1")).mul(75).div(100)),
          multiOraclePrice: securityData.multiOraclePrice || "0.667",
          multiOracleStatus: securityData.multiOracleAvailable === true ? "Active" : 
                           securityData.multiOracleAvailable === "ERROR" ? "Attack Detected" : 
                           securityData.circuitBreakerStatus.includes("Multi-Oracle Active") ? "Active" :
                           securityData.circuitBreakerStatus.includes("Variance Mode") ? "Active (Variance)" :
                           "Initializing",
          collateralAmount: ethers.utils.formatEther(collateralB),
          poolBalanceA: ethers.utils.formatEther(poolBalanceA),
          individualOracles: individualOracles,
          twapDataPoints: twapDataPoints,
          twapOldestTimestamp: twapOldestTimestamp,
          twapPriceHistory: twapPriceHistory
        });

        setAttackScenarios(scenarios);
        
        setOracleHealth({
          vulnerable: { status: "Active", risk: "Critical" },
          twap: twapHealth,
          multiOracle: multiOracleHealth
        });

      } catch (error) {
        console.error("Error fetching real-time data:", error);
      }
    };

    fetchRealTimeData();
    const interval = setInterval(fetchRealTimeData, 3000);
    
    return () => clearInterval(interval);
  }, [isOpen, signer, getContracts, securityData]);

  if (!isOpen) return null;

  // Dynamic chart data based on real prices  
  const currentSpotPrice = parseFloat(securityData.spotPrice) || 0.667;
  const currentTwapPrice = parseFloat(securityData.twapPrice) || 0.667;
  const preAttackPrice = parseFloat(realTimeData.preAttackPrice) || 0.667;

  const chartData = {
    labels: ['Pre-Attack (Equilibrium)', 'Post-Flash-Loan (Manipulated)', 'TWAP Protection Response'],
    datasets: [
      {
        label: '❌ Vulnerable Spot Price (A per B)',
        data: [preAttackPrice, currentSpotPrice, currentSpotPrice],
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderWidth: 4,
        pointBackgroundColor: '#ef4444',
        pointRadius: 8,
        fill: false
      },
      {
        label: '🛡️ TWAP Price (A per B) - Protected',
        data: [preAttackPrice, currentTwapPrice, currentTwapPrice],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderWidth: 4,
        pointBackgroundColor: '#10b981',
        pointRadius: 8,
        fill: false
      },
      {
        label: '📊 True Market Price (A per B)',
        data: [preAttackPrice, preAttackPrice, preAttackPrice],
        borderColor: '#6b7280',
        backgroundColor: 'rgba(107, 114, 128, 0.1)',
        borderWidth: 2,
        borderDash: [5, 5],
        pointBackgroundColor: '#6b7280',
        pointRadius: 6,
        fill: false
      }
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#fff', font: { size: 12 } }
      },
      title: {
        display: true,
        text: 'Real-Time Oracle Price Response to Flash Loan Attack',
        color: '#fff',
        font: { size: 14, weight: 'bold' }
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        ticks: { color: '#9ca3af', font: { size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        ticks: { color: '#9ca3af', font: { size: 10 } },
        title: {
          display: true,
          text: 'Price (A per B)',
          color: '#9ca3af'
        }
      }
    },
    elements: {
      line: { tension: 0.2 }
    }
  };

  const getSecurityStatus = () => {
    const deviation = parseFloat(securityData.priceDeviation);
    if (deviation > 50) return { status: "🚨 CRITICAL", color: "#7f1d1d", desc: "Major manipulation detected" };
    if (deviation > 10) return { status: "⚠️ WARNING", color: "#92400e", desc: "Price deviation detected" };
    return { status: "✅ SECURE", color: "#064e3b", desc: "System protected" };
  };

  const security = getSecurityStatus();

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: '#1f2937',
        borderRadius: '12px',
        padding: '1.5rem',
        width: '95%',
        maxWidth: '1200px',
        maxHeight: '90%',
        overflow: 'auto',
        border: '1px solid #374151'
      }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <div>
            <h2 style={{ color: '#fff', margin: 0, fontSize: '1.4rem' }}>
              🛡️ Real-Time Oracle Security Analysis
            </h2>
            <p style={{ color: '#9ca3af', margin: '0.3rem 0 0 0', fontSize: '0.9rem' }}>
              Live comparison of vulnerable vs protected price oracles during flash loan attack
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#374151',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Oracle Health Status Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          {/* Vulnerable System */}
          <div style={{
            backgroundColor: '#7f1d1d',
            padding: '1rem',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ color: '#fca5a5', fontWeight: 'bold', fontSize: '0.9rem' }}>❌ VULNERABLE ORACLE</span>
              <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>{oracleHealth.vulnerable.risk} Risk</span>
            </div>
            <div style={{ color: '#fff', fontSize: '1.1rem', margin: '0.5rem 0' }}>
              {securityData.spotPrice} A per B
            </div>
            <div style={{ color: '#fca5a5', fontSize: '0.8rem' }}>
              Status: {oracleHealth.vulnerable.status} • Uses spot price directly
            </div>
          </div>

          {/* TWAP Oracle */}
          <div style={{
            backgroundColor: oracleHealth.twap.status === "Active" ? '#064e3b' : '#92400e',
            padding: '1rem',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ color: '#6ee7b7', fontWeight: 'bold', fontSize: '0.9rem' }}>🛡️ TWAP ORACLE</span>
              <span style={{ color: '#10b981', fontSize: '0.8rem' }}>{oracleHealth.twap.risk} Risk</span>
            </div>
            <div style={{ color: '#fff', fontSize: '1.1rem', margin: '0.5rem 0' }}>
              {securityData.twapPrice} A per B
            </div>
            <div style={{ color: '#6ee7b7', fontSize: '0.8rem' }}>
              Status: {oracleHealth.twap.status} • Data Points: {oracleHealth.twap.dataPoints}
            </div>
          </div>

          {/* Multi-Oracle */}
          <div style={{
            backgroundColor: oracleHealth.multiOracle.status === "Active" ? '#064e3b' : '#92400e',
            padding: '1rem',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ color: '#6ee7b7', fontWeight: 'bold', fontSize: '0.9rem' }}>🔗 MULTI-ORACLE</span>
              <span style={{ color: '#10b981', fontSize: '0.8rem' }}>{oracleHealth.multiOracle.risk} Risk</span>
            </div>
            <div style={{ color: '#fff', fontSize: '1.1rem', margin: '0.5rem 0' }}>
              {realTimeData.multiOraclePrice} A per B
            </div>
            <div style={{ color: '#6ee7b7', fontSize: '0.8rem' }}>
              Status: {realTimeData.multiOracleStatus} • Active Oracles: {oracleHealth.multiOracle.activeOracles}
            </div>
          </div>
        </div>

        {/* Price Chart */}
        <div style={{ backgroundColor: '#111827', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
          <Line data={chartData} options={chartOptions} height={60} />
        </div>

        {/* Individual Oracle Breakdown */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '1.5rem',
          marginBottom: '1.5rem'
        }}>
          {/* TWAP Oracle Details */}
          <div style={{
            backgroundColor: '#111827',
            padding: '1rem',
            borderRadius: '8px'
          }}>
            <h3 style={{ color: '#10b981', margin: '0 0 1rem 0', fontSize: '1rem' }}>🛡️ TWAP Oracle Details</h3>
            <div style={{ fontSize: '0.85rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: '#9ca3af' }}>Current Price: </span>
                <span style={{ color: '#6ee7b7', fontWeight: 'bold' }}>{securityData.twapPrice} A per B</span>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: '#9ca3af' }}>Data Points: </span>
                <span style={{ color: '#fff' }}>{realTimeData.twapDataPoints}</span>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: '#9ca3af' }}>History Age: </span>
                <span style={{ color: '#fff' }}>
                  {realTimeData.twapOldestTimestamp > 0 ? 
                    Math.floor((Date.now() / 1000 - realTimeData.twapOldestTimestamp) / 60) + " minutes" : 
                    "New"}
                </span>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ color: '#9ca3af' }}>Deviation from Spot: </span>
                <span style={{ 
                  color: parseFloat(securityData.priceDeviation) > 10 ? '#ef4444' : '#10b981' 
                }}>
                  {securityData.priceDeviation}%
                </span>
              </div>

              {/* TWAP Price History */}
              {realTimeData.twapPriceHistory.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ color: '#9ca3af', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                    <strong>Price History (Last {realTimeData.twapPriceHistory.length} points):</strong>
                  </div>
                  <div style={{ 
                    maxHeight: '120px', 
                    overflowY: 'auto',
                    backgroundColor: '#0f172a',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #475569'
                  }}>
                    {realTimeData.twapPriceHistory.slice().reverse().map((point, index) => (
                      <div key={index} style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr 1fr', 
                        gap: '0.5rem',
                        padding: '0.3rem 0',
                        borderBottom: index < realTimeData.twapPriceHistory.length - 1 ? '1px solid #374151' : 'none',
                        fontSize: '0.75rem'
                      }}>
                        <div>
                          <span style={{ color: '#6ee7b7', fontWeight: 'bold' }}>
                            {parseFloat(point.price).toFixed(3)}
                          </span>
                        </div>
                        <div style={{ color: '#9ca3af' }}>
                          {point.timeAgo}m ago
                        </div>
                        <div style={{ color: '#6b7280' }}>
                          Block #{point.blockNumber}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ 
                    fontSize: '0.7rem', 
                    color: '#6b7280', 
                    marginTop: '0.3rem',
                    textAlign: 'center'
                  }}>
                    ⚡ TWAP averages these prices by time duration between updates
                  </div>
                </div>
              )}
              
              <div style={{ 
                fontSize: '0.75rem', 
                color: '#6b7280', 
                marginTop: '0.5rem',
                padding: '0.5rem',
                backgroundColor: '#064e3b',
                borderRadius: '4px'
              }}>
                <strong>How TWAP Works:</strong><br/>
                • Averages prices over 5-minute window<br/>
                • Weights by time duration between updates<br/>
                • Resists flash loan manipulation<br/>
                • Updates every 60 seconds minimum
              </div>
            </div>
          </div>

          {/* Multi-Oracle Breakdown */}
          <div style={{
            backgroundColor: '#111827',
            padding: '1rem',
            borderRadius: '8px'
          }}>
            <h3 style={{ color: '#6366f1', margin: '0 0 1rem 0', fontSize: '1rem' }}>🔗 Multi-Oracle Sources</h3>
            <div style={{ fontSize: '0.85rem' }}>
              {realTimeData.individualOracles.length > 0 ? (
                <>
                  {realTimeData.individualOracles.map((oracle, index) => (
                    <div key={index} style={{ 
                      marginBottom: '0.7rem',
                      padding: '0.5rem',
                      backgroundColor: oracle.isActive ? '#1e293b' : '#374151',
                      borderRadius: '4px',
                      border: `1px solid ${oracle.isActive ? '#475569' : '#6b7280'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <span style={{ color: '#fff', fontWeight: 'bold' }}>{oracle.name}</span>
                        <span style={{ 
                          color: oracle.isActive ? '#10b981' : '#6b7280',
                          fontSize: '0.8rem'
                        }}>
                          {oracle.status}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Price: </span>
                          <span style={{ color: '#fff' }}>{parseFloat(oracle.price).toFixed(3)}</span>
                        </div>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Weight: </span>
                          <span style={{ color: '#fff' }}>{oracle.weight}%</span>
                        </div>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Type: </span>
                          <span style={{ color: oracle.isTWAP ? '#10b981' : '#fbbf24' }}>
                            {oracle.isTWAP ? 'TWAP' : 'Spot'}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: '#9ca3af' }}>Deviation: </span>
                          <span style={{ 
                            color: parseFloat(oracle.deviation) > parseFloat(oracle.maxDeviation) ? '#ef4444' : '#10b981'
                          }}>
                            {oracle.deviation}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: '#6b7280', 
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: '#1e293b',
                    borderRadius: '4px'
                  }}>
                    <strong>How Multi-Oracle Works:</strong><br/>
                    • Calculates median of all active sources<br/>
                    • Filters outliers exceeding max deviation<br/>
                    • Weighted average of remaining sources<br/>
                    • Requires minimum 2 valid sources
                  </div>
                </>
              ) : (
                <div style={{ color: '#6b7280', textAlign: 'center', padding: '1rem' }}>
                  No multi-oracle sources configured
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Attack Profitability Analysis */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: '1.5rem',
          marginBottom: '1.5rem'
        }}>
          {/* Vulnerable System Impact */}
          <div style={{
            backgroundColor: '#111827',
            padding: '1rem',
            borderRadius: '8px'
          }}>
            <h3 style={{ color: '#ef4444', margin: '0 0 1rem 0', fontSize: '1rem' }}>❌ Vulnerable System Impact</h3>
            <div style={{ fontSize: '0.85rem' }}>
              <div style={{ marginBottom: '0.7rem' }}>
                <span style={{ color: '#9ca3af' }}>Collateral Value (inflated): </span>
                <span style={{ color: '#fca5a5' }}>{parseFloat(realTimeData.vulnerableCollateralValue).toFixed(0)} A</span>
              </div>
              <div style={{ marginBottom: '0.7rem' }}>
                <span style={{ color: '#9ca3af' }}>Max Borrowing Power: </span>
                <span style={{ color: '#fca5a5' }}>{parseFloat(realTimeData.vulnerableMaxBorrow).toFixed(0)} A</span>
              </div>
              
              <div style={{ marginTop: '1rem' }}>
                <strong style={{ color: '#fca5a5' }}>Attack Scenarios:</strong>
                <div style={{ marginTop: '0.5rem' }}>
                  <div>• Baseline (2K flash): <span style={{ color: parseFloat(attackScenarios.baselineAttack.profitVulnerable) > 0 ? '#10b981' : '#ef4444' }}>
                    {parseFloat(attackScenarios.baselineAttack.profitVulnerable).toFixed(0)} A profit
                  </span></div>
                  <div>• Aggressive (5K flash): <span style={{ color: parseFloat(attackScenarios.aggressiveAttack.profitVulnerable) > 0 ? '#10b981' : '#ef4444' }}>
                    {parseFloat(attackScenarios.aggressiveAttack.profitVulnerable).toFixed(0)} A profit
                  </span></div>
                  <div>• Maximal (10K flash): <span style={{ color: parseFloat(attackScenarios.maximalAttack.profitVulnerable) > 0 ? '#10b981' : '#ef4444' }}>
                    {parseFloat(attackScenarios.maximalAttack.profitVulnerable).toFixed(0)} A profit
                  </span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Protected System Impact */}
          <div style={{
            backgroundColor: '#111827',
            padding: '1rem',
            borderRadius: '8px'
          }}>
            <h3 style={{ color: '#10b981', margin: '0 0 1rem 0', fontSize: '1rem' }}>🛡️ Protected System Impact</h3>
            <div style={{ fontSize: '0.85rem' }}>
              <div style={{ marginBottom: '0.7rem' }}>
                <span style={{ color: '#9ca3af' }}>Collateral Value (TWAP): </span>
                <span style={{ color: '#6ee7b7' }}>{parseFloat(realTimeData.twapCollateralValue).toFixed(0)} A</span>
              </div>
              <div style={{ marginBottom: '0.7rem' }}>
                <span style={{ color: '#9ca3af' }}>Max Borrowing Power: </span>
                <span style={{ color: '#6ee7b7' }}>{parseFloat(realTimeData.twapMaxBorrow).toFixed(0)} A</span>
              </div>
              
              <div style={{ marginTop: '1rem' }}>
                <strong style={{ color: '#6ee7b7' }}>Attack Scenarios:</strong>
                <div style={{ marginTop: '0.5rem' }}>
                  <div>• Baseline (2K flash): <span style={{ color: parseFloat(attackScenarios.baselineAttack.profitTwap) > 0 ? '#10b981' : '#ef4444' }}>
                    {parseFloat(attackScenarios.baselineAttack.profitTwap).toFixed(0)} A profit
                  </span></div>
                  <div>• Aggressive (5K flash): <span style={{ color: parseFloat(attackScenarios.aggressiveAttack.profitTwap) > 0 ? '#10b981' : '#ef4444' }}>
                    {parseFloat(attackScenarios.aggressiveAttack.profitTwap).toFixed(0)} A profit
                  </span></div>
                  <div>• Maximal (10K flash): <span style={{ color: parseFloat(attackScenarios.maximalAttack.profitTwap) > 0 ? '#10b981' : '#ef4444' }}>
                    {parseFloat(attackScenarios.maximalAttack.profitTwap).toFixed(0)} A profit
                  </span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Real-Time Security Metrics */}
        <div style={{
          backgroundColor: security.color,
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>📊 Live Security Assessment</h3>
            <span style={{ color: '#fff', fontWeight: 'bold' }}>{security.status}</span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
            <div>
              <div style={{ color: '#d1fae5' }}>Price Deviation:</div>
              <div style={{ color: '#fff', fontWeight: 'bold' }}>{securityData.priceDeviation}%</div>
            </div>
            <div>
              <div style={{ color: '#d1fae5' }}>Collateral at Risk:</div>
              <div style={{ color: '#fff', fontWeight: 'bold' }}>{parseFloat(realTimeData.collateralAmount).toFixed(0)} B tokens</div>
            </div>
            <div>
              <div style={{ color: '#d1fae5' }}>Pool Balance:</div>
              <div style={{ color: '#fff', fontWeight: 'bold' }}>{parseFloat(realTimeData.poolBalanceA).toFixed(0)} A tokens</div>
            </div>
            <div>
              <div style={{ color: '#d1fae5' }}>Protection Level:</div>
              <div style={{ color: '#fff', fontWeight: 'bold' }}>
                {oracleHealth.twap.status === "Active" && oracleHealth.multiOracle.status === "Active" ? "Maximum" :
                 oracleHealth.twap.status === "Active" ? "High" : "None"}
              </div>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div style={{ 
          fontSize: '0.8rem', 
          color: '#9ca3af',
          textAlign: 'center',
          padding: '0.5rem',
          backgroundColor: '#111827',
          borderRadius: '6px'
        }}>
          <p style={{ margin: '0.3rem 0' }}>
            <strong style={{ color: '#f87171' }}>Demo Takeaway:</strong> Flash loan attacks manipulate spot prices instantly, but time-weighted and multi-oracle systems resist manipulation by using historical data and consensus mechanisms.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SecurityModal;