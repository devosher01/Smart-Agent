/**
 * Semantic Verifier - Embedding-based claim verification against source material.
 * @module semantic-verifier
 */

'use strict';

const { generateQueryEmbedding, cosineSimilarity } = require('../ai/embeddings');

// Type definitions

/**
 * @typedef {Object} ClaimVerificationResult
 * @property {string} claim - The extracted claim text
 * @property {boolean} isVerified - Whether claim is semantically grounded
 * @property {number} confidenceScore - Similarity score (0-1)
 * @property {string|null} matchedSource - Source that verified the claim
 * @property {string} verificationMethod - Method used for verification
 */

/**
 * @typedef {Object} SemanticVerificationReport
 * @property {ClaimVerificationResult[]} verifiedClaims - Claims that passed verification
 * @property {ClaimVerificationResult[]} unverifiedClaims - Claims that failed verification
 * @property {number} overallConfidence - Average confidence across all claims
 * @property {boolean} passesThreshold - Whether overall confidence meets minimum
 * @property {string} summary - Human-readable summary
 */

// Configuration

/**
 * Semantic verification configuration
 * @readonly
 */
const SEMANTIC_CONFIG = Object.freeze({
	// Minimum similarity score to consider a claim verified
	VERIFICATION_THRESHOLD: 0.70,

	// High confidence threshold
	HIGH_CONFIDENCE_THRESHOLD: 0.85,

	// Minimum overall confidence to pass verification
	MINIMUM_OVERALL_CONFIDENCE: 0.60,

	// Maximum claims to verify (performance limit)
	MAX_CLAIMS_TO_VERIFY: 10,

	// Cache TTL for embeddings (ms)
	EMBEDDING_CACHE_TTL: 300000, // 5 minutes
});

/**
 * Extracts verifiable claims from LLM response text.
 */
class ClaimExtractor {
	/**
	 * Claim patterns for different types of technical claims
	 * @private
	 */
	static PATTERNS = {
		// API endpoint claims
		ENDPOINT: /(?:endpoint|url|api|path|route)[\s:]+[`"']?((?:https?:\/\/)?[\/\w\-\.{}]+)[`"']?/gi,

		// Price/cost claims
		PRICE: /(?:price|cost|fee|rate|pricing)[\s:]+[`"']?\$?\s*([\d,.]+)\s*(?:USD|COP|EUR|credits?)?[`"']?/gi,

		// HTTP method claims
		METHOD: /\b(GET|POST|PUT|DELETE|PATCH)\s+[`"']?([\/\w\-\.{}]+)[`"']?/gi,

		// Parameter claims
		PARAMETER: /(?:parameter|param|field|property)[\s:]+[`"']?(\w+)[`"']?\s*(?:is|should be|must be|type)/gi,

		// Country/region claims
		COUNTRY: /(?:available|supported|works|operates)\s+(?:in|for)\s+([A-Z][a-z]+(?:\s*,\s*[A-Z][a-z]+)*)/gi,

		// Feature claims
		FEATURE: /(?:supports?|provides?|includes?|offers?)\s+([^.,\n]+(?:validation|verification|authentication|detection))/gi,

		// Response format claims
		RESPONSE: /(?:returns?|response|output)[\s:]+(?:a\s+)?[`"']?(\{[^}]+\}|\[[^\]]+\]|JSON|XML)[`"']?/gi,
	};

	/**
	 * Extract all verifiable claims from text
	 * @param {string} text - LLM response text
	 * @returns {Array<{type: string, value: string, context: string}>}
	 */
	static extractClaims(text) {
		const claims = [];
		const seen = new Set();

		for (const [type, pattern] of Object.entries(this.PATTERNS)) {
			let match;
			// Reset regex lastIndex
			pattern.lastIndex = 0;

			while ((match = pattern.exec(text)) !== null) {
				const value = match[1] || match[0];
				const key = `${type}:${value.toLowerCase()}`;

				if (!seen.has(key)) {
					seen.add(key);
					claims.push({
						type,
						value: value.trim(),
						context: this._extractContext(text, match.index, 100),
						originalMatch: match[0],
					});
				}
			}
		}

		return claims.slice(0, SEMANTIC_CONFIG.MAX_CLAIMS_TO_VERIFY);
	}

	/**
	 * Extract surrounding context for a match
	 * @private
	 */
	static _extractContext(text, position, radius) {
		const start = Math.max(0, position - radius);
		const end = Math.min(text.length, position + radius);
		return text.slice(start, end).replace(/\n+/g, ' ').trim();
	}

	/**
	 * Categorize claim by risk level
	 * @param {Object} claim - Extracted claim
	 * @returns {string} 'critical' | 'high' | 'medium' | 'low'
	 */
	static categorizeRisk(claim) {
		const riskMap = {
			ENDPOINT: 'critical',
			PRICE: 'critical',
			METHOD: 'high',
			PARAMETER: 'high',
			COUNTRY: 'medium',
			FEATURE: 'medium',
			RESPONSE: 'low',
		};
		return riskMap[claim.type] || 'medium';
	}
}

/**
 * LRU Cache for embedding vectors to avoid redundant API calls.
 */
class EmbeddingCache {
	constructor(maxSize = 100, ttl = SEMANTIC_CONFIG.EMBEDDING_CACHE_TTL) {
		this.cache = new Map();
		this.maxSize = maxSize;
		this.ttl = ttl;
	}

	/**
	 * Get cached embedding or null
	 * @param {string} key - Cache key (text hash)
	 * @returns {number[]|null}
	 */
	get(key) {
		const entry = this.cache.get(key);
		if (!entry) return null;

		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return null;
		}

		// Move to end (LRU)
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.embedding;
	}

	/**
	 * Store embedding in cache
	 * @param {string} key - Cache key
	 * @param {number[]} embedding - Embedding vector
	 */
	set(key, embedding) {
		// Evict oldest if at capacity
		if (this.cache.size >= this.maxSize) {
			const oldestKey = this.cache.keys().next().value;
			this.cache.delete(oldestKey);
		}

		this.cache.set(key, {
			embedding,
			expiresAt: Date.now() + this.ttl,
		});
	}

	/**
	 * Generate cache key from text
	 * @param {string} text - Text to hash
	 * @returns {string}
	 */
	static generateKey(text) {
		// Simple hash for cache key
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			const char = text.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return `emb_${hash}`;
	}

	/**
	 * Clear all cached embeddings
	 */
	clear() {
		this.cache.clear();
	}

	/**
	 * Get cache statistics
	 * @returns {Object}
	 */
	getStats() {
		return {
			size: this.cache.size,
			maxSize: this.maxSize,
			utilizationPercent: Math.round((this.cache.size / this.maxSize) * 100),
		};
	}
}

/**
 * Main semantic verification engine using embeddings.
 */
class SemanticVerifier {
	/**
	 * @param {Object} options - Configuration options
	 */
	constructor(options = {}) {
		this.config = { ...SEMANTIC_CONFIG, ...options };
		this.embeddingCache = new EmbeddingCache();
		this.verificationStats = {
			totalVerifications: 0,
			successfulVerifications: 0,
			failedVerifications: 0,
		};
	}

	/**
	 * Verify all claims in a response against source material
	 * @param {string} response - LLM generated response
	 * @param {Array} sources - Source chunks with content
	 * @returns {Promise<SemanticVerificationReport>}
	 */
	async verifyResponse(response, sources) {
		// Extract claims from response
		const claims = ClaimExtractor.extractClaims(response);

		if (claims.length === 0) {
			return this._createEmptyReport();
		}

		// Build source content index for verification
		const sourceContent = this._buildSourceContent(sources);

		// Verify each claim
		const results = await Promise.all(
			claims.map(claim => this._verifyClaim(claim, sourceContent, sources))
		);

		// Separate verified and unverified
		const verifiedClaims = results.filter(r => r.isVerified);
		const unverifiedClaims = results.filter(r => !r.isVerified);

		// Calculate overall confidence
		const overallConfidence = this._calculateOverallConfidence(results);

		// Update stats
		this.verificationStats.totalVerifications++;
		if (overallConfidence >= this.config.MINIMUM_OVERALL_CONFIDENCE) {
			this.verificationStats.successfulVerifications++;
		} else {
			this.verificationStats.failedVerifications++;
		}

		return {
			verifiedClaims,
			unverifiedClaims,
			overallConfidence,
			passesThreshold: overallConfidence >= this.config.MINIMUM_OVERALL_CONFIDENCE,
			totalClaims: claims.length,
			verificationRate: claims.length > 0
				? Math.round((verifiedClaims.length / claims.length) * 100)
				: 100,
			summary: this._generateSummary(verifiedClaims, unverifiedClaims, overallConfidence),
		};
	}

	/**
	 * Verify a single claim against source content
	 * @private
	 * @param {Object} claim - Extracted claim
	 * @param {string} sourceContent - Combined source content
	 * @param {Array} sources - Original source objects
	 * @returns {Promise<ClaimVerificationResult>}
	 */
	async _verifyClaim(claim, sourceContent, sources) {
		try {
			// Generate embedding for the claim context
			const claimText = `${claim.type}: ${claim.value}. Context: ${claim.context}`;
			const claimEmbedding = await this._getEmbedding(claimText);

			// Find best matching source
			let bestScore = 0;
			let matchedSource = null;

			for (const source of sources) {
				if (!source.chunk?.content) continue;

				const sourceEmbedding = await this._getEmbedding(source.chunk.content.substring(0, 500));
				const similarity = cosineSimilarity(claimEmbedding, sourceEmbedding);

				if (similarity > bestScore) {
					bestScore = similarity;
					matchedSource = source.chunk.source || source.chunk.title;
				}
			}

			// Also check if claim value appears literally in sources
			const literalMatch = this._checkLiteralMatch(claim.value, sourceContent);
			if (literalMatch) {
				bestScore = Math.max(bestScore, 0.95); // Boost score for literal matches
			}

			const isVerified = bestScore >= this.config.VERIFICATION_THRESHOLD;
			const riskLevel = ClaimExtractor.categorizeRisk(claim);

			return {
				claim: claim.value,
				claimType: claim.type,
				context: claim.context,
				isVerified,
				confidenceScore: Math.round(bestScore * 100) / 100,
				matchedSource: isVerified ? matchedSource : null,
				verificationMethod: literalMatch ? 'literal_match' : 'semantic_similarity',
				riskLevel,
			};
		} catch (error) {
			console.error(`[SemanticVerifier] Error verifying claim: ${error.message}`);
			return {
				claim: claim.value,
				claimType: claim.type,
				context: claim.context,
				isVerified: false,
				confidenceScore: 0,
				matchedSource: null,
				verificationMethod: 'error',
				riskLevel: ClaimExtractor.categorizeRisk(claim),
				error: error.message,
			};
		}
	}

	/**
	 * Get embedding with caching
	 * @private
	 */
	async _getEmbedding(text) {
		const cacheKey = EmbeddingCache.generateKey(text);
		let embedding = this.embeddingCache.get(cacheKey);

		if (!embedding) {
			embedding = await generateQueryEmbedding(text);
			this.embeddingCache.set(cacheKey, embedding);
		}

		return embedding;
	}

	/**
	 * Build combined source content for matching
	 * @private
	 */
	_buildSourceContent(sources) {
		return sources
			.map(s => s.chunk?.content || '')
			.join('\n\n')
			.toLowerCase();
	}

	/**
	 * Check if claim value appears literally in sources
	 * @private
	 */
	_checkLiteralMatch(value, sourceContent) {
		const normalizedValue = value.toLowerCase().trim();
		return sourceContent.includes(normalizedValue);
	}

	/**
	 * Calculate weighted overall confidence
	 * @private
	 */
	_calculateOverallConfidence(results) {
		if (results.length === 0) return 1;

		// Weight by risk level
		const weights = { critical: 3, high: 2, medium: 1, low: 0.5 };
		let weightedSum = 0;
		let totalWeight = 0;

		for (const result of results) {
			const weight = weights[result.riskLevel] || 1;
			weightedSum += result.confidenceScore * weight;
			totalWeight += weight;
		}

		return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 0;
	}

	/**
	 * Generate human-readable summary
	 * @private
	 */
	_generateSummary(verified, unverified, confidence) {
		if (unverified.length === 0) {
			return `All ${verified.length} claims verified with ${Math.round(confidence * 100)}% confidence.`;
		}

		const criticalUnverified = unverified.filter(c => c.riskLevel === 'critical');

		if (criticalUnverified.length > 0) {
			return `⚠️ CRITICAL: ${criticalUnverified.length} high-risk claims could not be verified. ` +
				`Overall confidence: ${Math.round(confidence * 100)}%.`;
		}

		return `${verified.length}/${verified.length + unverified.length} claims verified. ` +
			`${unverified.length} unverified claims detected. Confidence: ${Math.round(confidence * 100)}%.`;
	}

	/**
	 * Create empty report for responses with no extractable claims
	 * @private
	 */
	_createEmptyReport() {
		return {
			verifiedClaims: [],
			unverifiedClaims: [],
			overallConfidence: 1,
			passesThreshold: true,
			totalClaims: 0,
			verificationRate: 100,
			summary: 'No verifiable technical claims extracted from response.',
		};
	}

	/**
	 * Get verification statistics
	 * @returns {Object}
	 */
	getStats() {
		return {
			...this.verificationStats,
			successRate: this.verificationStats.totalVerifications > 0
				? Math.round((this.verificationStats.successfulVerifications /
					this.verificationStats.totalVerifications) * 100)
				: 0,
			cacheStats: this.embeddingCache.getStats(),
		};
	}

	/**
	 * Reset verification statistics
	 */
	resetStats() {
		this.verificationStats = {
			totalVerifications: 0,
			successfulVerifications: 0,
			failedVerifications: 0,
		};
		this.embeddingCache.clear();
	}
}

module.exports = {
	SemanticVerifier,
	ClaimExtractor,
	EmbeddingCache,
	SEMANTIC_CONFIG,
};
