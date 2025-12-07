const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const bip39 = require("bip39");
const config = require("../src/config");

/**
 * Register AI Agent on ERC8004 Identity Registry
 *
 * This script registers the Verifik AI Agent on-chain, minting its identity NFT.
 *
 * Usage:
 *   node scripts/register-agent.js
 *
 * Required environment variables:
 *   - X402_WALLET_PRIVATE_KEY: Private key or mnemonic phrase (must be contract owner or have permission)
 */

async function registerAgent() {
	try {
		console.log("🚀 Registering Verifik AI Agent on ERC8004 Identity Registry...\n");

		// Validate configuration
		if (!config.x402.walletPrivateKey) {
			throw new Error("X402_WALLET_PRIVATE_KEY is not set. Please set it in your .env file or Core/config.js");
		}

		if (!config.erc8004.identityRegistry) {
			throw new Error("ERC8004 Identity Registry address not configured. Please set it in Core/config.js");
		}

		const rpcUrl = config.x402.rpcUrl || "https://api.avax-test.network/ext/bc/C/rpc";
		const provider = new ethers.JsonRpcProvider(rpcUrl);

		// Handle both mnemonic phrase and raw private key
		let wallet;
		const walletKey = config.x402.walletPrivateKey.trim();

		if (walletKey.includes(" ")) {
			console.log("🔑 Detected mnemonic phrase, converting to wallet...");
			if (!bip39.validateMnemonic(walletKey)) {
				throw new Error("Invalid mnemonic phrase");
			}
			const hdNode = ethers.HDNodeWallet.fromPhrase(walletKey);
			wallet = hdNode.connect(provider);
		} else {
			wallet = new ethers.Wallet(walletKey, provider);
		}

		console.log(`📡 Network: ${rpcUrl}`);
		console.log(`Deployer address: ${wallet.address}`);

		const balance = await provider.getBalance(wallet.address);
		console.log(`Deployer balance: ${ethers.formatEther(balance)} AVAX`);

		const network = await provider.getNetwork();
		const chainId = Number(network.chainId);
		const networkName = chainId === 43113 ? "Avalanche Fuji Testnet" : chainId === 43114 ? "Avalanche C-Chain Mainnet" : `Chain ID: ${chainId}`;
		console.log(`Network: ${networkName} (Chain ID: ${chainId})\n`);

		if (balance === 0n) {
			throw new Error("Insufficient balance. Please fund the deployer address.");
		}

		// Load Identity Registry ABI
		const identityRegistryAddress = config.erc8004.identityRegistry;
		const IDENTITY_REGISTRY_ABI = [
			"function registerAgent(address agentAddress, string memory name, string memory description, string memory agentCardURI, string[] memory capabilities) external returns (uint256)",
			"function getAgentTokenId(address agentAddress) external view returns (uint256)",
			"function isAgentRegistered(address agentAddress) external view returns (bool, bool, uint256)",
			"function getAgentIdentity(uint256 tokenId) external view returns (tuple(string name, string description, string agentCardURI, string[] capabilities, address agentAddress, uint256 createdAt, bool active))",
			"function owner() external view returns (address)",
		];

		const identityRegistry = new ethers.Contract(identityRegistryAddress, IDENTITY_REGISTRY_ABI, provider);

		// Check if we're the owner
		const owner = await identityRegistry.owner();
		console.log(`Contract owner: ${owner}`);
		console.log(`Our address: ${wallet.address}`);

		if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
			console.warn("⚠️  Warning: You are not the contract owner.");
			console.warn("   Only the contract owner can register agents.");
			console.warn("   If you need to register, the owner must call registerAgent() or transfer ownership.\n");
			// Continue anyway - maybe the contract allows other addresses
		}

		// Check if agent is already registered
		const agentAddress = wallet.address; // Use deployer address as agent address (can be changed)
		const [isRegistered, isActive, existingTokenId] = await identityRegistry.isAgentRegistered(agentAddress);

		if (isRegistered) {
			console.log(`✅ Agent is already registered!`);
			console.log(`   Token ID: ${existingTokenId}`);
			console.log(`   Active: ${isActive}`);

			const identity = await identityRegistry.getAgentTokenId(agentAddress);
			console.log(`   Current Token ID: ${identity}`);

			if (chainId === 43113) {
				console.log(`\n🔍 View agent NFT on Snowtrace:`);
				console.log(`   https://testnet.snowtrace.io/token/${identityRegistryAddress}?a=${existingTokenId}\n`);
			}

			return;
		}

		// Agent registration details
		const agentName = "Verifik AI Agent";
		const agentDescription = "AI-powered agent for identity validation and document processing using x402 payment protocol on Avalanche";
		const agentCardURI = config.erc8004.agentCardURI || "https://verifik.app/agent-card.json"; // Will create this next
		const capabilities = ["identity-validation", "document-ocr", "biometric-verification", "cedula-validation", "x402-payment-processing"];

		console.log("📝 Agent Registration Details:");
		console.log(`   Name: ${agentName}`);
		console.log(`   Description: ${agentDescription.substring(0, 60)}...`);
		console.log(`   Agent Card URI: ${agentCardURI}`);
		console.log(`   Capabilities: ${capabilities.join(", ")}`);
		console.log(`   Agent Address: ${agentAddress}\n`);

		// Connect with signer
		const identityRegistryWithSigner = identityRegistry.connect(wallet);

		console.log("🚀 Registering agent on-chain...");
		const tx = await identityRegistryWithSigner.registerAgent(agentAddress, agentName, agentDescription, agentCardURI, capabilities);

		console.log(`   Transaction hash: ${tx.hash}`);
		console.log("   Waiting for confirmation...");

		const receipt = await tx.wait();
		console.log(`   ✅ Confirmed in block: ${receipt.blockNumber}`);

		// Get the token ID from events
		const event = receipt.logs.find((log) => {
			try {
				const parsed = identityRegistry.interface.parseLog(log);
				return parsed && parsed.name === "AgentRegistered";
			} catch {
				return false;
			}
		});

		let tokenId = null;
		if (event) {
			const parsed = identityRegistry.interface.parseLog(event);
			tokenId = parsed.args.tokenId.toString();
			console.log(`   🎉 Agent registered! Token ID: ${tokenId}`);
		} else {
			// Fallback: query the contract
			tokenId = (await identityRegistry.getAgentTokenId(agentAddress)).toString();
			console.log(`   🎉 Agent registered! Token ID: ${tokenId}`);
		}

		// Get full identity
		const identity = await identityRegistry.getAgentIdentity(tokenId);
		console.log("\n📋 Agent Identity:");
		console.log(`   Token ID: ${tokenId}`);
		console.log(`   Name: ${identity.name}`);
		console.log(`   Active: ${identity.active}`);
		console.log(`   Created: ${new Date(Number(identity.createdAt) * 1000).toISOString()}`);
		console.log(`   Capabilities: ${identity.capabilities.join(", ")}`);

		// Save registration info
		const registrationInfo = {
			agentAddress: agentAddress,
			tokenId: tokenId,
			name: agentName,
			description: agentDescription,
			agentCardURI: agentCardURI,
			capabilities: capabilities,
			registeredAt: new Date().toISOString(),
			transactionHash: tx.hash,
			blockNumber: receipt.blockNumber,
		};

		const registrationPath = path.resolve(__dirname, "../erc8004-agent-registration.json");
		fs.writeFileSync(registrationPath, JSON.stringify(registrationInfo, null, 2));
		console.log("\n📄 Registration info saved to:", registrationPath);

		if (chainId === 43113) {
			console.log("\n🔍 View agent NFT on Snowtrace:");
			console.log(`   https://testnet.snowtrace.io/token/${identityRegistryAddress}?a=${tokenId}`);
			console.log(`   Transaction: https://testnet.snowtrace.io/tx/${tx.hash}\n`);
		}

		console.log("💡 Next steps:");
		console.log("   1. Create Agent Card JSON at:", agentCardURI);
		console.log("   2. Update Core/config.js with agentAddress if different");
		console.log("   3. Integrate ERC8004 into agent.module.js\n");
	} catch (error) {
		console.error("❌ Registration failed:", error.message);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	}
}

if (require.main === module) {
	registerAgent()
		.then(() => {
			console.log("✨ Done!");
			process.exit(0);
		})
		.catch((error) => {
			console.error("❌ Error:", error);
			process.exit(1);
		});
}

module.exports = { registerAgent };
