DeFi Flash-Loan Oracle Manipulation Lab
A hands-on simulation of a real DeFi price-oracle exploit using flash loans and AMM reserve manipulation.
This project demonstrates how an attacker:
• 	Takes a flash loan
• 	Manipulates an AMM spot price
• 	Causes an oracle to read a distorted price
• 	Triggers an under-collateralized borrow
• 	Drains a lending pool
• 	Extracts profit into their wallet
A React dashboard visualizes the attack step-by-step.

Table of Contents
• 	Prerequisites
• 	Installation
• 	MetaMask Configuration
• 	Running the Lab
• 	Starting the Dashboard
• 	Exploit Walkthrough
• 	Expected Results
• 	Troubleshooting
• 	Summary

Prerequisites
Install the following:
• 	Node.js 18–22 (LTS recommended)
• 	npm
• 	MetaMask browser extension
Project uses:
• 	Hardhat
• 	React
• 	ethers.js
• 	Chart.js
• 	OpenZeppelin ERC20
• 	Hardhat Toolbox

Installation
From project root:


MetaMask Configuration
1. 	Install the MetaMask browser extension.
2. 	Create or import a wallet.
3. 	Connect MetaMask to your local Hardhat network:
• 	Network Name: 
• 	RPC URL: 
• 	Chain ID: 
• 	Currency Symbol: 

Running the Lab
1. 	Start a local Hardhat node:

2. 	Deploy contracts:

3. 	Fund attacker wallet with test ETH using Hardhat accounts.

Starting the Dashboard
From the  directory:

Open http://localhost:3000 in your browser to view the React dashboard.

Exploit Walkthrough
The dashboard guides you through:
1. 	Taking a flash loan.
2. 	Manipulating AMM reserves to distort spot price.
3. 	Oracle reading the manipulated price.
4. 	Triggering under-collateralized borrow.
5. 	Draining the lending pool.
6. 	Extracting profit into attacker wallet.

Expected Results
• 	Lending pool balance decreases.
• 	Attacker wallet balance increases.
• 	Dashboard charts show manipulated price and exploit timeline.

Troubleshooting
• 	Error HH411: Install missing OpenZeppelin contracts:

• 	MetaMask not connecting: Verify RPC URL and Chain ID.
• 	Dashboard not loading: Ensure React dev server is running on port 3000.

Summary
This lab demonstrates how flash loans can be abused to manipulate AMM reserves, distort oracle prices, and drain lending pools. It provides a safe, educational environment to understand oracle vulnerabilities and the importance of robust price feeds in DeFi.
