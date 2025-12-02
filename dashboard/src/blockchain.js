import { ethers } from "ethers";
import { CONTRACTS } from "./config";

import TokenA from "./abis/TokenA.json";
import TokenB from "./abis/TokenB.json";
import SimpleAMM from "./abis/SimpleAMM.json";
import Lending from "./abis/VulnerableLending.json";
import FlashProvider from "./abis/FlashLoanProvider.json";
import AttackerFlash from "./abis/AttackerFlash.json";

export function getContracts(signer) {
  return {
    tokenA: new ethers.Contract(CONTRACTS.tokenA, TokenA.abi, signer),
    tokenB: new ethers.Contract(CONTRACTS.tokenB, TokenB.abi, signer),
    amm: new ethers.Contract(CONTRACTS.amm, SimpleAMM.abi, signer),
    lending: new ethers.Contract(CONTRACTS.lending, Lending.abi, signer),
    flash: new ethers.Contract(CONTRACTS.flashProvider, FlashProvider.abi, signer),
    attacker: new ethers.Contract(CONTRACTS.attacker, AttackerFlash.abi, signer),
  };
}
