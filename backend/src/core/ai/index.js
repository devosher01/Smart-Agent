/**
 * AI Providers - Public API for AI services.
 * @module core/ai
 */

'use strict';

const gemini = require('./gemini');
const embeddings = require('./embeddings');

module.exports = {
    // Gemini
    GeminiModule: gemini,
    getServiceAccountToken: gemini.getServiceAccountToken,

    // Embeddings
    generateQueryEmbedding: embeddings.generateQueryEmbedding,
    cosineSimilarity: embeddings.cosineSimilarity,
};
