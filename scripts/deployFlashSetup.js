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

  const TokenA = await hre.ethers.getContractFactory("TokenA");
  const TokenB = await hre.ethers.getContractFactory("TokenB");
  const AMM = await hre.ethers.getContractFactory("SimpleAMM");
  const Lending = await hre.ethers.getContractFactory("VulnerableLending");
  const FlashProvider = await hre.ethers.getContractFactory("FlashLoanProvider");

  // Deploy tokens
  const tokenA = await TokenA.deploy();
  const tokenB = await TokenB.deploy();
  await tokenA.deployed();
  await tokenB.deployed();

  // Deploy AMM
  const amm = await AMM.deploy(tokenA.address, tokenB.address);
  await amm.deployed();

  // Deploy lending
  const lending = await Lending.deploy(tokenA.address, tokenB.address, amm.address);
  await lending.deployed();

  // Deploy flash provider
  const flashProvider = await FlashProvider.deploy(tokenA.address);
  await flashProvider.deployed();

  console.log("TokenA:", tokenA.address);
  console.log("TokenB:", tokenB.address);
  console.log("AMM:", amm.address);
  console.log("Lending:", lending.address);
  console.log("FlashProvider:", flashProvider.address);

  // Save only base components
  saveFrontendFiles({
    tokenA: tokenA.address,
    tokenB: tokenB.address,
    amm: amm.address,
    lending: lending.address,
    flashProvider: flashProvider.address,
    beneficiary: attackerEOA.address // attacker EOA
  });

  // Seed AMM
  const seedA = hre.ethers.utils.parseEther("1000");
  const seedB = hre.ethers.utils.parseEther("1000");
  await tokenA.approve(amm.address, seedA);
  await tokenB.approve(amm.address, seedB);
  await amm.addLiquidity(seedA, seedB);
  console.log("✔ AMM seeded with liquidity.");

  // Fund lending pool
  const poolB = hre.ethers.utils.parseEther("5000");
  await tokenB.transfer(lending.address, poolB);
  console.log("✔ Lending pool funded.");

  // Fund flash provider
  const flashSeed = hre.ethers.utils.parseEther("2000");
  await tokenA.transfer(flashProvider.address, flashSeed);
  console.log("✔ Flash provider funded.");

  // Prefund attacker EOA for collateral
  const attackerFund = hre.ethers.utils.parseEther("100");
  await tokenA.transfer(attackerEOA.address, attackerFund);
  console.log("✔ Beneficiary prefunded with 100 TokenA.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
