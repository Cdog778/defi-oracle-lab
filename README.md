A local **Decentralized Finance (DeFi) security lab** that demonstrates how a lending protocol can be exploited through **on-chain oracle manipulation** and **flash-loan-enabled price attacks**.

---

## Overview
This lab simulates a miniature DeFi ecosystem:
- Two ERC-20 tokens (`TokenA`, `TokenB`)
- A constant-product AMM (`SimpleAMM`) that acts as a price oracle
- A vulnerable lending contract (`VulnerableLending`) that trusts the AMM spot price
- A flash-loan provider (`FlashLoanProvider`)
- An attacker contract (`AttackerFlash`) that performs an atomic exploit using a flash loan

The project shows how an attacker can:
1. Borrow large capital via a flash loan.
2. Manipulate the AMM price.
3. Borrow undervalued tokens from the lending pool.
4. Repay the loan with a small fee and keep the profit — all in one transaction.

---

##  Environment Setup

### Requirements
- Ubuntu 22.04 LTS (recommended VM)
- Node.js 22 LTS and npm
- Git & build-essential tools

### Installation
```bash
sudo apt update && sudo apt install -y git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
git clone git@github.com:Cdog778/defi-oracle-lab.git
cd defi-oracle-lab
npm install

1. Start a local blockchain
 
npx hardhat node

2. Deploy contracts In a new terminal:

npx hardhat run scripts/deployFlashSetup.js --network localhost
npx hardhat run scripts/deployAttackerWithBeneficiary.js --network localhost
Replace variables in runFlashExploit based on output

3. Execute the flash-loan exploit

npx hardhat run scripts/runFlashExploit.js --network localhost
