const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Merge contract JSON
function saveFrontendFiles(data) {
  const contractsDir = path.join(__dirname, "..", "dashboard", "src");
  const filePath = path.join(contractsDir, "contracts.json");

  let existing = {};
  if (fs.existsSync(filePath)) {
    existing = JSON.parse(fs.readFileSync(filePath));
  }

  fs.writeFileSync(filePath, JSON.stringify({ ...existing, ...data }, null, 2));
  console.log("✔ Frontend updated with attacker contract");
}

async function main() {
  const [deployer, attackerEOA] = await hre.ethers.getSigners();

  // Load base deploy addresses
  const contractsPath = path.join(
    __dirname,
    "..",
    "dashboard",
    "src",
    "contracts.json"
  );

  if (!fs.existsSync(contractsPath)) {
    throw new Error("❌ contracts.json missing — run deployFlashSetup.js first");
  }

  const deployed = JSON.parse(fs.readFileSync(contractsPath));

  const TOKENA = deployed.tokenA;
  const TOKENB = deployed.tokenB;
  const AMM = deployed.amm;
  const LENDING = deployed.lending;

  console.log("Loaded existing contracts:");
  console.log(" TokenA:", TOKENA);
  console.log(" TokenB:", TOKENB);
  console.log(" AMM:", AMM);
  console.log(" Lending:", LENDING);

  // Deploy attacker contract
  const AttackerFlash = await hre.ethers.getContractFactory("AttackerFlash");
  const attackerContract = await AttackerFlash.deploy(
    TOKENA,
    TOKENB,
    AMM,
    LENDING,
    attackerEOA.address // beneficiary
  );

  await attackerContract.deployed();

  console.log("✔ AttackerFlash deployed at:", attackerContract.address);
  console.log("✔ Beneficiary:", attackerEOA.address);

  // Save back to frontend
  saveFrontendFiles({
    attacker: attackerContract.address,
    beneficiary: attackerEOA.address,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
