/**
 * Hallucination Audit Module - Logging, metrics, and compliance tracking.
 * @module hallucination-audit
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Type definitions

/**
 * @typedef {Object} AuditEntry
 * @property {string} id - Unique audit entry ID
 * @property {string} timestamp - ISO timestamp
 * @property {string} sessionId - Session identifier
 * @property {string} query - User's original query
 * @property {string} responseHash - Hash of the response (privacy)
 * @property {Array} hallucinations - Detected hallucinations
 * @property {string} action - Action taken (passed/warned/redacted/blocked)
 * @property {Object} metrics - Performance metrics
 * @property {Object} sources - Source information used
 */

/**
 * @typedef {Object} AuditMetrics
 * @property {number} totalQueries - Total queries processed
 * @property {number} hallucinationsDetected - Total hallucinations detected
 * @property {number} responsesBlocked - Responses completely blocked
 * @property {number} responsesModified - Responses modified (warned/redacted)
 * @property {number} responsesPassed - Responses passed without modification
 * @property {Object} hallucinationsByType - Count by hallucination type
 * @property {number} avgConfidence - Average groundedness confidence
 */

// Configuration

const AUDIT_CONFIG = Object.freeze({
	// Audit log file path
	LOG_FILE_PATH: path.resolve(__dirname, '../data/hallucination-audit.json'),

	// Maximum entries to keep in memory
	MAX_MEMORY_ENTRIES: 1000,

	// Flush to disk interval (ms)
	FLUSH_INTERVAL: 60000, // 1 minute

	// Enable file persistence
	ENABLE_PERSISTENCE: true,

	// Alert thresholds
	ALERT_THRESHOLDS: {
		HALLUCINATION_RATE: 0.20,     // Alert if > 20% hallucination rate
		BLOCK_RATE: 0.10,             // Alert if > 10% block rate
		AVG_SEVERITY: 0.60,           // Alert if avg severity > 0.6
	},

	// Privacy settings
	PRIVACY: {
		HASH_QUERIES: false,          // Hash user queries for privacy
		HASH_RESPONSES: true,         // Hash response content
		REDACT_PII: true,             // Attempt to redact PII from logs
	},
});

// Utilities

/**
 * Generate unique ID
 * @returns {string}
 */
const generateId = () => {
	return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Simple hash function for privacy
 * @param {string} str - String to hash
 * @returns {string}
 */
const simpleHash = (str) => {
	if (!str) return 'empty';
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash;
	}
	return `hash_${Math.abs(hash).toString(16)}`;
};

/**
 * Redact potential PII from text
 * @param {string} text - Text to redact
 * @returns {string}
 */
const redactPII = (text) => {
	if (!text) return text;

	return text
		// Email addresses
		.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
		// Phone numbers
		.replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]')
		// SSN-like patterns
		.replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '[SSN]')
		// Credit card-like patterns
		.replace(/\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g, '[CARD]')
		// Colombian cedula patterns (6-10 digits)
		.replace(/\b\d{6,10}\b/g, '[DOC_ID]');
};

/**
 * Collects and aggregates hallucination metrics.
 */
class MetricsCollector {
	constructor() {
		this.reset();
	}

	/**
	 * Reset all metrics
	 */
	reset() {
		this.metrics = {
			totalQueries: 0,
			hallucinationsDetected: 0,
			responsesBlocked: 0,
			responsesModified: 0,
			responsesPassed: 0,
			hallucinationsByType: {},
			severitySum: 0,
			confidenceSum: 0,
			responseTimeSum: 0,
			periodStart: new Date().toISOString(),
		};
	}

	/**
	 * Record a query processing result
	 * @param {Object} data - Processing result data
	 */
	record(data) {
		const {
			hallucinations = [],
			action,
			confidence = 0,
			responseTimeMs = 0
		} = data;

		this.metrics.totalQueries++;
		this.metrics.confidenceSum += confidence;
		this.metrics.responseTimeSum += responseTimeMs;

		// Count hallucinations
		if (hallucinations.length > 0) {
			this.metrics.hallucinationsDetected += hallucinations.length;

			// Count by type
			for (const h of hallucinations) {
				const type = h.type || 'unknown';
				this.metrics.hallucinationsByType[type] =
					(this.metrics.hallucinationsByType[type] || 0) + 1;
				this.metrics.severitySum += (h.severity || 0);
			}
		}

		// Count by action
		switch (action) {
			case 'blocked':
				this.metrics.responsesBlocked++;
				break;
			case 'redacted':
			case 'warned':
				this.metrics.responsesModified++;
				break;
			default:
				this.metrics.responsesPassed++;
		}
	}

	/**
	 * Get computed metrics
	 * @returns {AuditMetrics}
	 */
	getMetrics() {
		const total = this.metrics.totalQueries;

		return {
			...this.metrics,
			hallucinationRate: total > 0
				? Math.round((this.metrics.hallucinationsDetected / total) * 100) / 100
				: 0,
			blockRate: total > 0
				? Math.round((this.metrics.responsesBlocked / total) * 100) / 100
				: 0,
			modificationRate: total > 0
				? Math.round((this.metrics.responsesModified / total) * 100) / 100
				: 0,
			passRate: total > 0
				? Math.round((this.metrics.responsesPassed / total) * 100) / 100
				: 0,
			avgConfidence: total > 0
				? Math.round((this.metrics.confidenceSum / total) * 100) / 100
				: 0,
			avgSeverity: this.metrics.hallucinationsDetected > 0
				? Math.round((this.metrics.severitySum / this.metrics.hallucinationsDetected) * 100) / 100
				: 0,
			avgResponseTimeMs: total > 0
				? Math.round(this.metrics.responseTimeSum / total)
				: 0,
			periodStart: this.metrics.periodStart,
			periodEnd: new Date().toISOString(),
		};
	}

	/**
	 * Check if any alert thresholds are exceeded
	 * @returns {Array<{metric: string, value: number, threshold: number}>}
	 */
	checkAlerts() {
		const metrics = this.getMetrics();
		const alerts = [];
		const thresholds = AUDIT_CONFIG.ALERT_THRESHOLDS;

		if (metrics.hallucinationRate > thresholds.HALLUCINATION_RATE) {
			alerts.push({
				metric: 'hallucinationRate',
				value: metrics.hallucinationRate,
				threshold: thresholds.HALLUCINATION_RATE,
				message: `Hallucination rate (${(metrics.hallucinationRate * 100).toFixed(1)}%) exceeds threshold`,
			});
		}

		if (metrics.blockRate > thresholds.BLOCK_RATE) {
			alerts.push({
				metric: 'blockRate',
				value: metrics.blockRate,
				threshold: thresholds.BLOCK_RATE,
				message: `Block rate (${(metrics.blockRate * 100).toFixed(1)}%) exceeds threshold`,
			});
		}

		if (metrics.avgSeverity > thresholds.AVG_SEVERITY) {
			alerts.push({
				metric: 'avgSeverity',
				value: metrics.avgSeverity,
				threshold: thresholds.AVG_SEVERITY,
				message: `Average severity (${metrics.avgSeverity.toFixed(2)}) exceeds threshold`,
			});
		}

		return alerts;
	}
}

/**
 * Tracks and categorizes hallucination incidents.
 */
class IncidentTracker {
	constructor() {
		this.incidents = [];
		this.patterns = new Map();
	}

	/**
	 * Record an incident
	 * @param {Object} incident - Incident data
	 */
	recordIncident(incident) {
		const entry = {
			id: generateId(),
			timestamp: new Date().toISOString(),
			...incident,
		};

		this.incidents.push(entry);

		// Track patterns
		for (const h of (incident.hallucinations || [])) {
			const patternKey = `${h.type}:${simpleHash(h.detected)}`;
			const count = this.patterns.get(patternKey) || 0;
			this.patterns.set(patternKey, count + 1);
		}

		// Trim old incidents (keep last 500)
		if (this.incidents.length > 500) {
			this.incidents = this.incidents.slice(-500);
		}
	}

	/**
	 * Get recent incidents
	 * @param {number} limit - Number of incidents to return
	 * @returns {Array}
	 */
	getRecentIncidents(limit = 50) {
		return this.incidents.slice(-limit).reverse();
	}

	/**
	 * Get recurring patterns (potential systematic issues)
	 * @param {number} minOccurrences - Minimum occurrences to report
	 * @returns {Array}
	 */
	getRecurringPatterns(minOccurrences = 3) {
		const patterns = [];

		for (const [key, count] of this.patterns.entries()) {
			if (count >= minOccurrences) {
				const [type, hash] = key.split(':');
				patterns.push({ type, hash, occurrences: count });
			}
		}

		return patterns.sort((a, b) => b.occurrences - a.occurrences);
	}

	/**
	 * Get incidents by type
	 * @param {string} type - Hallucination type
	 * @returns {Array}
	 */
	getIncidentsByType(type) {
		return this.incidents.filter(i =>
			i.hallucinations?.some(h => h.type === type)
		);
	}

	/**
	 * Get incident summary
	 * @returns {Object}
	 */
	getSummary() {
		const typeCount = {};

		for (const incident of this.incidents) {
			for (const h of (incident.hallucinations || [])) {
				typeCount[h.type] = (typeCount[h.type] || 0) + 1;
			}
		}

		return {
			totalIncidents: this.incidents.length,
			byType: typeCount,
			recurringPatterns: this.getRecurringPatterns(),
			oldestIncident: this.incidents[0]?.timestamp || null,
			newestIncident: this.incidents[this.incidents.length - 1]?.timestamp || null,
		};
	}

	/**
	 * Clear all incidents
	 */
	clear() {
		this.incidents = [];
		this.patterns.clear();
	}
}

/**
 * Main audit logger - persists audit entries to file/storage.
 */
class AuditLogger {
	/**
	 * @param {Object} config - Logger configuration
	 */
	constructor(config = {}) {
		this.config = { ...AUDIT_CONFIG, ...config };
		this.entries = [];
		this.flushTimer = null;

		// Start auto-flush if persistence enabled
		if (this.config.ENABLE_PERSISTENCE) {
			this._startAutoFlush();
		}
	}

	/**
	 * Log an audit entry
	 * @param {Object} data - Audit data
	 * @returns {string} Entry ID
	 */
	log(data) {
		const entry = this._createEntry(data);
		this.entries.push(entry);

		// Trim if over max
		if (this.entries.length > this.config.MAX_MEMORY_ENTRIES) {
			this.entries = this.entries.slice(-this.config.MAX_MEMORY_ENTRIES);
		}

		// Log to console in development
		if (process.env.NODE_ENV !== 'production') {
			this._logToConsole(entry);
		}

		return entry.id;
	}

	/**
	 * Create audit entry with privacy protections
	 * @private
	 */
	_createEntry(data) {
		const {
			query,
			response,
			hallucinations = [],
			action,
			sources = [],
			confidence = 0,
			responseTimeMs = 0,
			sessionId = 'unknown',
		} = data;

		// Apply privacy settings
		let processedQuery = query;
		let processedResponse = response;

		if (this.config.PRIVACY.REDACT_PII) {
			processedQuery = redactPII(query);
		}

		if (this.config.PRIVACY.HASH_QUERIES) {
			processedQuery = simpleHash(query);
		}

		if (this.config.PRIVACY.HASH_RESPONSES) {
			processedResponse = simpleHash(response);
		}

		return {
			id: generateId(),
			timestamp: new Date().toISOString(),
			sessionId,
			query: processedQuery,
			responseHash: processedResponse,
			hallucinations: hallucinations.map(h => ({
				type: h.type,
				severity: h.severity,
				detected: this.config.PRIVACY.REDACT_PII ? redactPII(h.detected) : h.detected,
			})),
			action,
			metrics: {
				confidence,
				responseTimeMs,
				hallucinationCount: hallucinations.length,
				maxSeverity: hallucinations.length > 0
					? Math.max(...hallucinations.map(h => h.severity || 0))
					: 0,
			},
			sources: sources.slice(0, 3).map(s => ({
				title: s.title,
				score: s.score,
			})),
		};
	}

	/**
	 * Log entry to console (development)
	 * @private
	 */
	_logToConsole(entry) {
		const { action, hallucinations, metrics } = entry;

		if (action === 'blocked') {
			console.warn(`[Audit] 🚫 BLOCKED response - ${hallucinations.length} hallucinations, max severity: ${metrics.maxSeverity}`);
		} else if (action === 'redacted') {
			console.warn(`[Audit] ✂️ REDACTED ${hallucinations.length} claims from response`);
		} else if (action === 'warned') {
			console.log(`[Audit] ⚠️ Added warnings for ${hallucinations.length} unverified claims`);
		}
	}

	/**
	 * Start auto-flush timer
	 * @private
	 */
	_startAutoFlush() {
		this.flushTimer = setInterval(() => {
			this.flush();
		}, this.config.FLUSH_INTERVAL);
	}

	/**
	 * Flush entries to persistent storage
	 */
	async flush() {
		if (!this.config.ENABLE_PERSISTENCE || this.entries.length === 0) {
			return;
		}

		try {
			// Ensure directory exists
			const dir = path.dirname(this.config.LOG_FILE_PATH);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			// Load existing entries
			let existingEntries = [];
			if (fs.existsSync(this.config.LOG_FILE_PATH)) {
				try {
					const content = fs.readFileSync(this.config.LOG_FILE_PATH, 'utf8');
					existingEntries = JSON.parse(content);
				} catch (e) {
					console.error('[Audit] Error reading existing log file:', e.message);
				}
			}

			// Merge and trim
			const allEntries = [...existingEntries, ...this.entries];
			const trimmedEntries = allEntries.slice(-this.config.MAX_MEMORY_ENTRIES);

			// Write to file
			fs.writeFileSync(
				this.config.LOG_FILE_PATH,
				JSON.stringify(trimmedEntries, null, 2),
				'utf8'
			);

			console.log(`[Audit] Flushed ${this.entries.length} entries to disk`);
			this.entries = [];
		} catch (error) {
			console.error('[Audit] Error flushing to disk:', error.message);
		}
	}

	/**
	 * Get all entries (memory + disk)
	 * @returns {Array}
	 */
	getAllEntries() {
		let diskEntries = [];

		if (fs.existsSync(this.config.LOG_FILE_PATH)) {
			try {
				const content = fs.readFileSync(this.config.LOG_FILE_PATH, 'utf8');
				diskEntries = JSON.parse(content);
			} catch (e) {
				console.error('[Audit] Error reading log file:', e.message);
			}
		}

		return [...diskEntries, ...this.entries];
	}

	/**
	 * Search entries by criteria
	 * @param {Object} criteria - Search criteria
	 * @returns {Array}
	 */
	search(criteria = {}) {
		const allEntries = this.getAllEntries();

		return allEntries.filter(entry => {
			if (criteria.action && entry.action !== criteria.action) return false;
			if (criteria.minSeverity && entry.metrics.maxSeverity < criteria.minSeverity) return false;
			if (criteria.type && !entry.hallucinations.some(h => h.type === criteria.type)) return false;
			if (criteria.fromDate && new Date(entry.timestamp) < new Date(criteria.fromDate)) return false;
			if (criteria.toDate && new Date(entry.timestamp) > new Date(criteria.toDate)) return false;
			return true;
		});
	}

	/**
	 * Stop auto-flush and cleanup
	 */
	destroy() {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
		}
		this.flush();
	}
}

/**
 * Main Hallucination Audit System - Facade combining all audit components.
 */
class HallucinationAudit {
	/**
	 * @param {Object} config - Configuration options
	 */
	constructor(config = {}) {
		this.config = { ...AUDIT_CONFIG, ...config };
		this.logger = new AuditLogger(this.config);
		this.metrics = new MetricsCollector();
		this.incidents = new IncidentTracker();
	}

	/**
	 * Record a complete audit event
	 * @param {Object} data - Audit data
	 */
	record(data) {
		const startTime = Date.now();

		// Log the entry
		const entryId = this.logger.log(data);

		// Update metrics
		this.metrics.record({
			hallucinations: data.hallucinations,
			action: data.action,
			confidence: data.confidence,
			responseTimeMs: data.responseTimeMs || (Date.now() - startTime),
		});

		// Track incident if hallucinations detected
		if (data.hallucinations?.length > 0) {
			this.incidents.recordIncident({
				entryId,
				query: data.query,
				hallucinations: data.hallucinations,
				action: data.action,
			});
		}

		// Check for alerts
		const alerts = this.metrics.checkAlerts();
		if (alerts.length > 0) {
			this._handleAlerts(alerts);
		}

		return entryId;
	}

	/**
	 * Handle threshold alerts
	 * @private
	 */
	_handleAlerts(alerts) {
		for (const alert of alerts) {
			console.warn(`[Audit] ⚠️ ALERT: ${alert.message}`);
		}
	}

	/**
	 * Get comprehensive report
	 * @returns {Object}
	 */
	getReport() {
		return {
			metrics: this.metrics.getMetrics(),
			incidents: this.incidents.getSummary(),
			alerts: this.metrics.checkAlerts(),
			recentIncidents: this.incidents.getRecentIncidents(10),
		};
	}

	/**
	 * Get metrics only
	 * @returns {AuditMetrics}
	 */
	getMetrics() {
		return this.metrics.getMetrics();
	}

	/**
	 * Export audit data for analysis
	 * @returns {Object}
	 */
	export() {
		return {
			exportedAt: new Date().toISOString(),
			metrics: this.metrics.getMetrics(),
			incidents: this.incidents.getSummary(),
			entries: this.logger.getAllEntries(),
		};
	}

	/**
	 * Reset all audit data
	 */
	reset() {
		this.metrics.reset();
		this.incidents.clear();
		this.logger.entries = [];
	}

	/**
	 * Cleanup and persist
	 */
	destroy() {
		this.logger.destroy();
	}
}

// Singleton
let auditInstance = null;

/**
 * Get or create audit singleton
 * @param {Object} config - Configuration options
 * @returns {HallucinationAudit}
 */
const getAuditInstance = (config = {}) => {
	if (!auditInstance) {
		auditInstance = new HallucinationAudit(config);
	}
	return auditInstance;
};

module.exports = {
	HallucinationAudit,
	AuditLogger,
	MetricsCollector,
	IncidentTracker,
	getAuditInstance,
	AUDIT_CONFIG,
};
