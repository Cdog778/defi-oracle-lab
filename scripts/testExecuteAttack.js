const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [signer] = await hre.ethers.getSigners();

  // Read contract addresses from contracts.json
  const contractsPath = path.join(__dirname, "..", "dashboard", "src", "contracts.json");
  const contracts = JSON.parse(fs.readFileSync(contractsPath, "utf8"));

  console.log("\n=== TESTING executeAttack FUNCTION ===\n");

  // Get the AttackerFlash contract
  const AttackerABI = require("../artifacts/contracts/AttackerFlash.sol/AttackerFlash.json").abi;
  const attacker = new hre.ethers.Contract(contracts.attacker, AttackerABI, signer);

  // Execute attack with 2000 TokenA
  const flashAmount = hre.ethers.utils.parseEther("2000");
  
  console.log("Executing executeAttack with 2000 TokenA...");
  const tx = await attacker.executeAttack(flashAmount);
  const receipt = await tx.wait();
  
  console.log("Transaction successful!");
  console.log(`Gas used: ${receipt.gasUsed.toString()}`);

  // Get debug state
  console.log("\nDebug state after attack:\n");
  const debug = await attacker.getDebugState();

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
  console.log(`Profit ROI:                 ${(debug.profitROI.toNumber() / 100).toFixed(2)}%\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
