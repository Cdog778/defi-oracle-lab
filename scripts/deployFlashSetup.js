const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function saveFrontendFiles(data) {
  const contractsDir = path.join(__dirname, "..", "dashboard", "src");
  const filePath = path.join(contractsDir, "contracts.json");

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log("✔ Base contract data saved to dashboard/src/contracts.json");
}

async function main() {
  const [deployer, attackerEOA] = await hre.ethers.getSigners();

  console.log("\n=== DEPLOYING CONTRACTS ===\n");

  // Deploy tokens
  console.log("Deploying TokenA and TokenB...");
  const TokenA = await hre.ethers.getContractFactory("TokenA");
  const TokenB = await hre.ethers.getContractFactory("TokenB");
  const tokenA = await TokenA.deploy();
  const tokenB = await TokenB.deploy();
  await tokenA.deployed();
  await tokenB.deployed();
  console.log("✓ TokenA:", tokenA.address);
  console.log("✓ TokenB:", tokenB.address);

  // Deploy AMM1 (primary pool - high liquidity for price manipulation)
  console.log("\nDeploying SimpleAMM (AMM1 - primary)...");
  const AMM = await hre.ethers.getContractFactory("SimpleAMM");
  const amm1 = await AMM.deploy(tokenA.address, tokenB.address);
  await amm1.deployed();
  console.log("✓ SimpleAMM (AMM1):", amm1.address);

  // Deploy AMM2 (secondary pool - low liquidity for fair repayment)
  console.log("Deploying SimpleAMM2 (AMM2 - secondary)...");
  const AMM2 = await hre.ethers.getContractFactory("SimpleAMM2");
  const amm2 = await AMM2.deploy(tokenA.address, tokenB.address);
  await amm2.deployed();
  console.log("✓ SimpleAMM2 (AMM2):", amm2.address);

  // Deploy lending protocol
  console.log("\nDeploying VulnerableLending...");
  const Lending = await hre.ethers.getContractFactory("VulnerableLending");
  const lending = await Lending.deploy(tokenA.address, tokenB.address, amm1.address);
  await lending.deployed();
  console.log("✓ VulnerableLending:", lending.address);

  // Deploy flash provider (provides TokenA loans)
  console.log("\nDeploying FlashLoanProvider...");
  const FlashProvider = await hre.ethers.getContractFactory("FlashLoanProvider");
  const flashProvider = await FlashProvider.deploy(tokenA.address);
  await flashProvider.deployed();
  console.log("✓ FlashLoanProvider:", flashProvider.address);

  // Deploy attacker contract
  console.log("\nDeploying AttackerFlash...");
  const Attacker = await hre.ethers.getContractFactory("AttackerFlash");
  const attacker = await Attacker.deploy(
    tokenA.address,
    tokenB.address,
    amm1.address,      // primary AMM for price pumping
    amm2.address,      // secondary AMM for repayment
    lending.address,
    flashProvider.address,
    attackerEOA.address
  );
  await attacker.deployed();
  console.log("✓ AttackerFlash:", attacker.address);

  // Save contract addresses
  saveFrontendFiles({
    tokenA: tokenA.address,
    tokenB: tokenB.address,
    amm1: amm1.address,
    amm2: amm2.address,
    lending: lending.address,
    flashProvider: flashProvider.address,
    attacker: attacker.address,
    beneficiary: attackerEOA.address
  });

  // ============================================================
  // SEED POOLS
  // ============================================================
  console.log("\n=== SEEDING LIQUIDITY POOLS ===\n");

  // Seed AMM1 - asymmetric seeding for better price manipulation
  // More B than A creates larger price impact when we swap A→B
  console.log("Seeding AMM1 with asymmetric liquidity (1000 A + 1500 B)...");
  let seedA = hre.ethers.utils.parseEther("1000");
  let seedB = hre.ethers.utils.parseEther("1500");
  await tokenA.approve(amm1.address, seedA);
  await tokenB.approve(amm1.address, seedB);
  await amm1.addLiquidity(seedA, seedB);
  console.log("✓ AMM1 seeded (asymmetric: more B for better price impact)");

  // Seed AMM2 - lower liquidity for fair-price swaps
  console.log("Seeding AMM2 with lower liquidity (200 A + 200 B)...");
  seedA = hre.ethers.utils.parseEther("200");
  seedB = hre.ethers.utils.parseEther("200");
  await tokenA.approve(amm2.address, seedA);
  await tokenB.approve(amm2.address, seedB);
  await amm2.addLiquidity(seedA, seedB);
  console.log("✓ AMM2 seeded");

  // Fund lending pool with TokenA (loanable) - need enough for 75% LTV borrowing
  console.log("\nFunding Lending pool with TokenA (25000 A)...");
  let poolA = hre.ethers.utils.parseEther("25000");
  await tokenA.transfer(lending.address, poolA);
  console.log("✓ Lending pool funded with TokenA");

  // Fund flash provider with TokenA (larger amount for bigger attack)
  console.log("Funding FlashLoanProvider with TokenA (20000 A)...");
  let flashSeed = hre.ethers.utils.parseEther("20000");
  await tokenA.transfer(flashProvider.address, flashSeed);
  console.log("✓ Flash provider funded with increased capacity");

  // ============================================================
  // KEY POINT: ATTACKER STARTS WITH ZERO CAPITAL
  // ============================================================
  console.log("\n=== ATTACK SETUP ===\n");
  console.log("✓ Attacker EOA starts with 0 TokenA and 0 TokenB");
  console.log("✓ All capital will come from flash loans and swaps");
  console.log("✓ Attack flow:");
  console.log("  1. Flash borrow large amount of TokenA");
  console.log("  2. Swap TokenA → TokenB on AMM1 (pumps B price)");
  console.log("  3. Deposit TokenB as collateral in lending");
  console.log("  4. At inflated B price, borrow TokenA from lending");
  console.log("  5. Repay flash loan + fee from borrowed TokenA");
  console.log("  6. Keep remaining TokenA as profit");

  console.log("\n=== CONTRACTS DEPLOYED SUCCESSFULLY ===");
  console.log("\nNext steps:");
  console.log("1. Run: npx hardhat run scripts/runFlashExploit.js --network localhost");
  console.log("2. Or open: http://localhost:3000 (dashboard)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
