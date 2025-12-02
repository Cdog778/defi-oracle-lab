DeFi Flash-Loan Oracle Manipulation Lab

A complete hands-on simulation of a real DeFi price-oracle exploit using flash loans and AMM reserve manipulation.

This project demonstrates how an attacker:

Takes a flash loan

Manipulates an AMM price oracle

Triggers an under-collateralized loan

Drains a lending pool

Extracts profit into their own wallet

An interactive React dashboard visualizes the exploit step by step.

Table of Contents

Prerequisites

Installation

MetaMask Configuration

Running the Lab

Starting the Dashboard

Exploit Walkthrough

Price Chart Behavior

Expected Results

Troubleshooting

Summary

1. Prerequisites

Install:

Node.js 18–22 (LTS recommended)

npm (bundled with Node.js)

MetaMask browser extension

Project uses:

Hardhat

React

ethers.js

Chart.js

OpenZeppelin ERC20

Hardhat Toolbox

2. Installation

From project root:

npm install


Install dashboard dependencies:

cd dashboard
npm install

3. MetaMask Configuration

Add the Hardhat local network.

Network Settings
Field	Value
Network Name	Hardhat Local
RPC URL	http://127.0.0.1:8545

Chain ID	31337
Currency Symbol	ETH
Import Accounts

Hardhat prints 20 accounts when the local chain starts. Import:

Account #0 → Deployer

Account #1 → Attacker / Beneficiary

In MetaMask:
Account Menu → Import Account → paste private key

4. Running the Lab
Terminal 1 – Start Local Blockchain
npx hardhat node


Leave this terminal running.

Terminal 2 – Deploy Base Contracts
npx hardhat run scripts/deployFlashSetup.js --network localhost


You should see output confirming:

TokenA deployed

TokenB deployed

AMM seeded (1000 A / 1000 B)

Lending pool funded (5000 B)

Flash loan provider funded (2000 A)

Beneficiary prefunded (100 A)

contracts.json written to dashboard

Deploy Attacker Contract
npx hardhat run scripts/deployAttackerWithBeneficiary.js --network localhost


This updates:

dashboard/src/contracts.json


The dashboard automatically reads deployed addresses from this file.

5. Starting the Dashboard
cd dashboard
npm start


Runs at:

http://localhost:3000

6. Exploit Walkthrough

Follow this exact sequence for the full exploit demonstration.

Step 1 — Use Account 0 (Deployer)

Click Connect MetaMask (should show deployer address).

Click:

Fund Attacker (900.4 A)

This transfers 900.4 TokenA from Account 0 to the attacker contract.

Step 2 — Switch to Account 1 (Attacker Beneficiary)

Switch in MetaMask and then click Connect MetaMask again.

Click:

Deposit Collateral (100 A)

This performs:

Transfer of 100 A from Account 1

Attacker contract depositing 100 A into the lending pool

Lending panel should show roughly:

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

Attacker borrows maximum B allowed

Flash loan repaid with small fee

Stolen TokenB transferred to Account 1

7. Price Chart Behavior

The chart:

Remains flat during normal usage

Drops sharply when price is manipulated

Reflects AMM reserve-based pricing

Does not auto-correct without new swaps

Real AMMs (Uniswap-style) price purely from reserves; no external oracle.

8. Expected Results

You should see:

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

If your results are similar, the exploit completed successfully.

9. Troubleshooting

Deposit fails
Cause: Account 1 has fewer than 100 A.
Fix: Redeploy and ensure prefund step ran correctly.

Price manipulation fails
Cause: Swapping using EOA instead of contract.
Fix: Use provided manipulation or flash-loan path.

Flash loan returns "zero borrow"
Cause: Collateral not recorded.
Fix: Ensure depositCollateral() is correct and ABI is up to date.

React buttons break after switching accounts
Fix: Always reconnect MetaMask after switching.

ABI mismatch
Fix: Copy updated artifact ABI into dashboard/src/abis.

10. Summary

This lab demonstrates:

AMM oracle manipulation via reserve imbalance

Flash-loan-driven price distortion

Under-collateralized borrowing

Full exploit lifecycle and profit extraction

Real-time visualization in React

To run the exploit:

Fund Attacker (Account 0)

Deposit Collateral (Account 1)

Execute Flash Loan Attack (Account 1)

This closely mirrors real-world flash-loan oracle attacks such as those on Cream Finance, Harvest, Cheese Bank, and bZx.
