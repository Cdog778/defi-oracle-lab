const hre = require("hardhat");

async function main() {
  const [deployer, attacker] = await hre.ethers.getSigners();

  const TokenA = await hre.ethers.getContractFactory("TokenA");
  const TokenB = await hre.ethers.getContractFactory("TokenB");
  const AMM = await hre.ethers.getContractFactory("SimpleAMM");

  // Deploy tokens
  const tokenA = await TokenA.deploy();
  const tokenB = await TokenB.deploy();
  await tokenA.deployed();
  await tokenB.deployed();

  // Deploy AMM
  const amm = await AMM.deploy(tokenA.address, tokenB.address);
  await amm.deployed();

  console.log("TokenA:", tokenA.address);
  console.log("TokenB:", tokenB.address);
  console.log("SimpleAMM:", amm.address);

  // Add liquidity (1,000 each)
  const amtA = hre.ethers.utils.parseEther("1000");
  const amtB = hre.ethers.utils.parseEther("1000");

  await tokenA.approve(amm.address, amtA);
  await tokenB.approve(amm.address, amtB);
  await amm.addLiquidity(amtA, amtB);

  console.log("AMM seeded with 1000 A and 1000 B.");

  // Show initial spot price
  let priceBefore = await amm.getSpotPrice();
  console.log("Spot price BEFORE:", hre.ethers.utils.formatEther(priceBefore), "B per A");

  // Fund attacker with TokenA to swap
  await tokenA.transfer(attacker.address, hre.ethers.utils.parseEther("500"));

  // Swap 400 A for B
  const swapAmount = hre.ethers.utils.parseEther("400");
  await tokenA.connect(attacker).approve(amm.address, swapAmount);
  await amm.connect(attacker).swapAForB(swapAmount);

  // Show spot price after swap
  let priceAfter = await amm.getSpotPrice();
  console.log("Spot price AFTER:", hre.ethers.utils.formatEther(priceAfter), "B per A");

  const attackerA = await tokenA.balanceOf(attacker.address);
  const attackerB = await tokenB.balanceOf(attacker.address);

  console.log("Attacker TokenA:", hre.ethers.utils.formatEther(attackerA));
  console.log("Attacker TokenB:", hre.ethers.utils.formatEther(attackerB));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
