/**
 * Response Sanitizer Module - Strip, redact, or block hallucinated content.
 * @module response-sanitizer
 */

'use strict';

// Type definitions

/**
 * @typedef {Object} SanitizationResult
 * @property {string} content - Sanitized response content
 * @property {string} action - Action taken: 'passed' | 'warned' | 'redacted' | 'blocked'
 * @property {string[]} modifications - List of modifications made
 * @property {boolean} wasModified - Whether content was modified
 * @property {Object} metadata - Additional metadata about sanitization
 */

/**
 * @typedef {Object} SanitizationConfig
 * @property {number} blockThreshold - Severity threshold to block response (0-1)
 * @property {number} redactThreshold - Severity threshold to redact content (0-1)
 * @property {number} warnThreshold - Severity threshold to add warnings (0-1)
 * @property {boolean} enableInlineWarnings - Add inline [⚠️ Unverified] markers
 * @property {boolean} enableFooterWarning - Add warning footer to response
 * @property {string} fallbackMessage - Message to return when blocking
 */

// Configuration

/**
 * Default sanitization configuration
 * @readonly
 */
const SANITIZATION_CONFIG = Object.freeze({
	// Severity thresholds for different actions
	BLOCK_THRESHOLD: 0.80,      // Block entire response
	REDACT_THRESHOLD: 0.50,     // Redact specific fabrications
	WARN_THRESHOLD: 0.30,       // Add inline warnings

	// Feature flags
	ENABLE_INLINE_WARNINGS: true,
	ENABLE_FOOTER_WARNING: true,
	ENABLE_SOURCE_CITATION: true,

	// Fallback messages
	FALLBACK_MESSAGE: `I apologize, but I cannot provide a reliable answer based on the available documentation. 

**What you can do:**
- Check the official documentation at https://docs.verifik.co
- Contact support for specific technical questions
- Try rephrasing your question with more specific details

This helps ensure you receive accurate information.`,

	PARTIAL_FALLBACK: `⚠️ **Note:** Some information in this response could not be verified against official documentation. Please verify critical details before implementation.`,

	// Warning markers
	INLINE_WARNING_MARKER: '[⚠️ Unverified]',
	VERIFIED_MARKER: '[✅ Verified]',
});

/**
 * Sanitization action types
 * @readonly
 * @enum {string}
 */
const SanitizationAction = Object.freeze({
	PASSED: 'passed',
	WARNED: 'warned',
	REDACTED: 'redacted',
	BLOCKED: 'blocked',
});

/**
 * Redacts specific fabricated claims from response text.
 */
class ClaimRedactor {
	/**
	 * @param {Object} config - Redaction configuration
	 */
	constructor(config = SANITIZATION_CONFIG) {
		this.config = config;
	}

	/**
	 * Redact a specific claim from text
	 * @param {string} text - Original text
	 * @param {Object} hallucination - Detected hallucination object
	 * @returns {{ text: string, wasRedacted: boolean, redactionNote: string }}
	 */
	redactClaim(text, hallucination) {
		const { detected, type, context } = hallucination;

		// Build replacement based on hallucination type
		const replacement = this._getReplacementText(type, detected);

		// Find and replace the fabricated content
		const escapedDetected = this._escapeRegex(detected);
		const pattern = new RegExp(escapedDetected, 'gi');

		if (!pattern.test(text)) {
			return { text, wasRedacted: false, redactionNote: null };
		}

		const redactedText = text.replace(pattern, replacement);

		return {
			text: redactedText,
			wasRedacted: true,
			redactionNote: `Redacted ${type}: "${detected}" → "${replacement}"`,
		};
	}

	/**
	 * Redact multiple claims from text
	 * @param {string} text - Original text
	 * @param {Array} hallucinations - Array of detected hallucinations
	 * @returns {{ text: string, redactions: string[] }}
	 */
	redactMultiple(text, hallucinations) {
		let currentText = text;
		const redactions = [];

		// Sort by severity (highest first) to prioritize critical redactions
		const sorted = [...hallucinations].sort((a, b) => b.severity - a.severity);

		for (const hallucination of sorted) {
			const result = this.redactClaim(currentText, hallucination);
			if (result.wasRedacted) {
				currentText = result.text;
				redactions.push(result.redactionNote);
			}
		}

		return { text: currentText, redactions };
	}

	/**
	 * Get replacement text for different hallucination types
	 * @private
	 */
	_getReplacementText(type, original) {
		const replacements = {
			fabricated_endpoint: '[endpoint information not available in documentation]',
			fabricated_price: '[pricing information not available - please check official pricing]',
			fabricated_parameter: '[parameter details not verified]',
			unsupported_country: '[country availability not confirmed]',
			incorrect_method: '[HTTP method not verified]',
			fabricated_feature: '[feature not confirmed in documentation]',
			conflicting_info: '[information requires verification]',
		};

		return replacements[type] || `${this.config.INLINE_WARNING_MARKER} ${original}`;
	}

	/**
	 * Escape special regex characters
	 * @private
	 */
	_escapeRegex(string) {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}

/**
 * Injects inline and footer warnings into response text.
 */
class WarningInjector {
	/**
	 * @param {Object} config - Warning configuration
	 */
	constructor(config = SANITIZATION_CONFIG) {
		this.config = config;
	}

	/**
	 * Add inline warning markers to unverified claims
	 * @param {string} text - Response text
	 * @param {Array} unverifiedClaims - Claims that failed verification
	 * @returns {string}
	 */
	addInlineWarnings(text, unverifiedClaims) {
		if (!this.config.ENABLE_INLINE_WARNINGS || unverifiedClaims.length === 0) {
			return text;
		}

		let modifiedText = text;

		for (const claim of unverifiedClaims) {
			const claimValue = claim.claim || claim.detected;
			if (!claimValue) continue;

			const escapedClaim = claimValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const pattern = new RegExp(`(${escapedClaim})`, 'gi');

			// Only mark first occurrence to avoid cluttering
			let replaced = false;
			modifiedText = modifiedText.replace(pattern, (match) => {
				if (replaced) return match;
				replaced = true;
				return `${this.config.INLINE_WARNING_MARKER} ${match}`;
			});
		}

		return modifiedText;
	}

	/**
	 * Add verified markers to confirmed claims
	 * @param {string} text - Response text
	 * @param {Array} verifiedClaims - Claims that passed verification
	 * @returns {string}
	 */
	addVerifiedMarkers(text, verifiedClaims) {
		// Only add verified markers for critical claims
		const criticalVerified = verifiedClaims.filter(
			c => c.riskLevel === 'critical' && c.confidenceScore >= 0.85
		);

		if (criticalVerified.length === 0) return text;

		let modifiedText = text;

		for (const claim of criticalVerified.slice(0, 3)) { // Limit to 3 markers
			const claimValue = claim.claim;
			if (!claimValue) continue;

			const escapedClaim = claimValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const pattern = new RegExp(`(${escapedClaim})`, 'i');

			modifiedText = modifiedText.replace(pattern, `${this.config.VERIFIED_MARKER} $1`);
		}

		return modifiedText;
	}

	/**
	 * Add warning footer to response
	 * @param {string} text - Response text
	 * @param {Object} validationResult - Validation result object
	 * @returns {string}
	 */
	addWarningFooter(text, validationResult) {
		if (!this.config.ENABLE_FOOTER_WARNING) {
			return text;
		}

		const { warnings, detectedHallucinations } = validationResult;

		if (warnings.length === 0 && detectedHallucinations.length === 0) {
			return text;
		}

		const footer = this._buildWarningFooter(validationResult);
		return `${text}\n\n---\n\n${footer}`;
	}

	/**
	 * Build warning footer content
	 * @private
	 */
	_buildWarningFooter(validationResult) {
		const { detectedHallucinations, warnings } = validationResult;
		const parts = [];

		if (detectedHallucinations.length > 0) {
			parts.push(`⚠️ **Verification Notice:** ${detectedHallucinations.length} claim(s) in this response could not be verified against official documentation.`);
		}

		if (warnings.length > 0) {
			parts.push(`**Notes:**\n${warnings.map(w => `- ${w}`).join('\n')}`);
		}

		parts.push(`*Please verify critical technical details before implementation.*`);

		return parts.join('\n\n');
	}
}

/**
 * Generates safe fallback responses when blocking is required.
 */
class SafeFallbackGenerator {
	/**
	 * @param {Object} config - Fallback configuration
	 */
	constructor(config = SANITIZATION_CONFIG) {
		this.config = config;
	}

	/**
	 * Generate complete fallback response (when blocking)
	 * @param {string} originalQuery - User's original question
	 * @param {Object} context - Additional context
	 * @returns {string}
	 */
	generateFullFallback(originalQuery, context = {}) {
		const { sources = [], groundedness = 'ungrounded' } = context;

		let response = this.config.FALLBACK_MESSAGE;

		// Add available sources if any
		if (sources.length > 0) {
			const sourceList = sources
				.slice(0, 3)
				.map(s => `- ${s.title || s.source}`)
				.join('\n');

			response += `\n\n**Related documentation that may help:**\n${sourceList}`;
		}

		return response;
	}

	/**
	 * Generate partial fallback (when some content is valid)
	 * @param {string} sanitizedContent - Already sanitized content
	 * @param {Object} validationResult - Validation results
	 * @returns {string}
	 */
	generatePartialFallback(sanitizedContent, validationResult) {
		const { detectedHallucinations } = validationResult;

		const criticalCount = detectedHallucinations.filter(h => h.severity >= 0.7).length;

		if (criticalCount > 0) {
			return `${this.config.PARTIAL_FALLBACK}\n\n${sanitizedContent}`;
		}

		return sanitizedContent;
	}

	/**
	 * Generate suggestion for how to get accurate information
	 * @param {string} topic - Topic of the query
	 * @returns {string}
	 */
	generateSuggestion(topic) {
		return `💡 **Tip:** For accurate information about ${topic}, we recommend checking the official API documentation or contacting support directly.`;
	}
}

/**
 * Injects source citations into responses.
 */
class SourceCitationInjector {
	/**
	 * @param {Object} config - Citation configuration
	 */
	constructor(config = SANITIZATION_CONFIG) {
		this.config = config;
	}

	/**
	 * Add source citations footer
	 * @param {string} text - Response text
	 * @param {Array} sources - Source objects used
	 * @returns {string}
	 */
	addSourcesCitation(text, sources) {
		if (!this.config.ENABLE_SOURCE_CITATION || sources.length === 0) {
			return text;
		}

		const topSources = sources
			.filter(s => s.score >= 0.5)
			.slice(0, 5);

		if (topSources.length === 0) return text;

		const citationBlock = this._buildCitationBlock(topSources);
		return `${text}\n\n${citationBlock}`;
	}

	/**
	 * Build citation block
	 * @private
	 */
	_buildCitationBlock(sources) {
		const citations = sources.map((s, i) => {
			const title = s.title || 'Documentation';
			const source = s.source || 'Unknown';
			const score = Math.round((s.score || 0) * 100);
			return `${i + 1}. **${title}** - \`${source}\` (${score}% relevance)`;
		});

		return `📚 **Sources:**\n${citations.join('\n')}`;
	}
}

/**
 * Main Response Sanitizer - Facade combining all sanitization components.
 */
class ResponseSanitizer {
	/**
	 * @param {Object} config - Configuration options
	 */
	constructor(config = {}) {
		this.config = { ...SANITIZATION_CONFIG, ...config };
		this.redactor = new ClaimRedactor(this.config);
		this.warningInjector = new WarningInjector(this.config);
		this.fallbackGenerator = new SafeFallbackGenerator(this.config);
		this.citationInjector = new SourceCitationInjector(this.config);

		// Statistics
		this.stats = {
			totalSanitizations: 0,
			passed: 0,
			warned: 0,
			redacted: 0,
			blocked: 0,
		};
	}

	/**
	 * Sanitize a response based on validation results
	 * @param {string} originalContent - Original LLM response
	 * @param {Object} validationResult - Validation result from RAG validator
	 * @param {Object} ragMetadata - RAG metadata including sources
	 * @param {string} originalQuery - User's original query
	 * @returns {SanitizationResult}
	 */
	sanitize(originalContent, validationResult, ragMetadata = {}, originalQuery = '') {
		this.stats.totalSanitizations++;

		const { detectedHallucinations = [], warnings = [] } = validationResult;
		const { sources = [], groundedness = 'medium' } = ragMetadata;

		// Calculate max severity
		const maxSeverity = this._calculateMaxSeverity(detectedHallucinations);

		// Determine action based on severity
		const action = this._determineAction(maxSeverity, groundedness);

		// Execute sanitization based on action
		switch (action) {
			case SanitizationAction.BLOCKED:
				return this._executeBlock(originalQuery, ragMetadata);

			case SanitizationAction.REDACTED:
				return this._executeRedact(originalContent, validationResult, ragMetadata);

			case SanitizationAction.WARNED:
				return this._executeWarn(originalContent, validationResult, ragMetadata);

			default:
				return this._executePass(originalContent, validationResult, ragMetadata);
		}
	}

	/**
	 * Calculate maximum severity from hallucinations
	 * @private
	 */
	_calculateMaxSeverity(hallucinations) {
		if (hallucinations.length === 0) return 0;
		return Math.max(...hallucinations.map(h => h.severity || 0));
	}

	/**
	 * Determine sanitization action based on severity
	 * @private
	 */
	_determineAction(maxSeverity, groundedness) {
		// Block if ungrounded and has high severity hallucinations
		if (groundedness === 'ungrounded' && maxSeverity >= this.config.BLOCK_THRESHOLD) {
			return SanitizationAction.BLOCKED;
		}

		if (maxSeverity >= this.config.BLOCK_THRESHOLD) {
			return SanitizationAction.BLOCKED;
		}

		if (maxSeverity >= this.config.REDACT_THRESHOLD) {
			return SanitizationAction.REDACTED;
		}

		if (maxSeverity >= this.config.WARN_THRESHOLD) {
			return SanitizationAction.WARNED;
		}

		return SanitizationAction.PASSED;
	}

	/**
	 * Execute BLOCK action
	 * @private
	 */
	_executeBlock(originalQuery, ragMetadata) {
		this.stats.blocked++;

		const content = this.fallbackGenerator.generateFullFallback(
			originalQuery,
			{ sources: ragMetadata.sources, groundedness: ragMetadata.groundedness }
		);

		return {
			content,
			action: SanitizationAction.BLOCKED,
			modifications: ['Response blocked due to high-severity unverified claims'],
			wasModified: true,
			metadata: {
				reason: 'High-severity hallucinations detected',
				originalBlocked: true,
			},
		};
	}

	/**
	 * Execute REDACT action
	 * @private
	 */
	_executeRedact(originalContent, validationResult, ragMetadata) {
		this.stats.redacted++;

		const { detectedHallucinations } = validationResult;

		// Redact fabricated claims
		const { text: redactedText, redactions } = this.redactor.redactMultiple(
			originalContent,
			detectedHallucinations
		);

		// Add warning footer
		let finalContent = this.warningInjector.addWarningFooter(redactedText, validationResult);

		// Add source citations
		finalContent = this.citationInjector.addSourcesCitation(finalContent, ragMetadata.sources || []);

		return {
			content: finalContent,
			action: SanitizationAction.REDACTED,
			modifications: redactions,
			wasModified: true,
			metadata: {
				redactedCount: redactions.length,
				hallucinations: detectedHallucinations.map(h => ({ type: h.type, detected: h.detected })),
			},
		};
	}

	/**
	 * Execute WARN action
	 * @private
	 */
	_executeWarn(originalContent, validationResult, ragMetadata) {
		this.stats.warned++;

		const { detectedHallucinations } = validationResult;

		// Add inline warnings
		let warnedContent = this.warningInjector.addInlineWarnings(
			originalContent,
			detectedHallucinations
		);

		// Add warning footer
		warnedContent = this.warningInjector.addWarningFooter(warnedContent, validationResult);

		// Add source citations
		warnedContent = this.citationInjector.addSourcesCitation(warnedContent, ragMetadata.sources || []);

		return {
			content: warnedContent,
			action: SanitizationAction.WARNED,
			modifications: [`Added warnings for ${detectedHallucinations.length} unverified claims`],
			wasModified: true,
			metadata: {
				warningsAdded: detectedHallucinations.length,
			},
		};
	}

	/**
	 * Execute PASS action (no modification needed)
	 * @private
	 */
	_executePass(originalContent, validationResult, ragMetadata) {
		this.stats.passed++;

		// Still add source citations for transparency
		const contentWithCitations = this.citationInjector.addSourcesCitation(
			originalContent,
			ragMetadata.sources || []
		);

		return {
			content: contentWithCitations,
			action: SanitizationAction.PASSED,
			modifications: [],
			wasModified: contentWithCitations !== originalContent,
			metadata: {
				confidence: ragMetadata.confidence || 0,
			},
		};
	}

	/**
	 * Get sanitization statistics
	 * @returns {Object}
	 */
	getStats() {
		const total = this.stats.totalSanitizations;
		return {
			...this.stats,
			passRate: total > 0 ? Math.round((this.stats.passed / total) * 100) : 0,
			blockRate: total > 0 ? Math.round((this.stats.blocked / total) * 100) : 0,
			modificationRate: total > 0
				? Math.round(((this.stats.warned + this.stats.redacted + this.stats.blocked) / total) * 100)
				: 0,
		};
	}

	/**
	 * Reset statistics
	 */
	resetStats() {
		this.stats = {
			totalSanitizations: 0,
			passed: 0,
			warned: 0,
			redacted: 0,
			blocked: 0,
		};
	}
}

module.exports = {
	ResponseSanitizer,
	ClaimRedactor,
	WarningInjector,
	SafeFallbackGenerator,
	SourceCitationInjector,
	SanitizationAction,
	SANITIZATION_CONFIG,
};
