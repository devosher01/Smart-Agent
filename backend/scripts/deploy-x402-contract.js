const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const bip39 = require("bip39");
const config = require("../src/config");

/**
 * Deploy VerifikPayment contract to Avalanche C-Chain
 *
 * Usage:
 *   node scripts/deploy-x402-contract.js
 *
 * Required environment variables (or set in Core/config.js):
 *   - X402_WALLET_PRIVATE_KEY: Private key or mnemonic phrase of the wallet to deploy from
 *   - X402_RPC_URL: RPC URL for Avalanche C-Chain (default: https://api.avax.network/ext/bc/C/rpc)
 */
const deployContract = async () => {
	try {
		// Validate configuration
		if (!config.x402.walletPrivateKey) {
			throw new Error("X402_WALLET_PRIVATE_KEY is not set. Please set it in your .env file or Core/config.js");
		}

		const rpcUrl = config.x402.rpcUrl || "https://api.avax.network/ext/bc/C/rpc";
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

		console.log("Deploying VerifikPayment contract...");
		console.log(`Network: ${rpcUrl}`);
		console.log(`Deployer address: ${wallet.address}`);

		// Check balance
		const balance = await provider.getBalance(wallet.address);
		const balanceInAVAX = ethers.formatEther(balance);
		console.log(`Wallet balance: ${balanceInAVAX} AVAX`);

		if (parseFloat(balanceInAVAX) < 0.01) {
			console.warn("⚠️  Warning: Low balance. You may need AVAX to pay for gas fees.");
		}

		// Contract ABI and bytecode
		// Note: This is the compiled bytecode. If you need to compile from source,
		// you'll need to install solc and compile the .sol file first.
		const contractABI = [
			"constructor()",
			"function payForService(string memory serviceId, string memory requestId) public payable",
			"function withdraw() public",
			"function getBalance() public view returns (uint256)",
			"event PaymentReceived(address indexed payer, string serviceId, string requestId, uint256 amount)",
			"event Withdrawal(address indexed owner, uint256 amount)",
		];

		// Contract bytecode (compiled VerifikPayment.sol)
		// This needs to be compiled from the Solidity source
		// For now, we'll use a factory pattern or you can compile it separately
		const contractSource = fs.readFileSync(path.join(__dirname, "../contracts/VerifikPayment.sol"), "utf8");

		console.log("\n📝 Contract source loaded. Compiling...");

		// Try to use solc if available, otherwise provide instructions
		let contractFactory;
		try {
			const solc = require("solc");

			// Compile the contract
			const input = {
				language: "Solidity",
				sources: {
					"VerifikPayment.sol": {
						content: contractSource,
					},
				},
				settings: {
					outputSelection: {
						"*": {
							"*": ["abi", "evm.bytecode"],
						},
					},
				},
			};

			const output = JSON.parse(solc.compile(JSON.stringify(input)));

			if (output.errors) {
				const errors = output.errors.filter((e) => e.severity === "error");
				if (errors.length > 0) {
					throw new Error(`Compilation errors:\n${errors.map((e) => e.formattedMessage).join("\n")}`);
				}
			}

			const contract = output.contracts["VerifikPayment.sol"]["VerifikPayment"];
			const abi = contract.abi;
			const bytecode = contract.evm.bytecode.object;

			contractFactory = new ethers.ContractFactory(abi, bytecode, wallet);
		} catch (error) {
			if (error.code === "MODULE_NOT_FOUND") {
				console.error(
					"\n❌ Error: solc package not found.\n" +
						"Please install it first:\n" +
						"  npm install --save-dev solc\n\n" +
						"Or compile the contract manually using Remix IDE (https://remix.ethereum.org)\n" +
						"and update this script with the compiled bytecode."
				);
				process.exit(1);
			}
			throw error;
		}

		// Deploy the contract
		console.log("\n🚀 Deploying contract...");
		const contract = await contractFactory.deploy();

		console.log(`⏳ Transaction hash: ${contract.deploymentTransaction().hash}`);
		console.log("⏳ Waiting for deployment confirmation...");

		await contract.waitForDeployment();
		const contractAddress = await contract.getAddress();

		console.log("\n✅ Contract deployed successfully!");
		console.log(`📍 Contract address: ${contractAddress}`);
		console.log(`🔗 View on Snowtrace: https://snowtrace.io/address/${contractAddress}`);

		// Save the contract address
		console.log("\n📋 Next steps:");
		console.log(`1. Add this to your .env file:`);
		console.log(`   X402_CONTRACT_ADDRESS=${contractAddress}`);
		console.log(`\n2. Or update Core/config.js directly`);
		console.log(`\n3. Update the controller to use config.x402.contractAddress`);

		return contractAddress;
	} catch (error) {
		console.error("\n❌ Deployment failed:", error.message);
		if (error.transaction) {
			console.error("Transaction details:", error.transaction);
		}
		if (error.receipt) {
			console.error("Receipt:", error.receipt);
		}
		process.exit(1);
	}
};

// Run deployment if called directly
if (require.main === module) {
	deployContract()
		.then(() => {
			console.log("\n✨ Deployment script completed!");
			process.exit(0);
		})
		.catch((error) => {
			console.error("Fatal error:", error);
			process.exit(1);
		});
}

module.exports = { deployContract };
