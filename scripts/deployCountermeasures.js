const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  // Load existing vulnerable contracts
  const existingContracts = require("../dashboard/src/contracts.json");
  
  console.log("Deploying countermeasures...");
  console.log("Deployer:", deployer.address);
  
  // Deploy TWAP Oracle pointing to existing AMM1
  console.log("\nDeploying TWAP Oracle...");
  const TWAPOracle = await hre.ethers.getContractFactory("TWAPOracle");
  const twapOracle = await TWAPOracle.deploy(
    existingContracts.amm1,  // Use existing AMM1 as price source
    deployer.address        // Deployer as initial updater
  );
  await twapOracle.deployed();
  console.log("✓ TWAP Oracle:", twapOracle.address);

  // Deploy Multi-Oracle Aggregator  
  console.log("\nDeploying Multi-Oracle Aggregator...");
  const MultiOracle = await hre.ethers.getContractFactory("MultiOracleAggregator");
  const multiOracle = await MultiOracle.deploy();
  await multiOracle.deployed();
  console.log("✓ Multi-Oracle Aggregator:", multiOracle.address);

  // Configure Multi-Oracle with sources
  console.log("\nConfiguring Multi-Oracle...");
  
  // Add TWAP as primary source (60% weight)
  await multiOracle.addOracle(
    twapOracle.address,
    6000, // 60% weight  
    true, // is TWAP
    500,  // 5% max deviation
    "TWAP Oracle"
  );

  // Add AMM2 as secondary source (40% weight)
  await multiOracle.addOracle(
    existingContracts.amm2,
    4000, // 40% weight
    false, // not TWAP (spot price)
    1000,  // 10% max deviation  
    "AMM2 Spot"
  );

  console.log("✓ Multi-Oracle configured with 2 sources");

  // Initialize TWAP with some price history
  console.log("\nInitializing TWAP price history...");
  await twapOracle.emergencyUpdatePrice();
  console.log("✓ Initial price recorded");

  // Update contracts file with countermeasures
  const updatedContracts = {
    ...existingContracts,
    twapOracle: twapOracle.address,
    multiOracle: multiOracle.address
  };

  require("fs").writeFileSync(
    "dashboard/src/contracts.json", 
    JSON.stringify(updatedContracts, null, 2)
  );

  console.log("\n=== COUNTERMEASURES DEPLOYED ===");
  console.log("TWAP Oracle:", twapOracle.address);
  console.log("Multi-Oracle Aggregator:", multiOracle.address);
  console.log("\n🛡️ SECURITY FEATURES ACTIVE:");
  console.log("• TWAP averages prices over 5 minutes");
  console.log("• Multi-Oracle uses 2 price sources with median filtering");
  console.log("• Circuit breakers detect >5% price deviations");
  
  console.log("\n🧪 NEXT STEPS:");
  console.log("1. Test original attack - should still work on vulnerable system");
  console.log("2. Compare spot price vs TWAP during attack");
  console.log("3. Check multi-oracle aggregated price vs individual sources");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});