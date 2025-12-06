const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n⚠️  NOTE: deployAttackerWithBeneficiary.js is deprecated");
  console.log("   deployFlashSetup.js now handles all contract deployments including AttackerFlash\n");

  // Load deployed contract addresses
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

  console.log("✓ Loaded deployed contracts from:", contractsPath);
  console.log("  TokenA:        ", deployed.tokenA);
  console.log("  TokenB:        ", deployed.tokenB);
  console.log("  AMM1:          ", deployed.amm1);
  console.log("  AMM2:          ", deployed.amm2);
  console.log("  VulnerableLending:", deployed.lending);
  console.log("  FlashLoanProvider:", deployed.flashProvider);
  console.log("  AttackerFlash: ", deployed.attacker);
  console.log("  Beneficiary:   ", deployed.beneficiary);

  console.log("\n✓ All contracts ready. You can now:");
  console.log("  1. Run: npx hardhat run scripts/runFlashExploit.js --network localhost");
  console.log("  2. Or open: http://localhost:3000 (React dashboard)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
