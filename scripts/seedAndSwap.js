const hre = require("hardhat");

async function main() {
  const [deployer, attacker] = await hre.ethers.getSigners();

  // Load contract factories
  const TokenA = await hre.ethers.getContractFactory("TokenA");
  const TokenB = await hre.ethers.getContractFactory("TokenB");
  const AMM = await hre.ethers.getContractFactory("SimpleAMM");

  // Deploy fresh copies for clarity
  const tokenA = await TokenA.deploy();
  const tokenB = await TokenB.deploy();
  const amm = await AMM.deploy(await tokenA.getAddress(), await tokenB.getAddress());
  await Promise.all([tokenA.waitForDeployment(), tokenB.waitForDeployment(), amm.waitForDeployment()]);

  console.log(`\nDeployed:`);
  console.log(`TokenA  @ ${await tokenA.getAddress()}`);
  console.log(`TokenB  @ ${await tokenB.getAddress()}`);
  console.log(`SimpleAMM @ ${await amm.getAddress()}`);

  // --- Add Liquidity ---
  const amountA = hre.ethers.parseEther("1000");
  const amountB = hre.ethers.parseEther("1000");

  await tokenA.approve(await amm.getAddress(), amountA);
  await tokenB.approve(await amm.getAddress(), amountB);
  await amm.addLiquidity(amountA, amountB);
  console.log(`\nLiquidity added: 1000 A + 1000 B`);

  // --- Check spot price before swap ---
  let priceBefore = await amm.getSpotPrice();
  console.log(`\nSpot price before swap: ${hre.ethers.formatEther(priceBefore)} B per A`);

  // --- Perform swap ---
  const swapAmount = hre.ethers.parseEther("100"); // attacker swaps 100 A
  await tokenA.approve(await amm.getAddress(), swapAmount);
  const tx = await amm.swapAForB(swapAmount);
  await tx.wait();

  // --- Check price after swap ---
  let priceAfter = await amm.getSpotPrice();
  console.log(`Spot price after swap: ${hre.ethers.formatEther(priceAfter)} B per A`);

  // --- Check resulting balances ---
  const balA = await tokenA.balanceOf(await attacker.getAddress());
  const balB = await tokenB.balanceOf(await attacker.getAddress());
  console.log(`\nAttacker balances:`);
  console.log(`Token A: ${hre.ethers.formatEther(balA)}`);
  console.log(`Token B: ${hre.ethers.formatEther(balB)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

