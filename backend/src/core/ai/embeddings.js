const axios = require("axios");
const config = require("../../config");

/**
 * Retrieves the Google API Key
 */
const getApiKey = () => {
	const apiKey = config.google.apiKey || process.env.GOOGLE_API_KEY;
	if (!apiKey) {
		throw new Error("GOOGLE_API_KEY not configured. Get one at https://aistudio.google.com/");
	}
	return apiKey;
};

/**
 * Generates an embedding for a text using Gemini
 * @param {string} text - Text to embed
 * @returns {number[]} - Vector of 768 dimensions
 */
const generateEmbedding = async (text) => {
	const apiKey = getApiKey();

	const response = await axios.post(
		`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
		{
			content: {
				parts: [{ text }],
			},
			taskType: "RETRIEVAL_DOCUMENT",
		},
		{
			headers: {
				"Content-Type": "application/json",
			},
		}
	);

	return response.data.embedding.values;
};

/**
 * Generates an embedding for a search query
 * @param {string} query - User query
 * @returns {number[]} - Vector of 768 dimensions
 */
const generateQueryEmbedding = async (query) => {
	const apiKey = getApiKey();

	const response = await axios.post(
		`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
		{
			content: {
				parts: [{ text: query }],
			},
			taskType: "RETRIEVAL_QUERY", // Different for queries
		},
		{
			headers: {
				"Content-Type": "application/json",
			},
		}
	);

	return response.data.embedding.values;
};

/**
 * Calculates cosine similarity between two vectors
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} - Similarity between 0 and 1
 */
const cosineSimilarity = (vecA, vecB) => {
	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < vecA.length; i++) {
		dotProduct += vecA[i] * vecB[i];
		normA += vecA[i] * vecA[i];
		normB += vecB[i] * vecB[i];
	}

	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

module.exports = {
	generateEmbedding,
	generateQueryEmbedding,
	cosineSimilarity,
	getApiKey,
};
