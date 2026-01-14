/**
 * RAG Domain - Public API for retrieval-augmented generation.
 * @module core/rag
 */

'use strict';

const retriever = require('./retriever');
const { RAGValidator, GroundednessCalculator, HallucinationDetector, SourceTracker } = require('./validator');
const { ResponseSanitizer } = require('./sanitizer');
const { SemanticVerifier, ClaimExtractor, EmbeddingCache } = require('./semantic-verifier');
const constants = require('./constants');

module.exports = {
    // Retriever
    searchRelevantChunks: retriever.searchRelevantChunks,
    getRAGContext: retriever.getRAGContext,
    validateResponse: retriever.validateResponse,
    classifyIntent: retriever.classifyIntent,
    loadChunks: retriever.loadChunks,
    reloadCaches: retriever.reloadCaches,
    getValidator: retriever.getValidator,

    // Validator
    RAGValidator,
    GroundednessCalculator,
    HallucinationDetector,
    SourceTracker,

    // Sanitizer
    ResponseSanitizer,

    // Semantic
    SemanticVerifier,
    ClaimExtractor,
    EmbeddingCache,

    // Constants
    ...constants,
};
