const path = require("path");
const dotenv = require("dotenv");

// Load .env.local first (has priority), then .env as fallback
const fs = require('fs');

// Load .env.local first (has priority), then .env as fallback
const envLocalPath = path.resolve(__dirname, "../../.env.local");
const envPath = path.resolve(__dirname, "../../.env");

// FORCE OVERRIDE: Manually read and parse .env.local to ensure it overwrites ANY shell environment variable
if (fs.existsSync(envLocalPath)) {
	const envLocalConfig = dotenv.parse(fs.readFileSync(envLocalPath));
	for (const k in envLocalConfig) {
		process.env[k] = envLocalConfig[k];
	}
	console.log("[Config] Loaded and FORCED overrides from .env.local");
} else {
	dotenv.config({ path: envLocalPath, override: true });
}

dotenv.config({ path: envPath });

// Debug: Log AI provider configuration
if (process.env.OPENAI_API_KEY) {
	console.log(`[Config] OPENAI_API_KEY loaded: ${process.env.OPENAI_API_KEY.substring(0, 15)}...`);
	console.log(`[Config] Using OpenAI as AI provider`);
} else if (process.env.GOOGLE_API_KEY) {
	console.log(`[Config] GOOGLE_API_KEY loaded: ${process.env.GOOGLE_API_KEY.substring(0, 10)}...`);
	console.log(`[Config] Using Gemini as AI provider`);
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
	console.log(`[Config] GOOGLE_APPLICATION_CREDENTIALS loaded`);
	console.log(`[Config] Using Gemini as AI provider`);
} else {
	console.warn(
		`[Config] WARNING: No AI credentials found. ` +
		`Set OPENAI_API_KEY or GOOGLE_API_KEY.`
	);
}

const config = {
	env: process.env.NODE_ENV || "development",
	port: process.env.PORT || 3060,
	verifik: {
		apiUrl: process.env.VERIFIK_API_URL,
		serviceToken: process.env.VERIFIK_SERVICE_TOKEN,
	},
	google: {
		// API Key is the recommended approach (simpler)
		apiKey: process.env.GOOGLE_API_KEY,
		// Service Account file path (alternative)
		keyFilePath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
	},
	openai: {
		apiKey: process.env.OPENAI_API_KEY,
	},
	x402: {
		rpcUrl: process.env.X402_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
		chainId: process.env.X402_CHAIN_ID || 43113,
		networkName: process.env.X402_NETWORK_NAME || "avalanche-fuji-testnet",
		walletPrivateKey: process.env.X402_WALLET_PRIVATE_KEY,
		contractAddress: process.env.X402_CONTRACT_ADDRESS || "0x72Fdce477bBD9f322907b3b1C4a58bC4d5D64C3a",
	},
	erc8004: {
		identityRegistry: process.env.ERC8004_IDENTITY_REGISTRY,
		reputationRegistry: process.env.ERC8004_REPUTATION_REGISTRY,
		validationRegistry: process.env.ERC8004_VALIDATION_REGISTRY,
		agentTokenId: process.env.ERC8004_AGENT_TOKEN_ID,
	},
};

module.exports = config;
