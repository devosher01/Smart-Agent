/**
 * Validation Pipeline - Multi-layer hallucination prevention.
 * Single Responsibility: RAG validation and response sanitization.
 * @module agent/validation-pipeline
 */

'use strict';

const RAGModule = require('../rag');
const { GroundednessLevel, WARNING_MESSAGES } = require('../rag/constants');
const { SemanticVerifier } = require('../rag/semantic-verifier');
const { ResponseSanitizer } = require('../rag/sanitizer');
const { getAuditInstance } = require('../../infrastructure/audit');

class ValidationPipeline {
    constructor(embeddingsModule = null) {
        this.semanticVerifier = null;
        this.responseSanitizer = new ResponseSanitizer({ strictMode: false });
        this.auditSystem = getAuditInstance();

        if (embeddingsModule?.generateEmbedding) {
            this.semanticVerifier = new SemanticVerifier(embeddingsModule);
            console.log('[ValidationPipeline] ✅ Semantic verification enabled');
        }
    }

    /**
     * Classify user intent from query.
     */
    classifyIntent(query) {
        return RAGModule.classifyIntent(query);
    }

    /**
     * Retrieve RAG context for a query.
     */
    async getContext(query, options = { topK: 3, includeAntiHallucination: true }) {
        try {
            const ragResult = await RAGModule.getRAGContext(query, options);
            console.log(`[ValidationPipeline] RAG retrieved (${ragResult.context.length} chars, groundedness: ${ragResult.metadata.groundedness})`);
            return ragResult;
        } catch (err) {
            console.warn(`[ValidationPipeline] RAG error: ${err.message}`);
            return this._createEmptyResult();
        }
    }

    /**
     * Validate and sanitize an LLM response.
     */
    async validate(response, rawResults, options = {}) {
        const { query = '', metadata = {} } = options;
        const startTime = Date.now();

        if (!rawResults || rawResults.length === 0) {
            return { content: response, wasModified: false, action: 'passed', metadata };
        }

        // Layer 1: Pattern-based hallucination detection
        const postValidation = RAGModule.validateResponse(response, rawResults);

        // Layer 2: Semantic verification
        const semanticResults = await this._semanticVerify(response, rawResults);

        // Combine detections
        const allHallucinations = this._combineHallucinations(postValidation, semanticResults);

        // Layer 3: Response sanitization
        const sanitizationResult = allHallucinations.length > 0
            ? this.responseSanitizer.sanitize(response, allHallucinations, rawResults)
            : { content: response, action: 'passed', wasModified: false };

        // Layer 4: Audit logging
        this._audit(query, sanitizationResult, allHallucinations, metadata, startTime, rawResults);

        return {
            content: sanitizationResult.content,
            wasModified: sanitizationResult.wasModified,
            action: sanitizationResult.action,
            hallucinations: allHallucinations,
            metadata: this._buildValidationMetadata(postValidation, semanticResults, sanitizationResult, metadata),
        };
    }

    async _semanticVerify(response, rawResults) {
        if (!this.semanticVerifier) return [];

        try {
            const results = await this.semanticVerifier.verifyResponse(response, rawResults);
            console.log(`[ValidationPipeline] Semantic: ${results.filter(r => r.verified).length}/${results.length} verified`);
            return results;
        } catch (err) {
            console.warn('[ValidationPipeline] Semantic verification error:', err.message);
            return [];
        }
    }

    _combineHallucinations(patternResults, semanticResults) {
        const patternHallucinations = patternResults.detectedHallucinations || [];
        const semanticHallucinations = semanticResults
            .filter(r => !r.verified && r.confidence > 0.5)
            .map(r => ({
                type: r.claimType || 'unverified_claim',
                detected: r.claim,
                severity: 1 - r.confidence,
                source: 'semantic_verifier',
            }));

        return [...patternHallucinations, ...semanticHallucinations];
    }

    _audit(query, sanitizationResult, hallucinations, metadata, startTime, rawResults) {
        this.auditSystem.record({
            query,
            response: sanitizationResult.content,
            hallucinations,
            action: sanitizationResult.action || 'passed',
            confidence: metadata.avgScore || 0,
            responseTimeMs: Date.now() - startTime,
            sources: rawResults.slice(0, 3).map(r => ({ title: r.title, score: r.score })),
        });

        if (hallucinations.length > 0) {
            console.warn(`[ValidationPipeline] ⚠️ ${hallucinations.length} hallucination(s) detected`);
        }
    }

    _buildValidationMetadata(patternResults, semanticResults, sanitization, baseMetadata) {
        return {
            ...baseMetadata.validationResult,
            detectedHallucinations: this._combineHallucinations(patternResults, semanticResults),
            semanticVerification: semanticResults.length > 0 ? {
                totalClaims: semanticResults.length,
                verifiedClaims: semanticResults.filter(r => r.verified).length,
            } : null,
            sanitization: sanitization.wasModified ? {
                action: sanitization.action,
                wasModified: true,
            } : null,
        };
    }

    _createEmptyResult() {
        return {
            context: '',
            metadata: {
                sources: [],
                groundedness: GroundednessLevel.UNGROUNDED,
                avgScore: 0,
                confidence: 0,
                validationResult: {
                    isGrounded: false,
                    warnings: [WARNING_MESSAGES.NO_SOURCES],
                    detectedHallucinations: [],
                    status: 'unverifiable',
                },
                retrievedAt: new Date().toISOString(),
                totalSourcesConsidered: 0,
            },
            rawResults: [],
        };
    }
}

module.exports = { ValidationPipeline };
