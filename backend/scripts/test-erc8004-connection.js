const { ethers } = require("ethers");
const config = require("../src/config");

async function testERC8004Connection() {
	console.log("🔍 Testing ERC8004 Connection...\n");

	const rpcUrl = config.x402?.rpcUrl || "https://api.avax-test.network/ext/bc/C/rpc";
	console.log(`📡 RPC URL: ${rpcUrl}`);

	const provider = new ethers.JsonRpcProvider(rpcUrl);

	// Test RPC connection
	try {
		const blockNumber = await provider.getBlockNumber();
		console.log(`✅ RPC Connection: OK (Block: ${blockNumber})\n`);
	} catch (error) {
		console.error(`❌ RPC Connection Failed: ${error.message}`);
		return;
	}

	// Test contract addresses
	const identityAddress = config.erc8004?.identityRegistry;
	const reputationAddress = config.erc8004?.reputationRegistry;
	const validationAddress = config.erc8004?.validationRegistry;
	const agentTokenId = config.erc8004?.agentTokenId;

	console.log(`📋 Configuration:`);
	console.log(`   Identity Registry: ${identityAddress}`);
	console.log(`   Reputation Registry: ${reputationAddress}`);
	console.log(`   Validation Registry: ${validationAddress}`);
	console.log(`   Agent Token ID: ${agentTokenId}\n`);

	if (!identityAddress || !reputationAddress || !validationAddress) {
		console.error("❌ Contract addresses not configured");
		return;
	}

	// Test Identity Registry
	const IDENTITY_ABI = [
		"function getAgentIdentity(uint256 tokenId) external view returns (tuple(string name, string description, string agentCardURI, string[] capabilities, address agentAddress, uint256 createdAt, bool active))",
		"function isAgentRegistered(address agentAddress) external view returns (bool, bool, uint256)",
	];

	try {
		const identityContract = new ethers.Contract(identityAddress, IDENTITY_ABI, provider);

		// Check if contract exists
		const code = await provider.getCode(identityAddress);
		if (code === "0x") {
			console.error(`❌ Identity Registry contract not found at ${identityAddress}`);
			return;
		}
		console.log(`✅ Identity Registry: Contract found\n`);

		// Try to get agent identity
		if (agentTokenId) {
			try {
				const identity = await identityContract.getAgentIdentity(parseInt(agentTokenId));
				console.log(`✅ Agent Identity Retrieved:`);
				console.log(`   Name: ${identity.name}`);
				console.log(`   Description: ${identity.description}`);
				console.log(`   Active: ${identity.active}`);
				console.log(`   Agent Address: ${identity.agentAddress}`);
				console.log(`   Capabilities: ${identity.capabilities.join(", ")}\n`);
			} catch (error) {
				console.error(`❌ Failed to get agent identity: ${error.message}`);
				console.error(`   Token ID: ${agentTokenId}`);
				console.error(`   This might mean the agent is not registered with this token ID\n`);
			}
		}

		// Check agent registration by address
		const agentAddress = config.erc8004?.agentAddress;
		if (agentAddress) {
			try {
				const [isRegistered, isActive, tokenId] = await identityContract.isAgentRegistered(agentAddress);
				console.log(`📝 Agent Registration Status:`);
				console.log(`   Address: ${agentAddress}`);
				console.log(`   Registered: ${isRegistered}`);
				console.log(`   Active: ${isActive}`);
				console.log(`   Token ID: ${tokenId.toString()}\n`);
			} catch (error) {
				console.error(`❌ Failed to check agent registration: ${error.message}\n`);
			}
		}
	} catch (error) {
		console.error(`❌ Identity Registry Error: ${error.message}`);
	}

	// Test Reputation Registry
	const REPUTATION_ABI = ["function getReputationSummary(uint256 agentTokenId) external view returns (uint256, uint256, uint256)"];

	try {
		const reputationContract = new ethers.Contract(reputationAddress, REPUTATION_ABI, provider);
		const code = await provider.getCode(reputationAddress);
		if (code === "0x") {
			console.error(`❌ Reputation Registry contract not found at ${reputationAddress}`);
		} else {
			console.log(`✅ Reputation Registry: Contract found`);

			if (agentTokenId) {
				try {
					const [totalFeedbacks, verifiedFeedbacks, totalRatings] = await reputationContract.getReputationSummary(parseInt(agentTokenId));
					console.log(`   Total Feedbacks: ${totalFeedbacks.toString()}`);
					console.log(`   Verified Feedbacks: ${verifiedFeedbacks.toString()}`);
					console.log(`   Total Ratings: ${totalRatings.toString()}\n`);
				} catch (error) {
					console.error(`   Failed to get reputation: ${error.message}\n`);
				}
			}
		}
	} catch (error) {
		console.error(`❌ Reputation Registry Error: ${error.message}`);
	}
}

testERC8004Connection().catch(console.error);
