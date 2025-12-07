const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const config = require("../src/config");
require("dotenv").config();

/**
 * Compile and Deploy ERC8004 contracts to Avalanche Fuji Testnet
 *
 * This script:
 * 1. Compiles the contracts using solc
 * 2. Deploys all three ERC8004 contracts
 * 3. Saves deployment info
 */

async function compileAndDeploy() {
	console.log("🚀 Compiling and Deploying ERC8004 contracts to Avalanche Fuji Testnet...\n");

	// Get private key from env
	const privateKey = process.env.X402_WALLET_PRIVATE_KEY;
	if (!privateKey) {
		throw new Error("X402_WALLET_PRIVATE_KEY not found in .env file");
	}

	// Get RPC URL
	const rpcUrl = config.x402?.rpcUrl || "https://api.avax-test.network/ext/bc/C/rpc";

	// Setup provider and signer
	const provider = new ethers.JsonRpcProvider(rpcUrl);
	const wallet = new ethers.Wallet(privateKey, provider);

	console.log("Deployer address:", wallet.address);
	const balance = await provider.getBalance(wallet.address);
	console.log("Deployer balance:", ethers.formatEther(balance), "AVAX");

	// Get network info
	const network = await provider.getNetwork();
	const chainId = Number(network.chainId);
	const networkName = chainId === 43113 ? "Avalanche Fuji Testnet" : chainId === 43114 ? "Avalanche C-Chain Mainnet" : `Chain ID: ${chainId}`;
	console.log(`📡 Network: ${networkName} (Chain ID: ${chainId})\n`);

	if (balance === 0n) {
		throw new Error("Insufficient balance. Please fund the deployer address.");
	}

	// For now, we'll use a simplified approach
	// In production, you'd compile with Hardhat/Foundry first
	console.log("⚠️  Note: This script requires compiled contracts.");
	console.log("   Please compile contracts first using Hardhat or Foundry.\n");
	console.log("   Quick setup:");
	console.log("   1. Create a separate Hardhat project or");
	console.log("   2. Use: npx @remix-project/remixd -s contracts -u https://remix.ethereum.org");
	console.log("   3. Compile in Remix and copy bytecode/ABI\n");

	// Check if we have compiled artifacts
	const artifactsDir = path.resolve(__dirname, "../artifacts/contracts");
	const hasArtifacts = fs.existsSync(artifactsDir);

	if (!hasArtifacts) {
		console.log("📦 Attempting to use Hardhat for compilation...\n");

		// Try to use Hardhat via a subprocess
		const { execSync } = require("child_process");
		try {
			// Create a temporary Hardhat project
			const tempDir = path.resolve(__dirname, "../temp-hardhat");
			if (!fs.existsSync(tempDir)) {
				fs.mkdirSync(tempDir, { recursive: true });
			}

			console.log("   Creating temporary Hardhat setup...");
			// We'll need to set up Hardhat properly
			// For now, let's provide instructions
			console.log("\n   Please run:");
			console.log("   cd contracts");
			console.log("   npx hardhat compile");
			console.log("   (or use Remix IDE to compile)\n");

			process.exit(1);
		} catch (error) {
			console.error("   Compilation setup failed:", error.message);
			console.log("\n   Alternative: Use Remix IDE (https://remix.ethereum.org)");
			console.log("   1. Upload contracts to Remix");
			console.log("   2. Compile each contract");
			console.log("   3. Copy bytecode and ABI");
			console.log("   4. Update this script with the bytecode/ABI\n");
			process.exit(1);
		}
	}

	// If we have artifacts, load them and deploy
	console.log("✅ Found compiled contracts, proceeding with deployment...\n");

	// Deployment info
	const deploymentInfo = {
		network: networkName,
		chainId: chainId,
		rpcUrl: rpcUrl,
		deployer: wallet.address,
		contracts: {},
		deployedAt: new Date().toISOString(),
	};

	// Deploy contracts (this would need the actual bytecode)
	// For now, this is a template

	console.log("📝 Deploying ERC8004IdentityRegistry...");
	// TODO: Load bytecode and deploy
	console.log("   ⏳ Requires compiled bytecode\n");

	console.log("⭐ Deploying ERC8004ReputationRegistry...");
	// TODO: Load bytecode and deploy with Identity Registry address
	console.log("   ⏳ Requires compiled bytecode\n");

	console.log("✅ Deploying ERC8004ValidationRegistry...");
	// TODO: Load bytecode and deploy with Identity Registry address
	console.log("   ⏳ Requires compiled bytecode\n");

	// Save deployment info
	const deploymentPath = path.resolve(__dirname, "../erc8004-deployment.json");
	fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

	console.log("📄 Deployment template saved to:", deploymentPath);
	console.log("\n💡 To complete deployment:");
	console.log("   1. Compile contracts (see instructions above)");
	console.log("   2. Update this script with bytecode/ABI");
	console.log("   3. Run again\n");
}

if (require.main === module) {
	compileAndDeploy()
		.then(() => {
			console.log("✨ Done!");
			process.exit(0);
		})
		.catch((error) => {
			console.error("❌ Failed:", error.message);
			process.exit(1);
		});
}

module.exports = { compileAndDeploy };
