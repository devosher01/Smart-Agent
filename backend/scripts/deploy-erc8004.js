const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const config = require("../src/config");

/**
 * Deploy ERC8004 contracts to Avalanche Fuji Testnet (or mainnet if configured)
 *
 * This script deploys:
 * 1. ERC8004IdentityRegistry - For AI agent identities (ERC-721)
 * 2. ERC8004ReputationRegistry - For agent reputation/feedback
 * 3. ERC8004ValidationRegistry - For validation proofs
 *
 * Defaults to Fuji testnet (Chain ID: 43113)
 * Explorer: https://testnet.snowtrace.io
 */
async function deployERC8004() {
	console.log("🚀 Deploying ERC8004 contracts to Avalanche Fuji Testnet...\n");

	// Get RPC URL and private key (defaults to Fuji testnet)
	const rpcUrl = config.x402?.rpcUrl || "https://api.avax-test.network/ext/bc/C/rpc";
	const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

	if (!privateKey) {
		throw new Error("DEPLOYER_PRIVATE_KEY environment variable is required");
	}

	// Setup provider and signer
	const provider = new ethers.JsonRpcProvider(rpcUrl);
	const wallet = new ethers.Wallet(privateKey, provider);

	console.log("Deployer address:", wallet.address);
	const balance = await provider.getBalance(wallet.address);
	console.log("Deployer balance:", ethers.formatEther(balance), "AVAX");

	// Get network info early to show which network we're on
	const network = await provider.getNetwork();
	const chainId = Number(network.chainId);
	const networkName = chainId === 43113 ? "Avalanche Fuji Testnet" : chainId === 43114 ? "Avalanche C-Chain Mainnet" : `Chain ID: ${chainId}`;
	console.log(`📡 Network: ${networkName} (Chain ID: ${chainId})\n`);

	if (balance === 0n) {
		throw new Error("Insufficient balance. Please fund the deployer address.");
	}

	// Read contract files
	const contractsDir = path.resolve(__dirname, "../contracts");

	// Note: In production, you would compile these with Hardhat or Foundry
	// For now, we'll assume they're already compiled and we have ABIs
	// You'll need to compile the contracts first and get their bytecode/ABI

	console.log("⚠️  Note: Contracts must be compiled first!");
	console.log("   Use: npx hardhat compile or forge build\n");

	// Contract addresses (will be set after deployment)
	const deploymentInfo = {
		network: networkName,
		chainId: chainId,
		rpcUrl: rpcUrl,
		deployer: wallet.address,
		contracts: {
			identityRegistry: null,
			reputationRegistry: null,
			validationRegistry: null,
		},
		deployedAt: new Date().toISOString(),
	};

	// Step 1: Deploy Identity Registry
	console.log("📝 Step 1: Deploying ERC8004IdentityRegistry...");
	// TODO: Deploy Identity Registry contract
	// const identityFactory = new ethers.ContractFactory(IDENTITY_ABI, IDENTITY_BYTECODE, wallet);
	// const identityRegistry = await identityFactory.deploy();
	// await identityRegistry.waitForDeployment();
	// deploymentInfo.contracts.identityRegistry = await identityRegistry.getAddress();
	console.log("   ⏳ Identity Registry deployment (requires compiled contracts)\n");

	// Step 2: Deploy Reputation Registry
	console.log("⭐ Step 2: Deploying ERC8004ReputationRegistry...");
	// TODO: Deploy Reputation Registry with Identity Registry address
	// const reputationFactory = new ethers.ContractFactory(REPUTATION_ABI, REPUTATION_BYTECODE, wallet);
	// const reputationRegistry = await reputationFactory.deploy(deploymentInfo.contracts.identityRegistry);
	// await reputationRegistry.waitForDeployment();
	// deploymentInfo.contracts.reputationRegistry = await reputationRegistry.getAddress();
	console.log("   ⏳ Reputation Registry deployment (requires compiled contracts)\n");

	// Step 3: Deploy Validation Registry
	console.log("✅ Step 3: Deploying ERC8004ValidationRegistry...");
	// TODO: Deploy Validation Registry with Identity Registry address
	// const validationFactory = new ethers.ContractFactory(VALIDATION_ABI, VALIDATION_BYTECODE, wallet);
	// const validationRegistry = await validationFactory.deploy(deploymentInfo.contracts.identityRegistry);
	// await validationRegistry.waitForDeployment();
	// deploymentInfo.contracts.validationRegistry = await validationRegistry.getAddress();
	console.log("   ⏳ Validation Registry deployment (requires compiled contracts)\n");

	// Save deployment info
	const deploymentPath = path.resolve(__dirname, "../erc8004-deployment.json");
	fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

	console.log("📄 Deployment info saved to:", deploymentPath);
	console.log("\n✅ Deployment script ready!");
	console.log("\n📋 Next steps:");
	console.log("   1. Compile contracts: npx hardhat compile");
	console.log("   2. Update this script with compiled bytecode/ABI");
	console.log("   3. Run: node scripts/deploy-erc8004.js");
	console.log("   4. Update Core/config.js with contract addresses");
	if (chainId === 43113) {
		console.log("\n🔍 View contracts on Fuji testnet explorer:");
		console.log("   https://testnet.snowtrace.io\n");
	}
}

// Run deployment
if (require.main === module) {
	deployERC8004()
		.then(() => {
			console.log("✨ Done!");
			process.exit(0);
		})
		.catch((error) => {
			console.error("❌ Deployment failed:", error);
			process.exit(1);
		});
}

module.exports = { deployERC8004 };
