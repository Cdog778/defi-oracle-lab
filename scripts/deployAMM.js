const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const TokenA = await hre.ethers.getContractFactory("TokenA");
  const TokenB = await hre.ethers.getContractFactory("TokenB");
  const tokenA = await TokenA.deploy();
  const tokenB = await TokenB.deploy();

  await tokenA.waitForDeployment();
  await tokenB.waitForDeployment();

  console.log(`TokenA: ${await tokenA.getAddress()}`);
  console.log(`TokenB: ${await tokenB.getAddress()}`);

  const AMM = await hre.ethers.getContractFactory("SimpleAMM");
  const amm = await AMM.deploy(await tokenA.getAddress(), await tokenB.getAddress());
  await amm.waitForDeployment();

  console.log(`SimpleAMM: ${await amm.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

