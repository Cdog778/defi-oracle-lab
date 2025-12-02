 1. Prerequisites
Install:

Node.js 18–22 (LTS recommended)

npm (bundled with Node)

MetaMask browser extension

Project uses:

Hardhat

React

ethers.js

Chart.js

OpenZeppelin ERC20

Hardhat Toolbox

 2. Install Dependencies

From project root:

npm install


Then install dashboard dependencies:

cd dashboard
npm install

 3. Configure MetaMask for Hardhat Network
Add Hardhat Local Network:

MetaMask → Networks → Add Network → “Add a network manually”

Field	Value
Network Name	Hardhat Local
RPC URL	http://127.0.0.1:8545

Chain ID	31337
Currency Symbol	ETH
Import Hardhat Accounts

Hardhat node prints 20 accounts. Import these two:

Account #0 → Deployer

Account #1 → Attacker / Beneficiary

MetaMask → Account Menu → Import Account → paste private key.

 4. Running the Lab (Full Setup)
Terminal 1 — Start the Local Blockchain
npx hardhat node


Leave this running.

Terminal 2 — Deploy Base Contracts
npx hardhat run scripts/deployFlashSetup.js --network localhost


You should see:

✔ TokenA deployed
✔ TokenB deployed
✔ AMM deployed and seeded (1000 A / 1000 B)
✔ Lending pool funded (5000 B)
✔ Flash loan provider funded (2000 A)
✔ Beneficiary prefunded with 100 TokenA
✔ contracts.json written to frontend

Terminal 2 — Deploy Attacker Contract
npx hardhat run scripts/deployAttackerWithBeneficiary.js --network localhost


You should see:

✔ AttackerFlash deployed at: 0x...
✔ Beneficiary: 0x7099...
✔ contracts.json updated


This file is located at:

dashboard/src/contracts.json


React reads deployed addresses from this file automatically.

 5. Start the Dashboard
cd dashboard
npm start


The UI opens at:

http://localhost:3000

 6. Exploit Walkthrough (Sequential Demo)

This is the exact order to demo the exploit.

STEP 1 — Connect as Account 0 (Deployer)

Click → Connect MetaMask

UI should show:

Connected: 0xf39f...


Then click:

 Fund Attacker (900.4 A)

✔ Sends 900.4 TokenA from Account 0 to the attacker contract.

STEP 2 — Switch to Account 1 (Attacker Beneficiary)

In MetaMask → Switch account → Account 1.

Then click:

Connect MetaMask again (important — updates the signer).

UI should show:

Connected: 0x7099...


Click:

 Deposit Collateral (100 A)

✔ Account 1 transfers 100 A to attacker contract
✔ Attacker contract deposits 100 A into Lending
✔ Lending panel updates:

Collateral: 100 A
Value (B): ≈ 100 B
Max Borrow: ≈ 50 B

STEP 3 — Execute the Flash Loan Exploit

Click:

 Execute Flash Loan Attack

Internally:

FlashLoanProvider lends 800 A

Attacker contract swaps A→B (crashes AMM price)

Collateral value collapses

Attacker borrows max B despite tiny value

Pays back loan + fee

Sends stolen TokenB to Account 1

Expected Results:
AMM Market
Reserve A: ~1800
Reserve B: ~550
Spot Price: ~0.30 B/A

Lending Panel
Collateral: 100 A
Borrowed: ~15 B
Max Borrow: ~15 B
Pool Balance: ~4984 B

Attack Summary
Attacker Profit: ~450 B
Pool Remaining: ~4984 B

 7. Price Chart Behavior

The price chart:

Stays flat during normal operation

Drops sharply during price manipulation

Shows market distortion caused by the flash loan

Does not revert unless more swaps occur

This matches real AMM behavior: spot price is purely reserve-based.

 8. Expected Final Screen (Correct Exploit)

You should see:

Collateral = 100 A

Spot price ≈ 0.30 B/A

Borrowed ≈ 15.4 B

Pool Remaining ≈ 4984 B

Attacker Profit ≈ 450 B

Chart shows a steep price drop

If numbers look similar → exploit succeeded.

 9. Troubleshooting
 Deposit fails

Cause: Account 1 has <100 TokenA.
Fix: redeploy cleanly; ensure prefund step runs.
 Manipulate Price fails

Cause: Using EOA swap; attacker contract has the A tokens.
Fix: use manualManipulate or rely on flash-loan manipulation.

 Flash loan fails with "zero borrow"

Cause: Lending didn’t record collateral.
Fix: Ensure depositCollateral() exists and ABI is updated.

 React buttons break when switching MetaMask account

Fix: Always click Connect MetaMask after switching accounts.

 ABI mismatch

Fix: When updating Solidity:
Copy from artifacts/.../Contract.json → dashboard/src/abis

🎉 10. Summary

This lab shows:

Oracle manipulation via AMM reserve imbalance

Flash-loan-driven price distortion

Under-collateralized lending

Exploit profit extraction

Visualization of attack sequence

To run the exploit:

Fund Attacker (Account 0)

Deposit Collateral (Account 1)

Execute Flash Loan (Account 1)

This replicates how real DeFi hacks (Cream Finance, Harvest, Cheese Bank, bZx, etc.) have been executed in the wild.
