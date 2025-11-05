const hre = require("hardhat");

async function main() {
  const [deployer, attackerEOA] = await hre.ethers.getSigners();

  // Deploy tokens + AMM + lending (you can reuse existing deployed addresses if you prefer)
  const TokenA = await hre.ethers.getContractFactory("TokenA");
  const TokenB = await hre.ethers.getContractFactory("TokenB");
  const AMM = await hre.ethers.getContractFactory("SimpleAMM");
  const Lending = await hre.ethers.getContractFactory("VulnerableLending");
  const Flash = await hre.ethers.getContractFactory("FlashLoanProvider");
  const Attacker = await hre.ethers.getContractFactory("AttackerFlash");

  const tokenA = await TokenA.deploy();
  const tokenB = await TokenB.deploy();
  await tokenA.waitForDeployment();
  await tokenB.waitForDeployment();

  const amm = await AMM.deploy(await tokenA.getAddress(), await tokenB.getAddress());
  await amm.waitForDeployment();

  const lending = await Lending.deploy(await tokenA.getAddress(), await tokenB.getAddress(), await amm.getAddress());
  await lending.waitForDeployment();

  // seed AMM
  const seedA = hre.ethers.parseEther("1000");
  const seedB = hre.ethers.parseEther("1000");
  await tokenA.approve(await amm.getAddress(), seedA);
  await tokenB.approve(await amm.getAddress(), seedB);
  await amm.addLiquidity(seedA, seedB);

  // fund lending pool with TokenB
  const fundB = hre.ethers.parseEther("5000");
  await tokenB.approve(await lending.getAddress(), fundB);
  await lending.fundPool(fundB);

  // Deploy flash provider and attacker
  const flash = await Flash.deploy(await tokenA.getAddress());
  await flash.waitForDeployment();

  // fund flash loan provider with TokenA so it can lend
  const fundFlash = hre.ethers.parseEther("2000");
  await tokenA.approve(await flash.getAddress(), fundFlash);
  await flash.fund(fundFlash);

  // deploy attacker contract
  const attacker = await Attacker.deploy(await tokenA.getAddress(), await tokenB.getAddress(), await amm.getAddress(), await lending.getAddress());
  await attacker.waitForDeployment();

  // Fund attacker EOA with some TokenA collateral and have attacker deposit collateral into lending (via EOA or via attacker contract)
  // Give attacker EOA some TokenA
  await tokenA.transfer(attackerEOA.address, hre.ethers.parseEther("100"));
  // Attacker approves lending and deposits collateral
  await tokenA.connect(attackerEOA).approve(await lending.getAddress(), hre.ethers.parseEther("100"));
  await lending.connect(attackerEOA).depositCollateral(hre.ethers.parseEther("100"));

  console.log("Deployed addresses:");
  console.log("TokenA", await tokenA.getAddress());
  console.log("TokenB", await tokenB.getAddress());
  console.log("AMM", await amm.getAddress());
  console.log("Lending", await lending.getAddress());
  console.log("FlashProvider", await flash.getAddress());
  console.log("AttackerContract", await attacker.getAddress());
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

