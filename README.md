# DeFi Flash-Loan Oracle Manipulation Lab

A hands-on simulation of a real DeFi price-oracle exploit using flash loans and AMM reserve manipulation.

This project demonstrates how an attacker:

- Takes a flash loan  
- Manipulates an AMM spot price  
- Causes an oracle to read a distorted price  
- Triggers an under-collateralized borrow  
- Drains a lending pool  
- Extracts profit into their wallet  

A React dashboard visualizes the attack step-by-step.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [MetaMask Configuration](#metamask-configuration)
- [Running the Lab](#running-the-lab)
- [Starting the Dashboard](#starting-the-dashboard)
- [Exploit Walkthrough](#exploit-walkthrough)
- [Expected Results](#expected-results)
- [Troubleshooting](#troubleshooting)
- [Summary](#summary)

---

## Prerequisites

Install the following:

- Node.js 18–22 (LTS recommended)
- npm
- MetaMask browser extension

Project uses:

- Hardhat
- React
- ethers.js
- Chart.js
- OpenZeppelin ERC20
- Hardhat Toolbox

---

## Installation

From project root:

```bash
npm install
Install dashboard dependencies:

bash
Copy code
cd dashboard
npm install
MetaMask Configuration
Add Hardhat Local Network
Network Settings

Field	Value
Network Name	Hardhat Local
RPC URL	http://127.0.0.1:8545
Chain ID	31337
Currency Symbol	ETH

Import Hardhat Accounts
Hardhat prints private keys on startup. Import:

Account #0 → Deployer

Account #1 → Attacker / Beneficiary

In MetaMask:
Account Menu → Import Account → Paste Private Key

Running the Lab
Terminal 1 — Start Local Blockchain
bash
Copy code
npx hardhat node
Keep this terminal running.

Terminal 2 — Deploy Base Contracts
bash
Copy code
npx hardhat run scripts/deployFlashSetup.js --network localhost
You should see confirmation:

TokenA deployed

TokenB deployed

AMM seeded (1000 A / 1000 B)

Lending pool funded (5000 B)

Flash loan provider funded (2000 A)

Beneficiary (Account 1) prefunded with 100 TokenA

dashboard/src/contracts.json updated

Deploy Attacker Contract
bash
Copy code
npx hardhat run scripts/deployAttackerWithBeneficiary.js --network localhost
This updates:

bash
Copy code
dashboard/src/contracts.json
Your dashboard automatically reads all deployed addresses.

Starting the Dashboard
bash
Copy code
cd dashboard
npm start
Runs at:

arduino
Copy code
http://localhost:3000
Exploit Walkthrough
Follow this exact sequence for the correct demo.

Step 1 — Use Account 0 (Deployer)
Click Connect MetaMask → Confirm UI shows Account 0.

Click:

Fund Attacker (900.4 A)
This transfers 900.4 TokenA from Account 0 to the attacker contract.

Step 2 — Switch to Account 1 (Attacker)
Switch in MetaMask → Click Connect MetaMask again.

Click:

Deposit Collateral (100 A)
This performs:

Transfer of 100 A from Account 1

Attacker contract deposits 100 A into the lending pool

The lending panel should update:

yaml
Copy code
Collateral: 100 A
Value: ~100 B
Max Borrow: ~50 B
Step 3 — Execute the Flash Loan Exploit
Click:

Execute Flash Loan Attack
Internal sequence:

Flash loan provider lends 800 A

Attacker swaps A→B, crashing AMM price

Collateral value collapses

Attacker borrows maximum allowed B

Flash loan repaid with small fee

Stolen TokenB transferred to Account 1

Expected Results
AMM Market
Reserve A: ~1800

Reserve B: ~550

Spot Price: ~0.30 B/A

Lending Panel
Collateral: 100 A

Borrowed: ~15 B

Max Borrow: ~15 B

Pool Remaining: ~4984 B

Attack Summary
Attacker Profit: ~450 B

Pool Remaining: ~4984 B

If your results are similar → the exploit succeeded.

Troubleshooting
Deposit fails
Cause: Account 1 has fewer than 100 TokenA
Fix: Redeploy cleanly and ensure prefund runs

Price manipulation fails
Cause: Using EOA TokenA balance
Fix: Use manualManipulate() or flash-loan manipulation

Flash loan returns “zero borrow”
Cause: Collateral was not recorded in Lending
Fix: Ensure depositCollateral() exists and ABI matches

Buttons fail after switching MetaMask account
Fix: Always reconnect MetaMask after switching accounts

ABI mismatch
Fix: Copy updated artifacts from:
artifacts/contracts/... → dashboard/src/abis/

Summary
This lab demonstrates:

AMM oracle manipulation

Flash loan–driven price distortion

Under-collateralized lending

Realistic DeFi attack flow

React-based live visualization

Minimal Exploit Steps:
Fund Attacker (Account 0)

Deposit Collateral (Account 1)

Execute Flash Loan Attack (Account 1)

This replicates real flash-loan oracle exploits seen in bZx, Cream Finance, Harvest, Cheese Bank, and more.
