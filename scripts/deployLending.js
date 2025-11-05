//This script deploys everything fresh, seeds the AMM and funds the lending pool with TokenB.

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  // assume TokenA, TokenB, and SimpleAMM are already deployed in this run or we deploy fresh copies
  const TokenA = await hre.ethers.getContractFactory("TokenA");
  const TokenB = await hre.ethers.getContractFactory("TokenB");
  const AMM = await hre.ethers.getContractFactory("SimpleAMM");
  const Lending = await hre.ethers.getContractFactory("VulnerableLending");

  const tokenA = await TokenA.deploy();
  const tokenB = await TokenB.deploy();
  await tokenA.waitForDeployment();
  await tokenB.waitForDeployment();

  const amm = await AMM.deploy(await tokenA.getAddress(), await tokenB.getAddress());
  await amm.waitForDeployment();

  const lending = await Lending.deploy(await tokenA.getAddress(), await tokenB.getAddress(), await amm.getAddress());
  await lending.waitForDeployment();

  console.log("Deployed addresses:");
  console.log("TokenA:", await tokenA.getAddress());
  console.log("TokenB:", await tokenB.getAddress());
  console.log("AMM:", await amm.getAddress());
  console.log("Lending:", await lending.getAddress());

  // seed AMM liquidity
  const amountA = hre.ethers.parseEther("1000");
  const amountB = hre.ethers.parseEther("1000");
  await tokenA.approve(await amm.getAddress(), amountA);
  await tokenB.approve(await amm.getAddress(), amountB);
  await amm.addLiquidity(amountA, amountB);
  console.log("AMM seeded with 1000/1000");

  // seed lending pool with TokenB liquidity (so borrowers can take out)
  const fundAmountB = hre.ethers.parseEther("5000"); // pool has 5000 TKB to lend
  // approve and fund lending pool
  await tokenB.approve(await lending.getAddress(), fundAmountB);
  await lending.fundPool(fundAmountB);
  console.log("Lending pool funded with 5000 TokenB");

  // mint and distribute some TokenA to attacker account for collateral demonstrations
  const accounts = await hre.ethers.getSigners();
  const attacker = accounts[1];
  await tokenA.transfer(await attacker.getAddress(), hre.ethers.parseEther("1000"));
  console.log("Attacker tokenA funded 1000");
}

main().catch((e)=>{ console.error(e); process.exitCode = 1; });

