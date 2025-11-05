// scripts/deployAttackerWithBeneficiary.js
const hre = require("hardhat");

async function main() {
  const [deployer, attackerEOA] = await hre.ethers.getSigners();

  const TOKENA_ADDR = "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1";
  const TOKENB_ADDR = "0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44";
  const AMM_ADDR    = "0xa85233C63b9Ee964Add6F2cffe00Fd84eb32338f";
  const LENDING_ADDR= "0x4A679253410272dd5232B3Ff7cF5dbB88f295319";

  const Attacker = await hre.ethers.getContractFactory("AttackerFlash");
  const attacker = await Attacker.deploy(TOKENA_ADDR, TOKENB_ADDR, AMM_ADDR, LENDING_ADDR, attackerEOA.address);
  await attacker.waitForDeployment();

  console.log("AttackerContract deployed at:", await attacker.getAddress());
  console.log("Beneficiary (attacker EOA):", attackerEOA.address);
}

main().catch(e=>{ console.error(e); process.exitCode=1; });

