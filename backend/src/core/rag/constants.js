/**
 * RAG System Constants - Configuration for validation and hallucination detection.
 * @module rag.constants
 */

'use strict';

/**
 * Groundedness levels for RAG responses
 * @readonly
 * @enum {string}
 */
const GroundednessLevel = Object.freeze({
	HIGH: 'high',
	MEDIUM: 'medium',
	LOW: 'low',
	UNGROUNDED: 'ungrounded',
});

/**
 * Validation status for hallucination detection
 * @readonly
 * @enum {string}
 */
const ValidationStatus = Object.freeze({
	VALID: 'valid',
	WARNING: 'warning',
	INVALID: 'invalid',
	UNVERIFIABLE: 'unverifiable',
});

/**
 * Types of hallucinations the system can detect
 * @readonly
 * @enum {string}
 */
const HallucinationType = Object.freeze({
	FABRICATED_ENDPOINT: 'fabricated_endpoint',
	FABRICATED_PRICE: 'fabricated_price',
	FABRICATED_PARAMETER: 'fabricated_parameter',
	UNSUPPORTED_COUNTRY: 'unsupported_country',
	INCORRECT_METHOD: 'incorrect_method',
	FABRICATED_FEATURE: 'fabricated_feature',
	CONFLICTING_INFO: 'conflicting_info',
});

/**
 * Confidence thresholds for groundedness calculation
 * These values are based on empirical testing and can be adjusted
 * @readonly
 * @type {Object}
 */
const GROUNDEDNESS_THRESHOLDS = Object.freeze({
	HIGH: 0.45, // >= 45% average score = high confidence (was 0.75)
	MEDIUM: 0.30, // >= 30% average score = medium confidence (was 0.55)
	LOW: 0.15, // >= 15% average score = low confidence (was 0.35)
	// Below 15% = ungrounded
});

/**
 * Minimum number of sources required for different confidence levels
 * @readonly
 * @type {Object}
 */
const SOURCE_COUNT_REQUIREMENTS = Object.freeze({
	MINIMUM_FOR_HIGH: 2, // At least 2 high-quality sources for "high" groundedness
	MINIMUM_FOR_RESPONSE: 1, // At least 1 source to generate a response
});

/**
 * Score adjustments for various validation factors
 * @readonly
 * @type {Object}
 */
const SCORE_ADJUSTMENTS = Object.freeze({
	EXACT_ENDPOINT_MATCH: 0.15, // Bonus for exact endpoint match
	EXACT_PRICE_MATCH: 0.10, // Bonus for exact price match
	PARAMETER_COVERAGE: 0.05, // Bonus per matched parameter
	HALLUCINATION_PENALTY: -0.25, // Penalty per detected hallucination
	LOW_SOURCE_PENALTY: -0.10, // Penalty when only 1 source available
});

/**
 * Regex patterns for detecting potential hallucinations in LLM output
 * @readonly
 * @type {Object}
 */
const HALLUCINATION_PATTERNS = Object.freeze({
	// Endpoint patterns - detect API paths that might be fabricated
	ENDPOINT_PATTERN: /(?:endpoint|url|api|path)[\s:]*[`"']?((?:https?:\/\/)?[\w.-]+\/[\w\-/.{}]+)[`"']?/gi,

	// Price patterns - detect monetary values
	PRICE_PATTERN: /(?:price|cost|precio|costo|fee|rate)[\s:]*[`"']?\$?([\d,.]+)\s*(?:USD|COP|EUR|usd|cop|credits?)?[`"']?/gi,

	// HTTP method patterns
	METHOD_PATTERN: /(?:method|método)[\s:]*[`"']?(GET|POST|PUT|DELETE|PATCH)[`"']?/gi,

	// Parameter patterns - detect API parameters
	PARAMETER_PATTERN: /(?:parameter|param|parámetro)[\s:]*[`"']?([\w_]+)[`"']?/gi,

	// Country patterns - detect country references
	COUNTRY_PATTERN: /(?:available in|supported in|works in|disponible en|soportado en)\s*([\w\s,]+)/gi,
});

/**
 * Known valid endpoints from documentation (dynamically populated)
 * This serves as a cache/whitelist for quick validation
 * @type {Set<string>}
 */
const KNOWN_VALID_ENDPOINTS = new Set();

/**
 * Warning messages for different scenarios
 * @readonly
 * @type {Object}
 */
const WARNING_MESSAGES = Object.freeze({
	LOW_CONFIDENCE: 'This response is based on limited documentation. Consider verifying details.',
	NO_SOURCES: 'No documentation sources found for this query. Response is based on general knowledge.',
	POTENTIAL_HALLUCINATION: 'Some information in this response could not be verified against documentation.',
	SINGLE_SOURCE: 'Response based on a single source. Consider verifying with additional documentation.',
	OUTDATED_SOURCE: 'Source documentation may be outdated. Please verify current API specifications.',
});

/**
 * Anti-hallucination prompt instructions
 * These are injected into the system prompt to enforce grounded responses
 * Enterprise-grade 2026 prompt engineering for hallucination prevention
 * @readonly
 * @type {string}
 */
const ANTI_HALLUCINATION_PROMPT = `
## ⚠️ CRITICAL: ANTI-HALLUCINATION RULES (MANDATORY COMPLIANCE)

You operate under STRICT factual accuracy requirements. Violations are logged and audited.

### RULE 1: STRICT NEGATIVE CONSTRAINT (NO INVENTING LISTS)
If the user asks for a list (e.g., "Supported Countries", "Available Methods", "Features"), you must **ONLY** list the items explicitly present in the chunks.
- **CRITICAL:** Do NOT add items from your general knowledge (e.g., if docs say "BC and Ontario", do NOT add "Quebec" just because it's in Canada).
- **FALLBACK:** If the list seems incomplete, simply say: "The current official documentation only lists: [Items found]."

### RULE 2: NATURAL LANGUAGE (NO "ROBOT" TALK)
You are an expert consultant, not a PDF reader.
- ❌ **BANISHED PHRASES:** "Based on the provided documentation", "In the context", "According to the provided text".
- ✅ **USE:** "The official documentation indicates...", "Currently, Verifik supports...", "I don't have details on that service."

### RULE 3: ABSOLUTE PROHIBITIONS
You must NEVER fabricate or invent:
- ❌ API endpoints (e.g., /api/validate/passport - unless documented)
- ❌ Prices, costs, or fees (e.g., $0.15 per request - unless documented)
- ❌ Parameter names, types, or formats
- ❌ Country availability (ONLY mention: Colombia, Mexico, Brazil, USA if documented)

### RULE 4: UNCERTAINTY PROTOCOL
If information is NOT in the documentation:
- SAY: "I don't have information about [specific topic] at this time." or "That service doesn't appear in the official reference."
- EXCEPTION: If the user asks for a procedure (e.g., "How to login"), and you have the steps, you MAY synthesize them from the documentation chunks.

### RULE 8: FORMATTING & VISUALS
- **TABLES**: ALWAYS use Markdown tables for structured data like:
  - Lists of Parameters (Name | Type | Description)
  - Pricing (Service | Cost | Unit)
  - Status Codes (Code | Meaning)
- **NEVER** use bullet lists for data that belongs in a table. Tables are mandatory for readability.

### COMPLIANCE NOTICE
This conversation is monitored. Responses with invented features will be flagged.
`;

/**
 * Strict mode anti-hallucination prompt (even more restrictive)
 * Used when strictMode is enabled in configuration
 * @readonly
 * @type {string}
 */
const STRICT_MODE_PROMPT = `
## 🚨 STRICT MODE ACTIVE: ZERO TOLERANCE FOR FABRICATION

ADDITIONAL RESTRICTIONS APPLY:

1. **QUOTE-ONLY MODE**: For technical details, quote directly from documentation.
   Format: "According to the documentation: '[exact quote]'"

2. **NO INTERPOLATION**: Do not combine information from multiple sources to create new claims.

3. **EXPLICIT GAPS**: If asked about undocumented topics, respond with ONLY:
   "This information is not available in the provided documentation. Please consult the official Verifik documentation or support team."

4. **AUTOMATIC BLOCKING**: Any response containing:
   - Invented endpoints → BLOCKED
   - Fabricated prices → BLOCKED
   - Unsupported countries → BLOCKED
   
   Will result in the response being replaced with a safe fallback.
`;

/**
 * Default configuration for RAG validation
 * @readonly
 * @type {Object}
 */
const DEFAULT_CONFIG = Object.freeze({
	maxSources: 5,
	minScoreThreshold: 0.25, // Calibrated: 0.29 was a valid match for Canada, so 0.25 is safe
	enableHallucinationDetection: true,
	enablePostGenerationValidation: true,
	enableSemanticVerification: true, // Use embedding-based claim verification
	enableResponseSanitization: true, // Redact/block unverified claims
	strictMode: true, // Activated: STRICT mode to prevent hallucinations
	auditLogging: true, // Log all hallucination detections for analysis
	blockThreshold: 0.80, // Severity threshold for blocking response
	redactThreshold: 0.50, // Severity threshold for redacting claims
	warnThreshold: 0.30, // Severity threshold for adding warnings
});

module.exports = {
	GroundednessLevel,
	ValidationStatus,
	HallucinationType,
	GROUNDEDNESS_THRESHOLDS,
	SOURCE_COUNT_REQUIREMENTS,
	SCORE_ADJUSTMENTS,
	HALLUCINATION_PATTERNS,
	KNOWN_VALID_ENDPOINTS,
	WARNING_MESSAGES,
	ANTI_HALLUCINATION_PROMPT,
	STRICT_MODE_PROMPT,
	DEFAULT_CONFIG,
};
