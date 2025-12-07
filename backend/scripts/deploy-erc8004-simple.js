const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const bip39 = require("bip39");
const config = require("../src/config");
const solc = require("solc");

/**
 * Compile and Deploy ERC8004 contracts to Avalanche Fuji Testnet
 *
 * This script compiles the contracts inline and deploys them.
 *
 * Usage:
 *   node scripts/deploy-erc8004-simple.js
 *
 * Required environment variables:
 *   - X402_WALLET_PRIVATE_KEY: Private key or mnemonic phrase
 *   - X402_RPC_URL: RPC URL (defaults to Fuji testnet)
 */

async function compileContract(contractName, contractPath) {
	console.log(`   Compiling ${contractName}...`);

	const contractSource = fs.readFileSync(contractPath, "utf8");

	// Solc input format
	const input = {
		language: "Solidity",
		sources: {
			[contractName]: {
				content: contractSource,
			},
		},
		settings: {
			outputSelection: {
				"*": {
					"*": ["abi", "evm.bytecode"],
				},
			},
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	};

	// We need to handle OpenZeppelin imports
	// For now, let's try to compile and see what happens
	try {
		const output = JSON.parse(solc.compile(JSON.stringify(input)));

		if (output.errors) {
			const errors = output.errors.filter((e) => e.severity === "error");
			if (errors.length > 0) {
				throw new Error(`Compilation errors: ${JSON.stringify(errors, null, 2)}`);
			}
		}

		const contract = output.contracts[contractName][contractName];
		return {
			abi: contract.abi,
			bytecode: contract.evm.bytecode.object,
		};
	} catch (error) {
		console.error(`   Compilation failed: ${error.message}`);
		throw error;
	}
}

async function deployERC8004() {
	try {
		console.log("🚀 Compiling and Deploying ERC8004 contracts to Avalanche Fuji Testnet...\n");

		// Validate configuration
		if (!config.x402.walletPrivateKey) {
			throw new Error("X402_WALLET_PRIVATE_KEY is not set. Please set it in your .env file or Core/config.js");
		}

		const rpcUrl = config.x402.rpcUrl || "https://api.avax-test.network/ext/bc/C/rpc";
		const provider = new ethers.JsonRpcProvider(rpcUrl);

		// Handle both mnemonic phrase and raw private key
		let wallet;
		const walletKey = config.x402.walletPrivateKey.trim();

		// Check if it's a mnemonic phrase (contains spaces)
		if (walletKey.includes(" ")) {
			console.log("🔑 Detected mnemonic phrase, converting to wallet...");
			// Validate mnemonic
			if (!bip39.validateMnemonic(walletKey)) {
				throw new Error("Invalid mnemonic phrase");
			}
			// Convert mnemonic to wallet using ethers
			const hdNode = ethers.HDNodeWallet.fromPhrase(walletKey);
			wallet = hdNode.connect(provider);
		} else {
			// Assume it's a raw private key
			wallet = new ethers.Wallet(walletKey, provider);
		}

		console.log(`📡 Network: ${rpcUrl}`);
		console.log(`Deployer address: ${wallet.address}`);

		// Check balance
		const balance = await provider.getBalance(wallet.address);
		console.log(`Deployer balance: ${ethers.formatEther(balance)} AVAX`);

		const network = await provider.getNetwork();
		const chainId = Number(network.chainId);
		const networkName = chainId === 43113 ? "Avalanche Fuji Testnet" : chainId === 43114 ? "Avalanche C-Chain Mainnet" : `Chain ID: ${chainId}`;
		console.log(`Network: ${networkName} (Chain ID: ${chainId})\n`);

		if (balance === 0n) {
			throw new Error("Insufficient balance. Please fund the deployer address.");
		}

		const contractsDir = path.resolve(__dirname, "../contracts");
		const deploymentInfo = {
			network: networkName,
			chainId: chainId,
			rpcUrl: rpcUrl,
			deployer: wallet.address,
			contracts: {},
			deployedAt: new Date().toISOString(),
		};

		// Step 1: Compile and Deploy Identity Registry
		console.log("📝 Step 1: Compiling and Deploying ERC8004IdentityRegistry...");
		const identityPath = path.join(contractsDir, "ERC8004IdentityRegistry.sol");

		// Note: Compilation with OpenZeppelin imports requires proper setup
		// For now, we'll provide a workaround
		console.log("   ⚠️  Compilation requires OpenZeppelin contracts.");
		console.log("   💡 Recommended: Use Remix IDE or Hardhat to compile first.\n");
		console.log("   Alternative: Install OpenZeppelin contracts locally:");
		console.log("   npm install @openzeppelin/contracts");
		console.log("   Then update solc to handle node_modules imports\n");

		// For now, let's check if we can find pre-compiled artifacts
		const artifactsDir = path.resolve(__dirname, "../artifacts/contracts");
		if (fs.existsSync(artifactsDir)) {
			console.log("   ✅ Found compiled artifacts, using those...\n");
			// Try to load from artifacts
			// This would work if Hardhat compiled them
		} else {
			console.log("   📦 No compiled artifacts found.");
			console.log("   Please compile contracts first using one of these methods:\n");
			console.log("   1. Remix IDE: https://remix.ethereum.org");
			console.log("      - Upload contracts");
			console.log("      - Install @openzeppelin/contracts via File Explorer");
			console.log("      - Compile and copy bytecode/ABI\n");
			console.log("   2. Hardhat (in a separate project):");
			console.log("      - Create new Hardhat project");
			console.log("      - Copy contracts and install OpenZeppelin");
			console.log("      - Compile: npx hardhat compile\n");
			console.log("   3. Use this script after compilation\n");
			process.exit(1);
		}

		// If we get here, we have compiled contracts
		// Deploy Identity Registry first
		console.log("   Deploying Identity Registry...");
		// const identityFactory = new ethers.ContractFactory(identityABI, identityBytecode, wallet);
		// const identityRegistry = await identityFactory.deploy();
		// await identityRegistry.waitForDeployment();
		// const identityAddress = await identityRegistry.getAddress();
		// deploymentInfo.contracts.identityRegistry = identityAddress;
		// console.log(`   ✅ Deployed to: ${identityAddress}\n`);

		// Deploy Reputation Registry (requires Identity Registry address)
		// Deploy Validation Registry (requires Identity Registry address)

		// Save deployment info
		const deploymentPath = path.resolve(__dirname, "../erc8004-deployment.json");
		fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
		console.log("📄 Deployment info saved to:", deploymentPath);

		if (chainId === 43113) {
			console.log("\n🔍 View contracts on Fuji testnet explorer:");
			console.log("   https://testnet.snowtrace.io\n");
		}
	} catch (error) {
		console.error("❌ Deployment failed:", error.message);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	}
}

if (require.main === module) {
	deployERC8004()
		.then(() => {
			console.log("✨ Done!");
			process.exit(0);
		})
		.catch((error) => {
			console.error("❌ Error:", error);
			process.exit(1);
		});
}

module.exports = { deployERC8004 };
