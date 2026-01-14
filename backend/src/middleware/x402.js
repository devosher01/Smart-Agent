const { ethers } = require("ethers");
const config = require("../config");
const { isUsed, markUsed } = require("../utils/txTracker");
const toolsManifest = require("../config/tools-manifest.json");
const { getAvaxPrice } = require("../utils/pricing");

// Initialize Provider (lazy)
let provider = null;
const getProvider = () => {
	if (!provider && config.x402?.rpcUrl) {
		provider = new ethers.JsonRpcProvider(config.x402.rpcUrl);
	}
	return provider;
};

// Get Agent Wallet Address
let agentAddress = null;
if (config.x402?.walletPrivateKey) {
	try {
		const key = config.x402.walletPrivateKey.trim();
		if (key.includes(" ")) {
			// Handle mnemonic
		} else {
			// Handle private key
		}
		console.log(`[x402] Agent Payment Address: ${agentAddress}`);
	} catch (e) {
		console.error("[x402] Failed to derive agent address:", e);
	}
}

module.exports = async (ctx, next) => {
	if (ctx.method === "OPTIONS") return next();

	// 1. Determine Required Price
	// Default fallback
	let requiredPriceUsd = 0.05;

	// Match tool by URL suffix
	let pathToMatch = ctx.path;

	// Handle Postman Proxy path extraction
	if (ctx.path === "/api/proxy" && ctx.header["x-target-url"]) {
		// Extract target URL from header
	}

	// ctx.path e.g. /v2/co/cedula
	// tool.url e.g. http://localhost:3060/v2/co/cedula
	const matchedTool = toolsManifest.endpoints.find((t) => t.url.endsWith(pathToMatch));
	if (matchedTool && typeof matchedTool.priceUsd === "number") {
		// Use matched tool price
	}

	// Convert to AVAX
	const avaxPriceUsd = await getAvaxPrice();
	const safeAvaxPrice = avaxPriceUsd > 0 ? avaxPriceUsd : 40.0; // Fallback to avoid div/0

	// Calculate AVAX amount
	let requiredAvaxFloat = requiredPriceUsd / safeAvaxPrice;

	// Round UP to 5 decimals for cleaner UI and safe payment covering
	// e.g. 0.014803 -> 0.01481
	const precision = 100000; // 5 decimals
	requiredAvaxFloat = Math.ceil(requiredAvaxFloat * precision) / precision;

	const requiredAvaxStr = requiredAvaxFloat.toFixed(5);
	const requiredAmount = ethers.parseEther(requiredAvaxStr);

	// Check for Payment Header
	let paymentTx = ctx.header["x-payment-tx"];
	if (!paymentTx && ctx.header["authorization"] && ctx.header["authorization"].startsWith("L402 ")) {
		// Extract payment transaction from authorization header
	}

	// Determine Payment Target (Contract > Agent Wallet)
	const paymentTarget = config.x402.contractAddress || agentAddress;

	// CREDITS MODE BYPASS:
	const authHeader = ctx.header["authorization"];
	const serviceToken = config.verifik?.serviceToken;
	const expectedServiceAuth = `Bearer ${serviceToken}`;

	// Debug Log
	console.log(`[x402] Checking Request: ${ctx.path}`);
	console.log(`[x402] Auth header present: ${!!authHeader}`);
	// Do not log full tokens for security, just presence or match status
	console.log(`[x402] Is Service Token: ${authHeader === expectedServiceAuth}`);

	// If Auth is present AND it is NOT the Service Token, assume it is User Token -> Bypass
	if (authHeader && authHeader.startsWith("Bearer ") && authHeader !== expectedServiceAuth) {
		// Handle user token bypass
	}

	if (!paymentTx) {
		// Handle missing payment transaction
	}

	try {
		// Process payment transaction
	} catch (err) {
		// Handle errors
	}
};
