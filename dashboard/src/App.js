import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import "./App.css";

import { getContracts } from "./blockchain";
import { CONTRACTS } from "./config";
import PriceChart from "./PriceChart";

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [networkOk, setNetworkOk] = useState(false);

  // Chart state
  const [chartLabels, setChartLabels] = useState([]);
  const [chartData, setChartData] = useState([]);

  // ------- AMM STATE -------
  const [amm, setAmm] = useState({
    reserveA: "0",
    reserveB: "0",
    price: "0",
  });

  // ------- LENDING STATE -------
  const [lend, setLend] = useState({
    collateral: "0",
    collateralValue: "0",
    debt: "0",
    maxBorrow: "0",
    poolBalance: "0",
  });

  // ------- FLASH LOAN STATE -------
  const [flash, setFlash] = useState({
    poolA: "0",
    fee: "0.05%",
  });

  // ------- ATTACK SUMMARY -------
  const [attackerStats, setAttackerStats] = useState({
    profitB: "0",
    poolRemainingB: "0",
  });

  // Initialize provider
  useEffect(() => {
    if (window.ethereum) {
      const prov = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(prov);
    }
  }, []);

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

  const shortAddress = (addr) =>
    addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "";

  // ----------------------------
  // Load AMM State
  // ----------------------------
  const loadAmmData = async () => {
    if (!signer) return;
    try {
      const c = getContracts(signer);

      const reserveA = await c.tokenA.balanceOf(CONTRACTS.amm);
      const reserveB = await c.tokenB.balanceOf(CONTRACTS.amm);
      const price = await c.amm.getSpotPrice();

      setAmm({
        reserveA: ethers.utils.formatEther(reserveA),
        reserveB: ethers.utils.formatEther(reserveB),
        price: ethers.utils.formatEther(price),
      });

      // push latest price into chart
      setChartLabels((prev) => [...prev, new Date().toLocaleTimeString()]);
      setChartData((prev) => [
        ...prev,
        parseFloat(ethers.utils.formatEther(price)),
      ]);
    } catch (err) {
      console.error("Error loading AMM:", err);
    }
  };

  // ----------------------------
  // Load Lending State (for attacker contract)
  // ----------------------------
  const loadLendingData = async () => {
    if (!signer) return;
    try {
      const c = getContracts(signer);

      // Read state for the attacker contract address,
      // since that is who actually holds collateral & borrows.
      const collateral = await c.lending.collateralA(CONTRACTS.attacker);
      const debt = await c.lending.debtB(CONTRACTS.attacker);
      const poolBal = await c.tokenB.balanceOf(CONTRACTS.lending);

      const price = await c.amm.getSpotPrice(); // B per A
      const collateralValue = collateral
        .mul(price)
        .div(ethers.utils.parseEther("1"));

      const maxBorrow = collateralValue.mul(5000).div(10000); // 50% LTV

      setLend({
        collateral: ethers.utils.formatEther(collateral),
        collateralValue: ethers.utils.formatEther(collateralValue),
        debt: ethers.utils.formatEther(debt),
        maxBorrow: ethers.utils.formatEther(maxBorrow),
        poolBalance: ethers.utils.formatEther(poolBal),
      });
    } catch (err) {
      console.error("Lending load error:", err);
    }
  };

  // ----------------------------
  // Load Flash Loan State
  // ----------------------------
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

  // ----------------------------
  // Load Attack Summary
  // ----------------------------
  const loadAttackSummary = async () => {
    if (!signer) return;
    try {
      const c = getContracts(signer);

      // Profit belongs to the BENEFICIARY EOA
      const attackerBalance = await c.tokenB.balanceOf(CONTRACTS.beneficiary);
      const lendingBalance = await c.tokenB.balanceOf(CONTRACTS.lending);

      setAttackerStats({
        profitB: ethers.utils.formatEther(attackerBalance),
        poolRemainingB: ethers.utils.formatEther(lendingBalance),
      });
    } catch (err) {
      console.error("Attack summary load error:", err);
    }
  };

  // ----------------------------
  // FUND ATTACKER CONTRACT (use deployer / account 0)
  // ----------------------------
  const fundAttacker = async () => {
    if (!signer) return alert("Connect MetaMask first.");

    try {
      const c = getContracts(signer);

      const amount = ethers.utils.parseEther("900.4");

      // Transfer TokenA from current EOA to attacker contract
      const tx = await c.tokenA.transfer(CONTRACTS.attacker, amount);
      await tx.wait();

      await loadAmmData();
      await loadLendingData();
      await loadAttackSummary();

      alert("Attacker contract funded with 900.4 TokenA");
    } catch (err) {
      console.error("Funding failed:", err);
      alert("Funding failed — this button should be used from the DEPLOYER account.");
    }
  };

  const resetEnvironment = async () => {
    setChartLabels([]);
    setChartData([]);
    await loadAmmData();
    await loadLendingData();
    await loadFlashLoanData();
    await loadAttackSummary();
    alert("Environment reset (UI + on-chain refresh).");
  };

  // ----------------------------
  // DEPOSIT COLLATERAL (must be called from beneficiary / account 1)
  // ----------------------------
  const depositCollateral = async () => {
    if (!signer) return alert("Connect MetaMask first.");
    try {
      const c = getContracts(signer);

      const amount = ethers.utils.parseEther("100");

      // 1) Approve attacker contract to pull 100 A from beneficiary EOA
      const txApprove = await c.tokenA.approve(CONTRACTS.attacker, amount);
      await txApprove.wait();

      // 2) Attacker contract pulls A and deposits as its own collateral
      const tx = await c.attacker.depositMyCollateral(amount);
      await tx.wait();

      await loadLendingData();
      await loadAttackSummary();
      alert("Collateral deposited: 100 TokenA (via attacker contract)");
    } catch (err) {
      console.error(err);
      alert("Collateral deposit failed.");
    }
  };

  // ----------------------------
  // PRICE MANIPULATION (EOA swaps on AMM)
  // ----------------------------
  const manipulatePrice = async () => {
    if (!signer) return alert("Connect MetaMask first.");
    try {
      const c = getContracts(signer);

      // Use 80 A so account 1 (which has 100 A) can execute this
      const swapAmount = ethers.utils.parseEther("80");

      const tx1 = await c.tokenA.approve(CONTRACTS.amm, swapAmount);
      await tx1.wait();

      const tx2 = await c.amm.swapAForB(swapAmount);
      await tx2.wait();

      await loadAmmData();
      await loadLendingData();
      await loadAttackSummary();

      alert("Price manipulated (swap A→B)!");
    } catch (err) {
      console.error(err);
      alert("Price manipulation failed.");
    }
  };

  // ----------------------------
  // MANUAL BORROW (via attacker contract helper)
  // ----------------------------
  const borrowAtInflatedPrice = async () => {
    if (!signer) return alert("Connect MetaMask first.");
    try {
      const c = getContracts(signer);

      const borrowAmount = ethers.utils.parseEther("100");

      const tx = await c.attacker.manualBorrow(borrowAmount);
      await tx.wait();

      await loadLendingData();
      await loadAttackSummary();

      alert("Borrow succeeded at manipulated collateral value!");
    } catch (err) {
      console.error(err);
      alert("Borrow failed.");
    }
  };

  // ----------------------------
  // FLASH LOAN ATTACK
  // ----------------------------
  const handleFlashLoan = async () => {
    if (!signer) return alert("Connect MetaMask first.");
    try {
      const c = getContracts(signer);

      const amount = ethers.utils.parseEther("800");

      const tx = await c.flash.flashLoan(CONTRACTS.attacker, amount, "0x");
      await tx.wait();

      await loadAmmData();
      await loadLendingData();
      await loadFlashLoanData();
      await loadAttackSummary();

      alert("Flash loan executed!");
    } catch (err) {
      console.error(err);
      alert("Flash loan transaction failed.");
    }
  };

  // Run data loads on connect
  useEffect(() => {
    if (signer && account) {
      loadAmmData();
      loadLendingData();
      loadFlashLoanData();
      loadAttackSummary();
    }
  }, [signer, account]);

  // Refresh summary when AMM or lending change
  useEffect(() => {
    if (signer) {
      loadAttackSummary();
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
                  ✅ Connected to Hardhat (chainId 31337)
                </div>
              ) : (
                <div className="wallet-status-warn">
                  ⚠ Switch MetaMask to the Hardhat network.
                </div>
              )}
            </div>

            <div style={{ marginTop: "0.5rem" }}>
              <div className="wallet-label">Exploit Flow</div>
              <ul
                style={{
                  margin: "0.35rem 0 0 1rem",
                  padding: 0,
                  fontSize: "0.78rem",
                  color: "#9ca3af",
                }}
              >
                <li>1. Fund attacker (Account 0)</li>
                <li>2. Switch to Account 1</li>
                <li>3. Deposit collateral</li>
                <li>4. Manipulate AMM price</li>
                <li>5. Borrow at inflated price</li>
                <li>6. Execute flash loan attack</li>
                <li>7. Profit to beneficiary (Account 1)</li>
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
                  AMM Market (TokenA / TokenB)
                </span>
                <span className="badge-pill">Oracle Source</span>
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
                      {amm.price} B per A
                    </span>
                  </div>
                </div>

                <button
                  className="connect-btn"
                  style={{ marginTop: "1rem", padding: "0.4rem 1rem" }}
                  onClick={manipulatePrice}
                >
                  Manipulate Price (Swap A→B)
                </button>

                <div style={{ marginTop: "1rem" }}>
                  <PriceChart labels={chartLabels} data={chartData} />
                </div>
              </div>
            </div>

            {/* LENDING PANEL */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Lending Protocol</span>
                <span className="badge-pill">Vulnerable</span>
              </div>

              <div style={{ fontSize: "0.85rem" }}>
                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">Collateral (A):</span>
                    <span className="metric-value">
                      {lend.collateral}
                    </span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Value (B):</span>
                    <span className="metric-value">
                      {lend.collateralValue}
                    </span>
                  </div>
                </div>

                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">Borrowed (B):</span>
                    <span className="metric-value">{lend.debt}</span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">Max Borrow (B):</span>
                    <span className="metric-value">{lend.maxBorrow}</span>
                  </div>
                </div>

                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">Pool Balance (B):</span>
                    <span className="metric-value">
                      {lend.poolBalance}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "1rem",
                    display: "flex",
                    gap: "0.5rem",
                  }}
                >
                  <button className="connect-btn" onClick={fundAttacker}>
                    Fund Attacker (900.4 A)
                  </button>
                  <button className="connect-btn" onClick={depositCollateral}>
                    Deposit Collateral (100 A)
                  </button>
                  <button
                    className="connect-btn"
                    onClick={borrowAtInflatedPrice}
                  >
                    Borrow (Manual)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* FLASH LOAN + SUMMARY ROW */}
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

                <button
                  className="connect-btn"
                  style={{ marginTop: "1rem", padding: "0.4rem 1rem" }}
                  onClick={handleFlashLoan}
                >
                  Execute Flash Loan Attack
                </button>
              </div>
            </div>

            {/* ATTACK SUMMARY PANEL */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Attack Summary</span>
                <span className="badge-pill">Simulation</span>
              </div>

              <div style={{ fontSize: "0.85rem" }}>
                <div className="metric-row">
                  <div className="metric-pill">
                    <span className="metric-label">
                      Attacker Profit (B):
                    </span>
                    <span className="metric-value">
                      {attackerStats.profitB}
                    </span>
                  </div>
                  <div className="metric-pill">
                    <span className="metric-label">
                      Pool Remaining (B):
                    </span>
                    <span className="metric-value">
                      {attackerStats.poolRemainingB}
                    </span>
                  </div>
                </div>

                <p style={{ marginTop: "0.75rem", color: "#6b7280" }}>
                  These values update live as the AMM is manipulated or
                  when tokens are borrowed.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
