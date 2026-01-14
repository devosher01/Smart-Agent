/**
 * RAG Validation Module - Multi-stage hallucination detection pipeline.
 * @module rag-validator
 */

'use strict';

const {
	GroundednessLevel,
	ValidationStatus,
	HallucinationType,
	GROUNDEDNESS_THRESHOLDS,
	SOURCE_COUNT_REQUIREMENTS,
	SCORE_ADJUSTMENTS,
	HALLUCINATION_PATTERNS,
	WARNING_MESSAGES,
	DEFAULT_CONFIG,
} = require('./constants');

/**
 * @typedef {Object} RAGSource
 * @property {string} chunkId - Unique identifier for the source chunk
 * @property {string} title - Title of the documentation section
 * @property {string} source - File path or URL of the source
 * @property {number} score - Relevance score (0-1)
 * @property {string} [endpoint] - API endpoint if applicable
 * @property {string} [method] - HTTP method if applicable
 * @property {number} [price] - Price if mentioned in source
 */

/**
 * @typedef {Object} HallucinationDetection
 * @property {string} type - Type of hallucination from HallucinationType enum
 * @property {string} detected - The fabricated value that was detected
 * @property {string} context - Surrounding context where hallucination was found
 * @property {string} [expected] - What the correct value should be (if known)
 * @property {number} severity - Severity score (0-1)
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isGrounded - Whether response is adequately grounded
 * @property {string[]} warnings - Warning messages for the user
 * @property {HallucinationDetection[]} detectedHallucinations - List of detected fabrications
 * @property {ValidationStatus} status - Overall validation status
 */

/**
 * @typedef {Object} RAGMetadata
 * @property {RAGSource[]} sources - Array of source documents used
 * @property {string} groundedness - Groundedness level (high/medium/low/ungrounded)
 * @property {number} avgScore - Average relevance score across sources
 * @property {ValidationResult} validationResult - Detailed validation results
 * @property {string} retrievedAt - ISO timestamp of retrieval
 * @property {number} totalSourcesConsidered - Total sources before filtering
 */

/**
 * Calculates groundedness level based on source quality and quantity.
 */
class GroundednessCalculator {
	/**
	 * @param {Object} config - Configuration options
	 */
	constructor(config = DEFAULT_CONFIG) {
		this.config = config;
	}

	/**
	 * Calculate groundedness level from source scores
	 * @param {RAGSource[]} sources - Retrieved sources
	 * @returns {{ level: string, avgScore: number, confidence: number }}
	 */
	calculate(sources) {
		if (!sources || sources.length === 0) {
			return {
				level: GroundednessLevel.UNGROUNDED,
				avgScore: 0,
				confidence: 0,
			};
		}

		// Calculate weighted average score
		const avgScore = this._calculateWeightedAverage(sources);

		// Apply adjustments based on source count
		const adjustedScore = this._applySourceCountAdjustment(avgScore, sources.length);

		// Determine groundedness level
		const level = this._determineLevel(adjustedScore, sources.length);

		// Calculate overall confidence (0-100)
		const confidence = Math.round(adjustedScore * 100);

		return { level, avgScore: adjustedScore, confidence };
	}

	/**
	 * Calculate weighted average giving more weight to higher scores
	 * @private
	 */
	_calculateWeightedAverage(sources) {
		if (sources.length === 0) return 0;

		// Use quadratic weighting to emphasize high-quality sources
		const weights = sources.map(s => s.score * s.score);
		const totalWeight = weights.reduce((sum, w) => sum + w, 0);

		if (totalWeight === 0) return 0;

		const weightedSum = sources.reduce((sum, s, i) => sum + (s.score * weights[i]), 0);
		return weightedSum / totalWeight;
	}

	/**
	 * Apply adjustments based on number of sources
	 * @private
	 */
	_applySourceCountAdjustment(score, sourceCount) {
		let adjusted = score;

		if (sourceCount < SOURCE_COUNT_REQUIREMENTS.MINIMUM_FOR_HIGH) {
			adjusted += SCORE_ADJUSTMENTS.LOW_SOURCE_PENALTY;
		}

		return Math.max(0, Math.min(1, adjusted));
	}

	/**
	 * Determine groundedness level from score and source count
	 * @private
	 */
	_determineLevel(score, sourceCount) {
		// Must have minimum sources for high confidence
		if (score >= GROUNDEDNESS_THRESHOLDS.HIGH &&
			sourceCount >= SOURCE_COUNT_REQUIREMENTS.MINIMUM_FOR_HIGH) {
			return GroundednessLevel.HIGH;
		}

		if (score >= GROUNDEDNESS_THRESHOLDS.MEDIUM) {
			return GroundednessLevel.MEDIUM;
		}

		if (score >= GROUNDEDNESS_THRESHOLDS.LOW) {
			return GroundednessLevel.LOW;
		}

		return GroundednessLevel.UNGROUNDED;
	}
}

/**
 * Detects potential hallucinations in LLM responses via pattern matching.
 */
class HallucinationDetector {
	/**
	 * @param {RAGSource[]} sources - Known valid sources for comparison
	 * @param {Object} config - Configuration options
	 */
	constructor(sources = [], config = DEFAULT_CONFIG) {
		this.sources = sources;
		this.config = config;
		this._buildKnowledgeBase();
	}

	/**
	 * Build knowledge base from sources for validation
	 * @private
	 */
	_buildKnowledgeBase() {
		this.knownEndpoints = new Set();
		this.knownPrices = new Map();
		this.knownParameters = new Set();
		this.knownMethods = new Map();
		this.knownCountries = new Set();

		for (const source of this.sources) {
			if (!source.chunk) continue;

			const chunk = source.chunk;

			// Extract endpoints
			if (chunk.endpoint) {
				this.knownEndpoints.add(this._normalizeEndpoint(chunk.endpoint));
			}

			// Extract prices
			if (chunk.price) {
				this.knownPrices.set(chunk.endpoint || chunk.title, chunk.price);
			}

			// Extract parameters
			if (chunk.parameters && Array.isArray(chunk.parameters)) {
				chunk.parameters.forEach(p => {
					const paramName = typeof p === 'string' ? p : p.name;
					if (paramName) this.knownParameters.add(paramName.toLowerCase());
				});
			}

			// Extract HTTP methods
			if (chunk.method) {
				this.knownMethods.set(chunk.endpoint || chunk.title, chunk.method.toUpperCase());
			}

			// Extract countries from content
			if (chunk.country) {
				this.knownCountries.add(chunk.country.toLowerCase());
			}

			// Parse content for additional endpoints and prices
			this._extractFromContent(chunk.content);
		}
	}

	/**
	 * Detect hallucinations in the response
	 * @param {string} response - LLM generated response
	 * @returns {HallucinationDetection[]} List of detected hallucinations
	 */
	detect(response) {
		const hallucinations = [];

		// 1. Check for fabricated endpoints in the response
		const endpointMatches = response.matchAll(HALLUCINATION_PATTERNS.ENDPOINT_PATTERN);
		for (const match of endpointMatches) {
			const detectedEndpoint = this._normalizeEndpoint(match[1]);
			// Use strict filtering: must be in knownEndpoints or very generic
			if (detectedEndpoint.length > 5 && !this.knownEndpoints.has(detectedEndpoint)) {
				hallucinations.push({
					type: HallucinationType.FABRICATED_ENDPOINT,
					detected: match[1],
					context: this._extractContext(response, match.index, 30),
					severity: 1.0,
				});
			}
		}

		// 2. Check for fabricated prices
		const priceMatches = response.matchAll(HALLUCINATION_PATTERNS.PRICE_PATTERN);
		for (const match of priceMatches) {
			const detectedPrice = parseFloat(match[1]);
			let found = false;
			for (const knownPrice of this.knownPrices.values()) {
				if (Math.abs(knownPrice - detectedPrice) < 0.01) {
					found = true;
					break;
				}
			}

			if (!found) {
				hallucinations.push({
					type: HallucinationType.FABRICATED_PRICE,
					detected: `$${detectedPrice}`,
					context: this._extractContext(response, match.index, 20),
					severity: 0.8,
				});
			}
		}

		// 3. Check for unsupported countries
		const countryHallucinations = this._detectUnsupportedCountries(response);
		hallucinations.push(...countryHallucinations);

		return hallucinations;
	}
	/**
	 * Normalize endpoint for comparison
	 * @private
	 */
	_normalizeEndpoint(endpoint) {
		if (!endpoint) return '';
		return endpoint
			.toLowerCase()
			.replace(/^https?:\/\/[^/]+/, '')
			.replace(/\{[^}]+\}/g, '{param}')
			.replace(/\/+$/, '');
	}

	/**
	 * Detect claims about unsupported countries
	 * @private
	 */
	_detectUnsupportedCountries(response) {
		const hallucinations = [];
		// Expanded pattern to catch table cells and lists
		// e.g. "| Argentina |", "Argentina:", "available in Argentina"
		const countryNames = [
			"argentina", "bolivia", "brazil", "brasil", "chile", "colombia",
			"costa rica", "dominican republic", "ecuador", "el salvador",
			"guatemala", "honduras", "mexico", "panama", "paraguay", "peru",
			"uruguay", "venezuela", "united states", "usa", "spain", "global"
		];

		const lowerResponse = response.toLowerCase();

		for (const country of countryNames) {
			// Check if country mentioned in response
			if (lowerResponse.includes(country)) {
				// If we have known countries from ANY source, and this country is NOT one of them
				// Then it is a hallucination (claiming support where none exists in context)
				if (this.knownCountries.size > 0 && !this.knownCountries.has(country)) {
					hallucinations.push({
						type: HallucinationType.UNSUPPORTED_COUNTRY,
						detected: country,
						context: `Reference to ${country} found in response but not in source chunks`,
						severity: 0.9, // High severity
					});
				}
			}
		}

		return hallucinations;
	}

	/**
	 * Extract additional knowledge from content text
	 * @private
	 */
	_extractFromContent(content) {
		if (!content) return;

		// Extract endpoint patterns from content
		const endpointMatches = content.matchAll(/(?:\/v\d+\/[\w\-/]+|\/api\/[\w\-/]+)/g);
		for (const match of endpointMatches) {
			this.knownEndpoints.add(this._normalizeEndpoint(match[0]));
		}

		// Extract price patterns from content
		const priceMatches = content.matchAll(/\$\s*([\d,.]+)\s*(?:USD|COP)?/gi);
		for (const match of priceMatches) {
			const price = parseFloat(match[1].replace(/,/g, ''));
			if (!isNaN(price)) {
				this.knownPrices.set(`content_price_${price}`, price);
			}
		}

		// Extract countries from content
		this._scanForCountries(content);
	}

	/**
	 * Scan content for known LATAM/Global countries
	 * @private
	 */
	_scanForCountries(content) {
		const countryNames = [
			"argentina", "bolivia", "brazil", "brasil", "chile", "colombia",
			"costa rica", "dominican republic", "ecuador", "el salvador",
			"guatemala", "honduras", "mexico", "panama", "paraguay", "peru",
			"uruguay", "venezuela", "united states", "usa", "spain", "global"
		];

		const lowerContent = content.toLowerCase();
		for (const country of countryNames) {
			if (lowerContent.includes(country)) {
				this.knownCountries.add(country);
			}
		}
	}

	/**
	 * Extract surrounding context for a match
	 * @private
	 */
	_extractContext(text, position, radius) {
		const start = Math.max(0, position - radius);
		const end = Math.min(text.length, position + radius);
		return text.slice(start, end).replace(/\n/g, ' ').trim();
	}
}

/**
 * Tracks and formats source information for response metadata.
 */
class SourceTracker {
	/**
	 * @param {Array} rawResults - Raw search results from RAG
	 * @param {Object} config - Configuration options
	 */
	constructor(rawResults = [], config = DEFAULT_CONFIG) {
		this.config = config;
		this.sources = this._processSources(rawResults);
		this.totalConsidered = rawResults.length;
	}

	/**
	 * Process raw results into standardized source format
	 * @private
	 */
	_processSources(rawResults) {
		const baseUrl = 'https://docs.verifik.co';
		const uniqueSources = new Map();

		rawResults
			.filter(r => r.score >= this.config.minScoreThreshold)
			.forEach(r => {
				let url = null;
				if (r.chunk?.slug) {
					// Use slug if available (e.g., from Docusaurus)
					url = `${baseUrl}${r.chunk.slug.startsWith('/') ? '' : '/'}${r.chunk.slug}`;
				} else if (r.chunk?.source) {
					// Fallback: docs/folder/file.md -> folder/file
					const cleanPath = r.chunk.source
						.replace(/^docs\//, '')
						.replace(/\.mdx?$/, '');
					url = `${baseUrl}/${cleanPath}`;
				}

				// Generate unique key: Prefer URL, fallback to Title
				// Normalize title to catch "Airdrop Rules" vs "Reglas de Airdrop" if they map to same content (harder without url match, but we rely on URL mainly)
				const key = url || r.chunk?.title || 'unknown';

				// If source already exists, keep the one with higher score
				if (!uniqueSources.has(key) || r.score > uniqueSources.get(key).score) {
					// Clean up title: remove "undefined - " prefix if present
					let cleanTitle = r.chunk?.title || 'Untitled';
					if (cleanTitle.startsWith('undefined - ')) {
						cleanTitle = cleanTitle.replace('undefined - ', '');
					}
					// If title is still empty or just 'Intro', use source filename
					if (!cleanTitle || cleanTitle === 'Intro') {
						const source = r.chunk?.source || '';
						const filename = source.split('/').pop()?.replace(/\.mdx?$/, '') || 'Document';
						cleanTitle = filename.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); // Format nicely
					}

					// Generate anchor from section title for direct linking
					// Extract just the section heading (part after " - ") for anchor
					let anchor = '';
					let sectionHeading = cleanTitle;

					// If title has format "Document - Section", extract just "Section"
					if (sectionHeading.includes(' - ')) {
						sectionHeading = sectionHeading.split(' - ').pop() || '';
					}

					// Skip generic sections that likely don't have anchors
					const skipAnchors = ['Intro', 'Response', 'Endpoint', 'Parameters', 'Examples', 'Notes', 'Authentication'];
					const shouldSkipAnchor = skipAnchors.some(skip =>
						sectionHeading === skip || sectionHeading.toLowerCase() === skip.toLowerCase()
					);

					if (sectionHeading && !shouldSkipAnchor) {
						// Convert "**II. Eligibility**" -> "ii-eligibility"
						anchor = sectionHeading
							.toLowerCase()
							.replace(/\*\*/g, '') // Remove markdown bold
							.replace(/[^\w\s-]/g, '') // Remove special chars except hyphens
							.replace(/\s+/g, '-') // Spaces to hyphens
							.replace(/--+/g, '-') // Collapse multiple hyphens
							.replace(/^-|-$/g, ''); // Trim hyphens from ends
					}

					// Append anchor to URL if we have one
					let finalUrl = url;
					if (finalUrl && anchor) {
						finalUrl = `${url}#${anchor}`;
					}

					uniqueSources.set(key, {
						chunkId: r.id || r.chunk?.id || 'unknown',
						title: cleanTitle,
						source: r.chunk?.source || 'unknown',
						url: finalUrl,
						score: Math.round(r.score * 100) / 100,
						endpoint: r.chunk?.endpoint || null,
						method: r.chunk?.method || null,
						price: r.chunk?.price || null,
					});
				}
			});

		return Array.from(uniqueSources.values())
			.sort((a, b) => b.score - a.score); // Re-sort by score
	}

	/**
	 * Get formatted sources for response
	 * @returns {RAGSource[]}
	 */
	getSources() {
		return this.sources;
	}

	/**
	 * Get total sources considered before filtering
	 * @returns {number}
	 */
	getTotalConsidered() {
		return this.totalConsidered;
	}

	/**
	 * Check if sufficient sources are available
	 * @returns {boolean}
	 */
	hasSufficientSources() {
		return this.sources.length >= SOURCE_COUNT_REQUIREMENTS.MINIMUM_FOR_RESPONSE;
	}
}

/**
 * Main RAG Validator - Facade combining all validation components.
 */
class RAGValidator {
	/**
	 * @param {Object} config - Configuration options
	 */
	constructor(config = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Process RAG results and generate comprehensive metadata
	 * @param {Array} rawResults - Raw search results from RAG module
	 * @returns {RAGMetadata}
	 */
	processResults(rawResults) {
		// Initialize components
		const sourceTracker = new SourceTracker(rawResults, this.config);
		const groundednessCalculator = new GroundednessCalculator(this.config);

		// Calculate groundedness
		const sources = sourceTracker.getSources();
		const { level, avgScore, confidence } = groundednessCalculator.calculate(sources);

		// Generate warnings based on results
		const warnings = this._generateWarnings(sources, level);

		return {
			sources,
			groundedness: level,
			avgScore: Math.round(avgScore * 100),
			confidence,
			validationResult: {
				isGrounded: level !== GroundednessLevel.UNGROUNDED,
				warnings,
				detectedHallucinations: [],
				status: this._determineStatus(level, []),
			},
			retrievedAt: new Date().toISOString(),
			totalSourcesConsidered: sourceTracker.getTotalConsidered(),
		};
	}

	/**
	 * Validate LLM response against source material (post-generation)
	 * @param {string} response - LLM generated response
	 * @param {Array} rawResults - Raw search results used for context
	 * @returns {ValidationResult}
	 */
	validateResponse(response, rawResults) {
		if (!this.config.enablePostGenerationValidation) {
			return {
				isGrounded: true,
				warnings: [],
				detectedHallucinations: [],
				status: ValidationStatus.VALID,
			};
		}

		// Initialize hallucination detector with source knowledge
		const detector = new HallucinationDetector(rawResults, this.config);
		const hallucinations = detector.detect(response);

		// Generate warnings
		const warnings = [];
		if (hallucinations.length > 0) {
			warnings.push(WARNING_MESSAGES.POTENTIAL_HALLUCINATION);
			warnings.push(`Detected ${hallucinations.length} potential fabrication(s) in response.`);
		}

		// Determine if response is grounded
		const highSeverityCount = hallucinations.filter(h => h.severity >= 0.7).length;
		const isGrounded = highSeverityCount === 0;

		return {
			isGrounded,
			warnings,
			detectedHallucinations: hallucinations,
			status: this._determineStatus(
				isGrounded ? GroundednessLevel.MEDIUM : GroundednessLevel.LOW,
				hallucinations
			),
		};
	}

	/**
	 * Full validation pipeline: process results + validate response
	 * @param {Array} rawResults - Raw search results
	 * @param {string} response - LLM generated response
	 * @returns {RAGMetadata}
	 */
	fullValidation(rawResults, response) {
		// First, process the source results
		const metadata = this.processResults(rawResults);

		// Then validate the response
		const responseValidation = this.validateResponse(response, rawResults);

		// Merge validation results
		metadata.validationResult = {
			...metadata.validationResult,
			detectedHallucinations: responseValidation.detectedHallucinations,
			warnings: [
				...metadata.validationResult.warnings,
				...responseValidation.warnings,
			],
			status: responseValidation.status,
		};

		// Adjust groundedness if hallucinations were detected
		if (responseValidation.detectedHallucinations.length > 0) {
			metadata.groundedness = this._adjustGroundednessForHallucinations(
				metadata.groundedness,
				responseValidation.detectedHallucinations
			);
		}

		return metadata;
	}

	/**
	 * Generate warnings based on source quality
	 * @private
	 */
	_generateWarnings(sources, level) {
		const warnings = [];

		if (sources.length === 0) {
			warnings.push(WARNING_MESSAGES.NO_SOURCES);
		} else if (sources.length === 1) {
			warnings.push(WARNING_MESSAGES.SINGLE_SOURCE);
		}

		if (level === GroundednessLevel.LOW || level === GroundednessLevel.UNGROUNDED) {
			warnings.push(WARNING_MESSAGES.LOW_CONFIDENCE);
		}

		return warnings;
	}

	/**
	 * Determine overall validation status
	 * @private
	 */
	_determineStatus(groundedness, hallucinations) {
		if (groundedness === GroundednessLevel.UNGROUNDED) {
			return ValidationStatus.INVALID;
		}

		if (hallucinations.length > 0) {
			const highSeverity = hallucinations.filter(h => h.severity >= 0.7);
			if (highSeverity.length > 0) {
				return this.config.strictMode ? ValidationStatus.INVALID : ValidationStatus.WARNING;
			}
			return ValidationStatus.WARNING;
		}

		if (groundedness === GroundednessLevel.LOW) {
			return ValidationStatus.WARNING;
		}

		return ValidationStatus.VALID;
	}

	/**
	 * Adjust groundedness level when hallucinations are detected
	 * @private
	 */
	_adjustGroundednessForHallucinations(currentLevel, hallucinations) {
		const severitySum = hallucinations.reduce((sum, h) => sum + h.severity, 0);

		if (severitySum >= 1.5) {
			return GroundednessLevel.UNGROUNDED;
		}

		if (severitySum >= 0.8) {
			return GroundednessLevel.LOW;
		}

		if (currentLevel === GroundednessLevel.HIGH && severitySum > 0) {
			return GroundednessLevel.MEDIUM;
		}

		return currentLevel;
	}
}

module.exports = {
	RAGValidator,
	GroundednessCalculator,
	HallucinationDetector,
	SourceTracker,
};
