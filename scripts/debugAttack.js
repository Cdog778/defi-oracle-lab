const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [signer] = await hre.ethers.getSigners();

  // Read contract addresses from contracts.json
  const contractsPath = path.join(__dirname, "..", "dashboard", "src", "contracts.json");
  const contracts = JSON.parse(fs.readFileSync(contractsPath, "utf8"));

  console.log("\n=== ATTACK DEBUG VALUES ===\n");
  console.log("Reading from AttackerFlash:", contracts.attacker);

  // Get the AttackerFlash contract
  const AttackerABI = require("../artifacts/contracts/AttackerFlash.sol/AttackerFlash.json").abi;
  const attacker = new hre.ethers.Contract(contracts.attacker, AttackerABI, signer);

  // Get debug state
  try {
    const debug = await attacker.getDebugState();

      console.log("\nLAST EXECUTION DEBUG STATE:\n");
      console.log(`Loaned Amount:              ${hre.ethers.utils.formatEther(debug.loanedAmount)} A`);
      console.log(`TokenB Bought:              ${hre.ethers.utils.formatEther(debug.boughtB)} B`);
      console.log(`Inflated Price (A/B):       ${hre.ethers.utils.formatEther(debug.inflatedPrice)} A/B`);
      console.log(`Collateral Value in A:      ${hre.ethers.utils.formatEther(debug.collateralValueInA)} A`);
      console.log(`Max Borrow (75% LTV):       ${hre.ethers.utils.formatEther(debug.maxBorrowA)} A`);
      console.log(`Flash Fee (0.05%):          ${hre.ethers.utils.formatEther(debug.flashFee)} A`);
      console.log(`Repayment (Loan + Fee):     ${hre.ethers.utils.formatEther(debug.repaymentAmount)} A`);
      console.log(`Actual Borrow Amount:       ${hre.ethers.utils.formatEther(debug.borrowAmount)} A`);
      console.log(`Contract Balance After:     ${hre.ethers.utils.formatEther(debug.contractBalanceAfter)} A`);
      console.log(`\nLEFTOVER / PROFIT:          ${hre.ethers.utils.formatEther(debug.leftoverA)} A\n`);
      console.log("=== ATTACK METRICS ===\n");
      console.log(`Price Multiplier:           ${(debug.priceMultiplier.toNumber() / 100).toFixed(2)}x`);
      console.log(`Price Pump Percentage:      ${(debug.pricePumpPercentage.toNumber() / 100).toFixed(2)}%`);
      console.log(`LTV Used:                   ${(debug.ltvUsed.toNumber() / 100).toFixed(2)}%`);
      console.log(`Profit ROI:                 ${(debug.profitROI.toNumber() / 100).toFixed(2)}%\n`);    // Calculate if attack should succeed
    const maxBorrow = hre.ethers.BigNumber.from(debug.maxBorrowA);
    const repayment = hre.ethers.BigNumber.from(debug.repaymentAmount);
    const actualBorrow = hre.ethers.BigNumber.from(debug.borrowAmount);
    const leftover = hre.ethers.BigNumber.from(debug.leftoverA);

    console.log("ANALYSIS:");
    console.log(`  - Max borrow (75% LTV):      ${hre.ethers.utils.formatEther(maxBorrow)} A`);
    console.log(`  - Required repayment:        ${hre.ethers.utils.formatEther(repayment)} A`);
    console.log(`  - Can borrow enough?         ${maxBorrow.gte(repayment) ? "YES" : "NO"}`);
    console.log(`  - Profit (leftover):         ${hre.ethers.utils.formatEther(leftover)} A ${leftover.gt(0) ? "POSITIVE" : "NEGATIVE"}`);

    if (maxBorrow.lt(repayment)) {
      console.log("\nISSUE DETECTED:");
      console.log(`  The max borrow amount (${hre.ethers.utils.formatEther(maxBorrow)} A) is LESS than repayment (${hre.ethers.utils.formatEther(repayment)} A)`);
      console.log(`  Shortfall: ${hre.ethers.utils.formatEther(repayment.sub(maxBorrow))} A`);
      console.log("\n  SOLUTIONS:");
      console.log("  1. Increase flash loan amount (pumps B price more)");
      console.log("  2. Increase AMM1 seeding (less price impact per unit borrowed)");
      console.log("  3. Increase lending pool size (more available liquidity)");
      console.log("  4. Reduce AMM1 initial B amount (more extreme price pump)");
    } else {
      console.log("\nAttack should succeed! Profit margin:", hre.ethers.utils.formatEther(maxBorrow.sub(repayment)), "A");
    }

  } catch (err) {
    console.error("Error reading debug state:", err.message);
    console.log("\n(Debug values only available after first attack execution)");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
