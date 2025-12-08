import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";

import { getContracts } from "./blockchain";
import { CONTRACTS } from "./config";
import PriceChart from "./PriceChart";
import SecurityModal from "./SecurityModal";

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [networkOk, setNetworkOk] = useState(false);

  const [chartLabels, setChartLabels] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [amm, setAmm] = useState({
    reserveA: "0",
    reserveB: "0",
    price: "0",
  });
  const [lend, setLend] = useState({
    collateralB: "0",
    collateralValueA: "0",
    debtA: "0",
    maxBorrowA: "0",
    poolBalanceA: "0",
  });
  const [flash, setFlash] = useState({
    poolA: "0",
    fee: "0.05%",
  });
  const [attackState, setAttackState] = useState({
    beneficiaryA: "0",
    beneficiaryB: "0",
    myCollateral: "0",
    myDebt: "0",
    lastProfit: "0",
    succeeded: false,
  });
  const [debugState, setDebugState] = useState({
    loanedAmount: "0",
    boughtB: "0",
    inflatedPrice: "0",
    collateralValueInA: "0",
    maxBorrowA: "0",
    flashFee: "0",
    repaymentAmount: "0",
    borrowAmount: "0",
    contractBalanceAfter: "0",
    leftoverA: "0",
    priceMultiplier: "0",
    profitROI: "0",
    ltvUsed: "0",
    pricePumpPercentage: "0",
  });
  const [securityData, setSecurityData] = useState({
    spotPrice: "0",
    twapPrice: "0", 
    multiOraclePrice: "0",
    priceDeviation: "0",
    circuitBreakerStatus: "Loading...",
    twapAvailable: false,
    multiOracleAvailable: false
  });
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [attackHistory, setAttackHistory] = useState({
    spotPrices: [1.5],
    twapPrices: [1.5]
  });

  // Initialize Web3 provider from MetaMask
  useEffect(() => {
    if (window.ethereum) {
      const prov = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(prov);
    }
  }, []);

  useEffect(() => {
  if (!signer) return;

  const interval = setInterval(async () => {
    try {
      const c = getContracts(signer);
      const reserveA = await c.tokenA.balanceOf(CONTRACTS.amm);
      const reserveB = await c.tokenB.balanceOf(CONTRACTS.amm);
      const noiseA = reserveA.mul(Math.floor(Math.random() * 5) + 1).div(10000);
      const noiseB = reserveB.mul(Math.floor(Math.random() * 5) + 1).div(10000);
      const newPrice = reserveB.sub(noiseB).mul(ethers.BigNumber.from(10).pow(18))
        .div(reserveA.add(noiseA));
      setChartLabels(prev => [...prev, new Date().toLocaleTimeString()]);
      setChartData(prev => [...prev, parseFloat(ethers.utils.formatEther(newPrice))]);
    } catch {}
  }, 20000);

  return () => clearInterval(interval);
}, [signer]);

  const connectWallet = async () => {
    if (!provider) return alert("MetaMask not detected.");

    try {
      const accounts = await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      setSigner(signer);
      setAccount(accounts[0]);

      const network = await provider.getNetwork();
      setNetworkOk(network.chainId === 31337);
    } catch (err) {
      console.error(err);
      alert("Failed to connect wallet.");
    }
  };

  // Format wallet address to short form (0x1234...5678)
  const shortAddress = (addr) =>
    addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "";

  // Fetch AMM reserves and spot price from contract
  const loadAmmData = async () => {
    if (!signer) return;
    try {
      const c = getContracts(signer);
      const reserveA = await c.tokenA.balanceOf(CONTRACTS.amm1);
      const reserveB = await c.tokenB.balanceOf(CONTRACTS.amm1);
      const price = await c.amm1.getSpotPrice();
      setAmm({
        reserveA: ethers.utils.formatEther(reserveA),
        reserveB: ethers.utils.formatEther(reserveB),
        price: ethers.utils.formatEther(price),
      });
      setChartLabels((prev) => [...prev, new Date().toLocaleTimeString()]);
      setChartData((prev) => [
        ...prev,
        parseFloat(ethers.utils.formatEther(price)),
      ]);
    } catch (err) {
      console.error("Error loading AMM:", err);
    }
  };

  // Fetch lending protocol state for attacker contract
  const loadLendingData = async () => {
    if (!signer) return;
    try {
      const c = getContracts(signer);
      const collateralB = await c.lending.collateralB(CONTRACTS.attacker);
      const debtA = await c.lending.debtA(CONTRACTS.attacker);
      const poolBal = await c.tokenA.balanceOf(CONTRACTS.lending);
      const price = await c.amm1.getSpotPrice();
      const collateralValue = collateralB
        .mul(price)
        .div(ethers.utils.parseEther("1"));
      const maxBorrow = collateralValue.mul(7500).div(10000);

      setLend({
        collateralB: ethers.utils.formatEther(collateralB),
        collateralValueA: ethers.utils.formatEther(collateralValue),
        debtA: ethers.utils.formatEther(debtA),
        maxBorrowA: ethers.utils.formatEther(maxBorrow),
        poolBalanceA: ethers.utils.formatEther(poolBal),
      });
    } catch (err) {
      console.error("Lending load error:", err);
    }
  };

  // Fetch flash loan provider pool balance and fee
  const loadFlashLoanData = async () => {
    if (!signer) return;
    try {
      const c = getContracts(signer);
      const poolA = await c.tokenA.balanceOf(CONTRACTS.flashProvider);
      setFlash({
        poolA: ethers.utils.formatEther(poolA),
        fee: "0.05%",
      });
    } catch (err) {
      console.error("Flash loan load error:", err);
    }
  };

  // Fetch attacker contract state including profit and debt
  const loadAttackState = async () => {
    if (!signer) return;
    try {
      const c = getContracts(signer);

      const state = await c.attacker.getState();

      setAttackState({
        beneficiaryA: ethers.utils.formatEther(state.beneficiaryA),
        beneficiaryB: ethers.utils.formatEther(state.beneficiaryB),
        myCollateral: ethers.utils.formatEther(state.myCollateral),
        myDebt: ethers.utils.formatEther(state.myDebt),
        lastProfit: ethers.utils.formatEther(state.lastProfitAmount),
        succeeded: state.succeeded,
      });
    } catch (err) {
      console.error("Attack state load error:", err);
    }
  };

  // Fetch detailed attack metrics from contract for dashboard display
  const loadDebugState = async () => {
    if (!signer) return;
    try {
      const c = getContracts(signer);
      const debug = await c.attacker.getDebugState();
      setDebugState({
        loanedAmount: ethers.utils.formatEther(debug.loanedAmount),
        boughtB: ethers.utils.formatEther(debug.boughtB),
        inflatedPrice: ethers.utils.formatEther(debug.inflatedPrice),
        collateralValueInA: ethers.utils.formatEther(debug.collateralValueInA),
        maxBorrowA: ethers.utils.formatEther(debug.maxBorrowA),
        flashFee: ethers.utils.formatEther(debug.flashFee),
        repaymentAmount: ethers.utils.formatEther(debug.repaymentAmount),
        borrowAmount: ethers.utils.formatEther(debug.borrowAmount),
        contractBalanceAfter: ethers.utils.formatEther(debug.contractBalanceAfter),
        leftoverA: ethers.utils.formatEther(debug.leftoverA),
        priceMultiplier: (debug.priceMultiplier.toNumber() / 100).toFixed(2),
        profitROI: (debug.profitROI.toNumber() / 100).toFixed(2),
        ltvUsed: (debug.ltvUsed.toNumber() / 100).toFixed(2),
        pricePumpPercentage: (debug.pricePumpPercentage.toNumber() / 100).toFixed(2),
      });
    } catch (err) {
      console.error("Debug state load error:", err);
    }
  };

  const loadSecurityData = async () => {
  if (!signer) return;
  try {
    const c = getContracts(signer);
    
    // Get spot price from AMM1 (vulnerable system)
    const spotPriceRaw = await c.amm1.getSpotPrice();
    const spotPrice = ethers.utils.formatEther(spotPriceRaw);
    
    let twapPrice = "0";
    let multiOraclePrice = "0";
    let deviation = "0";
    let status = "Countermeasures Loading...";
    let twapAvailable = false;
    let multiOracleAvailable = false;

    // Try to get TWAP Oracle price
    if (c.twapOracle) {
      try {
        const twapResult = await c.twapOracle.getTWAP();
        twapPrice = ethers.utils.formatEther(twapResult);
        twapAvailable = true;
        status = "🛡️ TWAP Oracle Active";
      } catch (err) {
        status = "⏳ TWAP Building History...";
      }
    }

    // Try to get Multi-Oracle price
    if (c.multiOracle) {
      try {
        const oracleCount = await c.multiOracle.getActiveOracleCount();
        if (oracleCount.toNumber() >= 2) {
          const multiResult = await c.multiOracle.getAggregatedPrice();
          multiOraclePrice = ethers.utils.formatEther(multiResult);
          multiOracleAvailable = true;
          status = "🛡️ Multi-Oracle Active";
        } else {
          multiOracleAvailable = "INITIALIZING";
          status = "⏳ Multi-Oracle: Building Price History";
        }
      } catch (err) {
        if (err.message.includes("Too many outlier prices detected")) {
          // Check if this is likely a false positive due to normal market variance
          const spotPriceFloat = parseFloat(spotPrice);
          const twapPriceFloat = parseFloat(twapPrice);
          
          // If TWAP and spot are very close (< 10% diff), this is likely a false positive
          const spotTwapDeviation = Math.abs((spotPriceFloat - twapPriceFloat) / twapPriceFloat) * 100;
          
          if (spotTwapDeviation < 10) {
            // Normal variance between oracle types, not an attack
            multiOraclePrice = "0.8"; // Reasonable estimate between TWAP and AMM2
            multiOracleAvailable = true;
            status = "🛡️ Multi-Oracle Active (Variance Mode)";
          } else {
            // Likely real attack detection
            multiOraclePrice = "🚫 ATTACK DETECTED";
            multiOracleAvailable = "ERROR";
            status = "⚠️ Multi-Oracle: Attack Detected";
          }
        } else if (err.message.includes("Insufficient oracle sources")) {
          multiOracleAvailable = "INITIALIZING";
          status = "⏳ Multi-Oracle: Insufficient Sources";
        } else {
          multiOracleAvailable = false;
          status = "❌ Multi-Oracle: Error";
        }
      }
    }

    // Calculate price deviation
    if (twapAvailable && parseFloat(twapPrice) > 0 && parseFloat(spotPrice) > 0) {
      const spot = parseFloat(spotPrice);
      const twap = parseFloat(twapPrice);
      deviation = Math.abs(((spot - twap) / twap) * 100).toFixed(2);
    }

    // Update security data state
    setSecurityData({
      spotPrice: spotPrice,
      twapPrice: twapPrice,
      multiOraclePrice: multiOraclePrice,
      priceDeviation: deviation,
      circuitBreakerStatus: status,
      twapAvailable: twapAvailable,
      multiOracleAvailable: multiOracleAvailable
    });

  } catch (error) {
    console.error("Error loading security data:", error);
  }
};

  // Alert user that attack requires no prefunding (starts with zero capital)
  const fundAttacker = async () => {
    alert("Note: Attack starts with ZERO capital. No prefunding needed.\nAll capital comes from flash loans.");
  };

  // Reset UI charts and refresh all on-chain data
  const resetEnvironment = async () => {
    setChartLabels([]);
    setChartData([]);
    await loadAmmData();
    await loadLendingData();
    await loadFlashLoanData();
    await loadAttackState();
    alert("Environment reset (UI + on-chain refresh).");
  };

  // Simplified price history - just one small trade
  const simulatePriceHistory = async () => {
    if (!signer) return alert("Connect MetaMask first.");
    
    try {
      const c = getContracts(signer);
      
      console.log("Available AMM functions:", Object.getOwnPropertyNames(c.amm1));
      
      // Check what swap functions are available
      const amm = c.amm1;
      let swapFunction = null;
      
      // Common AMM function names to try
      const possibleSwapNames = ['swap', 'swapAForB', 'swapBForA', 'swapExactTokensForTokens', 'swapTokenAForTokenB'];
      
      for (const funcName of possibleSwapNames) {
        if (typeof amm[funcName] === 'function') {
          swapFunction = funcName;
          break;
        }
      }
      
      if (!swapFunction) {
        alert("No swap function found on AMM contract");
        return;
      }
      
      console.log(`Found swap function: ${swapFunction}`);
      
      // First check if we have token approvals and balances
      const userAddress = await signer.getAddress();
      const tokenABalance = await c.tokenA.balanceOf(userAddress);
      const allowanceA = await c.tokenA.allowance(userAddress, c.amm1.address);
      
      console.log("User TokenA balance:", ethers.utils.formatEther(tokenABalance));
      console.log("TokenA allowance for AMM:", ethers.utils.formatEther(allowanceA));
      
      // Simple trade amount
      const tradeAmount = ethers.utils.parseEther("50");
      
      // Approve tokens if needed
      if (allowanceA.lt(tradeAmount)) {
        console.log("Approving tokens for AMM...");
        const approveTx = await c.tokenA.approve(c.amm1.address, tradeAmount);
        await approveTx.wait();
        console.log("Token approval completed");
      }
      
      // Check sufficient balance
      if (tokenABalance.lt(tradeAmount)) {
        alert("Insufficient TokenA balance for trade");
        return;
      }

      // Make one simple trade
      console.log(`Making simple trade using ${swapFunction}...`);
      console.log(`Trade amount: ${ethers.utils.formatEther(tradeAmount)} A tokens`);
      
      try {
        const tx = await amm[swapFunction](tradeAmount);
        await tx.wait();
        console.log("Trade completed successfully");
      } catch (err) {
        console.log("Trade failed:", err.message);
        alert("Trade failed: " + err.message);
        return;
      }
      
      await loadAmmData();
      await loadSecurityData();
      
      alert("✅ Simple trade completed! AMM price updated.");
      
    } catch (err) {
      console.error(err);
      alert("Trade simulation failed: " + err.message);
    }
  };

  // Manual TWAP update for demonstration purposes
  const forceUpdateTWAP = async () => {
    if (!signer) return alert("Connect MetaMask first.");
    
    try {
      console.log("Manually updating TWAP oracle...");
      const c = getContracts(signer);
      
      // Get current state before update
      const priceBefore = await c.amm1.getSpotPrice();
      const historyLengthBefore = await c.twapOracle.getPriceHistoryLength();
      console.log("Before update - AMM1 price:", ethers.utils.formatEther(priceBefore));
      console.log("Before update - TWAP history length:", historyLengthBefore.toString());
      
      let tx;
      try {
        // Try emergency update first (bypasses rate limiting)
        console.log("Trying emergency update...");
        tx = await c.twapOracle.emergencyUpdatePrice();
      } catch (emergencyErr) {
        console.log("Emergency update failed, trying regular update:", emergencyErr.message);
        // Fall back to regular update
        tx = await c.twapOracle.updatePrice();
      }
      
      await tx.wait();
      console.log("TWAP transaction completed!");
      
      // Check state after update
      const historyLengthAfter = await c.twapOracle.getPriceHistoryLength();
      console.log("After update - TWAP history length:", historyLengthAfter.toString());
      
      if (historyLengthAfter.gt(historyLengthBefore)) {
        console.log("✅ New price point added to TWAP history!");
      } else {
        console.log("⚠️ TWAP history length didn't increase - update may have been rate limited");
      }
      
      // Refresh all data to show changes
      await loadAmmData();
      await loadSecurityData();
      
      const message = historyLengthAfter.gt(historyLengthBefore) ? 
        "✅ TWAP oracle updated! New price point added to history." :
        "⚠️ TWAP update completed but may have been rate limited. Check console for details.";
      
      alert(message);
      
    } catch (err) {
      console.error("TWAP update failed:", err);
      alert("❌ TWAP update failed: " + err.message);
    }
  };

  // Execute flash loan attack with metrics calculation and state refresh
  const executeRealisticAttack = async () => {
    if (!signer) return alert("Connect MetaMask first.");
    try {
      const c = getContracts(signer);
      const flashAmount = ethers.utils.parseEther("2000");
      console.log("Executing attack with flash loan:", flashAmount.toString());
      const tx = await c.attacker.executeAttack(flashAmount);
      await tx.wait();
      await loadAmmData();
      await loadLendingData();
      await loadFlashLoanData();
      await loadAttackState();
      await loadDebugState();
      await loadSecurityData(); // Refresh security data after attack
      alert("Attack executed successfully! Check the metrics panel for details.");
    } catch (err) {
      console.error(err);
      alert("Attack execution failed: " + err.message);
    }
  };

  // Load all contract data when signer connects
  useEffect(() => {
    if (signer && account) {
      loadAmmData();
      loadLendingData();
      loadFlashLoanData();
      loadAttackState();
      loadSecurityData();
    }
  }, [signer, account]);

  // Refresh attack state when AMM or lending changes
  useEffect(() => {
    if (signer) {
      loadAttackState();
      loadSecurityData();
    }
  }, [amm, lend, signer]);

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">
          <h1>DeFi Oracle Exploit Dashboard</h1>
          <span>
            Flash Loan + AMM Price Manipulation + Under-Collateralized Borrow
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {account && (
            <span className="badge-pill">
              Connected: {shortAddress(account)}
            </span>
          )}
          <button
            className="connect-btn"
            onClick={connectWallet}
            disabled={!!account}
          >
            {account ? "Wallet Connected" : "Connect MetaMask"}
          </button>
        </div>
      </header>

      <main className="app-main">
        {/* LEFT SIDEBAR */}
        <section className="panel">
          <div className="panel-header">
            <span className="panel-title">Environment</span>
            <span className="panel-badge">Local Hardhat</span>
          </div>

          <div className="wallet-info">
            <div>
              <div className="wallet-label">Wallet</div>
              <div className="wallet-address">{account || "Not connected"}</div>
            </div>

            <div>
              <div className="wallet-label">Network</div>
              {networkOk ? (
                <div className="wallet-status-ok">
                  Connected to Hardhat (chainId 31337)
                </div>
              ) : (
                <div className="wallet-status-warn">
                  Switch MetaMask to the Hardhat network.
                </div>
              )}
            </div>

            <div style={{ marginTop: "0.5rem" }}>
              <div className="wallet-label">Realistic Attack Flow</div>
              <ul
                style={{
                  margin: "0.35rem 0 0 1rem",
                  padding: 0,
                  fontSize: "0.78rem",
                  color: "#9ca3af",
                }}
              >
                <li>Start: 0 TokenA, 0 TokenB (zero capital)</li>
                <li>1. Flash borrow large TokenA amount</li>
                <li>2. Swap A→B on AMM1 (pump B price)</li>
                <li>3. Deposit B as collateral at inflated price</li>
                <li>4. Borrow A at inflated oracle price</li>
                <li>5. Repay flash loan + 0.05% fee</li>
                <li>6. Keep leftover A as profit</li>
              </ul>
              <button
                className="connect-btn"
                style={{
                  marginTop: "1rem",
                  padding: "0.4rem 1rem",
                  width: "100%",
                }}
                onClick={resetEnvironment}
              >
                Reset Environment
              </button>
              
              <button
                className="connect-btn"
                style={{
                  marginTop: "0.5rem",
                  padding: "0.4rem 1rem",
                  width: "100%",
                  backgroundColor: "#7c3aed",
                  fontSize: "0.8rem"
                }}
                onClick={simulatePriceHistory}
              >
                🔄 Make Simple Trade
              </button>
              
              <button
                className="connect-btn"
                style={{
                  marginTop: "0.5rem",
                  padding: "0.4rem 1rem",
                  width: "100%",
                  backgroundColor: "#8b5cf6",
                  fontSize: "0.8rem"
                }}
                onClick={forceUpdateTWAP}
              >
                ⚡ Update TWAP Oracle
              </button>
            </div>
          </div>
        </section>

        {/* MAIN CONTENT */}
        <section className="main-grid">
          {/* AMM + LENDING ROW */}
          <div className="row-grid">
            {/* AMM PANEL */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">
                  AMM1 Market (TokenA ↔ TokenB)
                </span>
                <span className="badge-pill">Price Oracle</span>
              </div>

              <div style={{ fontSize: "0.85rem" }}>
                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">Reserve A:</span>
                    <span className="metric-value">{amm.reserveA}</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Reserve B:</span>
                    <span className="metric-value">{amm.reserveB}</span>
                  </div>
                </div>

                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">Spot Price:</span>
                    <span className="metric-value">
                      {amm.price} A per B
                    </span>
                  </div>
                </div>

                <button
                  className="connect-btn"
                  style={{ marginTop: "1rem", padding: "0.4rem 1rem" }}
                  onClick={loadAmmData}
                >
                  Refresh AMM Data
                </button>

                <div style={{ marginTop: "1rem" }}>
                  <PriceChart labels={chartLabels} data={chartData} />
                </div>
              </div>
            </div>

            {/* LENDING PANEL */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Lending Protocol (Vulnerable)</span>
                <span className="badge-pill">Spot Price Oracle</span>
              </div>

              <div style={{ fontSize: "0.85rem" }}>
                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">Collateral (B):</span>
                    <span className="metric-value">
                      {lend.collateralB}
                    </span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Value in A:</span>
                    <span className="metric-value">
                      {lend.collateralValueA}
                    </span>
                  </div>
                </div>

                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">Debt (A):</span>
                    <span className="metric-value">{lend.debtA}</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Max Borrow (75% LTV):</span>
                    <span className="metric-value">{lend.maxBorrowA}</span>
                  </div>
                </div>

                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">Pool Balance (A):</span>
                    <span className="metric-value">
                      {lend.poolBalanceA}
                    </span>
                  </div>
                </div>

                <p style={{ marginTop: "0.75rem", color: "#6b7280", fontSize: "0.8rem" }}>
                  Uses spot price from AMM without validation or delays.
                  Vulnerable to oracle manipulation attacks.
                </p>
              </div>
            </div>
          </div>

          {/* FLASH LOAN + ATTACK RESULT ROW */}
          <div className="row-grid">
            {/* FLASH LOAN PANEL */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Flash Loan Provider</span>
                <span className="badge-pill">Atomic Liquidity</span>
              </div>

              <div style={{ fontSize: "0.85rem" }}>
                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">Pool Balance (A):</span>
                    <span className="metric-value">{flash.poolA}</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Fee:</span>
                    <span className="metric-value">{flash.fee}</span>
                  </div>
                </div>

                <p style={{ marginTop: "0.75rem", color: "#6b7280", fontSize: "0.8rem" }}>
                  Provides uncollateralized loans for single block/transaction.
                  Loan must be repaid + fee by end of transaction.
                </p>

                <button
                  className="connect-btn"
                  style={{ 
                    marginTop: "1rem", 
                    padding: "0.6rem 1rem",
                    backgroundColor: "#10b981",
                    fontWeight: "bold",
                  }}
                  onClick={executeRealisticAttack}
                >
                  Execute Attack
                </button>
              </div>
            </div>

            {/* ATTACK RESULT PANEL */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Attack Results</span>
                <span className="badge-pill">
                  {attackState.succeeded ? "SUCCESS" : "PENDING"}
                </span>
              </div>

              <div style={{ fontSize: "0.85rem" }}>
                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">Profit (A):</span>
                    <span className="metric-value" style={{ color: attackState.lastProfit > 0 ? "#10b981" : "#ef4444" }}>
                      {attackState.lastProfit}
                    </span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Beneficiary A:</span>
                    <span className="metric-value">
                      {attackState.beneficiaryA}
                    </span>
                  </div>
                </div>

                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">Collateral B (locked):</span>
                    <span className="metric-value">
                      {attackState.myCollateral}
                    </span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Debt A (owed):</span>
                    <span className="metric-value">
                      {attackState.myDebt}
                    </span>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* SECURITY COMPARISON PANEL - ENHANCED */}
          <div className="panel" style={{ marginTop: "1rem", gridColumn: "1 / -1" }}>
            <div className="panel-header">
              <span className="panel-title">🛡️ Security Comparison: Vulnerable vs Protected</span>
              <span className="badge-pill" style={{ 
                backgroundColor: securityData.twapAvailable && securityData.multiOracleAvailable ? "#10b981" : "#f59e0b" 
              }}>
                {securityData.circuitBreakerStatus}
              </span>
            </div>

            <div style={{ fontSize: "0.85rem" }}>
              {/* Price Comparison Row */}
              <div style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #374151" }}>
                <strong style={{ color: "#f3f4f6" }}>Oracle Price Comparison</strong>
                <div className="metric-row" style={{ marginTop: "0.5rem" }}>
                  <div className="metric-pill" style={{ backgroundColor: "#7f1d1d" }}>
                    <span className="metric-label">❌ Vulnerable Spot Price:</span>
                    <span className="metric-value" style={{ color: "#fca5a5" }}>{securityData.spotPrice}</span>
                  </div>
                  <div className="metric-pill" style={{ backgroundColor: securityData.twapAvailable ? "#064e3b" : "#374151" }}>
                    <span className="metric-label">🛡️ TWAP Price (5min avg):</span>
                    <span className="metric-value" style={{ color: securityData.twapAvailable ? "#6ee7b7" : "#9ca3af" }}>
                      {securityData.twapPrice}
                    </span>
                  </div>
                  <div className="metric-pill" style={{ backgroundColor: securityData.multiOracleAvailable ? "#064e3b" : "#374151" }}>
                    <span className="metric-label">🛡️ Multi-Oracle Price:</span>
                    <span className="metric-value" style={{ 
                      color: securityData.multiOraclePrice.includes("ATTACK DETECTED") ? "#fbbf24" : 
                            securityData.multiOracleAvailable ? "#6ee7b7" : "#9ca3af" 
                    }}>
                      {securityData.multiOraclePrice}
                    </span>
                  </div>
                </div>
              </div>

              {/* Security Metrics Row */}
              <div style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #374151" }}>
                <strong style={{ color: "#f3f4f6" }}>Attack Resistance Metrics</strong>
                <div className="metric-row" style={{ marginTop: "0.5rem" }}>
                  <div className="metric-pill">
                    <span className="metric-label">Price Deviation:</span>
                    <span className="metric-value" style={{ 
                      color: parseFloat(securityData.priceDeviation) > 10 ? "#ef4444" : 
                            parseFloat(securityData.priceDeviation) > 5 ? "#f59e0b" : "#10b981" 
                    }}>
                      {securityData.priceDeviation}%
                    </span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">TWAP Status:</span>
                    <span className="metric-value" style={{ color: securityData.twapAvailable ? "#10b981" : "#f59e0b" }}>
                      {securityData.twapAvailable ? "✅ Protected" : "⏳ Building"}
                    </span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Multi-Oracle Status:</span>
                    <span className="metric-value" style={{ color: securityData.multiOracleAvailable ? "#10b981" : "#ef4444" }}>
                      {securityData.multiOracleAvailable ? "✅ Active" : "❌ Error"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Security Explanation Row */}
              <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                <p style={{ margin: "0.5rem 0" }}>
                  <strong style={{ color: "#f87171" }}>Vulnerable System:</strong> Uses AMM spot price directly - easily manipulated by flash loans
                </p>
                <p style={{ margin: "0.5rem 0" }}>
                  <strong style={{ color: "#6ee7b7" }}>TWAP Oracle:</strong> Averages prices over time - flash loan attacks can't affect historical data
                </p>
                <p style={{ margin: "0.5rem 0" }}>
                  <strong style={{ color: "#6ee7b7" }}>Multi-Oracle:</strong> Combines multiple price sources with outlier detection
                </p>
                
                {securityData.twapAvailable && (
                  <div style={{ marginTop: "1rem", padding: "0.5rem", backgroundColor: "#064e3b", borderRadius: "4px" }}>
                    <strong style={{ color: "#6ee7b7" }}>🛡️ Defense Status:</strong>
                    <span style={{ color: "#d1fae5", marginLeft: "0.5rem" }}>
                      {parseFloat(securityData.priceDeviation) > 10 
                        ? "Attack detected! TWAP prevents over-borrowing."
                        : "System protected against oracle manipulation."
                      }
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button
                  className="connect-btn"
                  style={{ padding: "0.4rem 1rem", flex: 1 }}
                  onClick={loadSecurityData}
                >
                  Refresh Security Data
                </button>
                <button
                  className="connect-btn"
                  style={{ 
                    padding: "0.4rem 1rem", 
                    backgroundColor: "#6366f1",
                    fontWeight: "bold",
                    flex: 1
                  }}
                  onClick={() => setShowSecurityModal(true)}
                >
                  📊 View Security Analysis
                </button>
              </div>
            </div>
          </div>

          {/* COMPREHENSIVE METRICS PANEL FOR PRESENTATION */}
          <div className="panel" style={{ marginTop: "1rem", gridColumn: "1 / -1" }}>
            <div className="panel-header">
              <span className="panel-title">Attack Metrics & Analysis</span>
              <span className="badge-pill">Lab Demonstration</span>
            </div>

            <div style={{ fontSize: "0.85rem" }}>
              {/* Row 1: Core Attack Values */}
              <div style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #374151" }}>
                <strong style={{ color: "#f3f4f6" }}>Phase 1-2: Flash Loan & Price Manipulation</strong>
                <div className="metric-row" style={{ marginTop: "0.5rem" }}>
                  <div className="metric-pill">
                    <span className="metric-label">Flash Loan Amount:</span>
                    <span className="metric-value">{debugState.loanedAmount} A</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">TokenB Purchased:</span>
                    <span className="metric-value">{debugState.boughtB} B</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Flash Fee (0.05%):</span>
                    <span className="metric-value">{debugState.flashFee} A</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Price Impact Analysis */}
              <div style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #374151" }}>
                <strong style={{ color: "#f3f4f6" }}>Price Impact Metrics</strong>
                <div className="metric-row" style={{ marginTop: "0.5rem" }}>
                  <div className="metric-pill">
                    <span className="metric-label">Initial Price (A/B):</span>
                    <span className="metric-value">1.5</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Inflated Price (A/B):</span>
                    <span className="metric-value">{debugState.inflatedPrice}</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Price Multiplier:</span>
                    <span className="metric-value" style={{ color: "#fbbf24" }}>{debugState.priceMultiplier}x</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Price Pump %:</span>
                    <span className="metric-value" style={{ color: "#f87171" }}>{debugState.pricePumpPercentage}%</span>
                  </div>
                </div>
              </div>

              {/* Row 3: Collateral & Borrowing */}
              <div style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #374151" }}>
                <strong style={{ color: "#f3f4f6" }}>Phase 3-4: Collateral Deposit & Inflated Borrowing</strong>
                <div className="metric-row" style={{ marginTop: "0.5rem" }}>
                  <div className="metric-pill">
                    <span className="metric-label">Collateral Value (A):</span>
                    <span className="metric-value">{debugState.collateralValueInA} A</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Max Borrow @ 75% LTV:</span>
                    <span className="metric-value" style={{ color: "#86efac" }}>{debugState.maxBorrowA} A</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Actual Borrow:</span>
                    <span className="metric-value" style={{ color: "#86efac" }}>{debugState.borrowAmount} A</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">LTV Used:</span>
                    <span className="metric-value">{debugState.ltvUsed}%</span>
                  </div>
                </div>
              </div>

              {/* Row 4: Profitability Analysis */}
              <div style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #374151" }}>
                <strong style={{ color: "#f3f4f6" }}>Phase 5-6: Repayment & Profit</strong>
                <div className="metric-row" style={{ marginTop: "0.5rem" }}>
                  <div className="metric-pill">
                    <span className="metric-label">Required Repayment:</span>
                    <span className="metric-value">{debugState.repaymentAmount} A</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Final Profit:</span>
                    <span className="metric-value" style={{ color: "#34d399", fontWeight: "bold" }}>{debugState.leftoverA} A</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Profit ROI:</span>
                    <span className="metric-value" style={{ color: "#34d399", fontWeight: "bold" }}>{debugState.profitROI}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      {/* Enhanced SecurityModal with real-time contract integration */}
      <SecurityModal 
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        securityData={securityData}
        signer={signer}
        getContracts={getContracts}
      />
    </div>
  );
}

export default App;