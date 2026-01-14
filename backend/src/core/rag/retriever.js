/**
 * RAG Retriever - Pinecone Cloud Vector Database
 * Handles semantic search and document retrieval
 * @module core/rag/retriever
 */

const fs = require("fs");
const path = require("path");
const { Pinecone } = require("@pinecone-database/pinecone");
const { generateQueryEmbedding, cosineSimilarity } = require("../ai/embeddings");
const { RAGValidator } = require("./validator");
const { ANTI_HALLUCINATION_PROMPT, GroundednessLevel, DEFAULT_CONFIG } = require("./constants");

const ragValidator = new RAGValidator();

// Paths to data files (for ingestion)
const CHUNKS_PATH = path.resolve(__dirname, "../../data/documentation-chunks.json");

// Pinecone Configuration
const PINECONE_INDEX_NAME = "verifik-docs";

// Pinecone Client Singleton
let pineconeClient = null;
let pineconeIndex = null;

/**
 * Initialize Pinecone client and index
 * @returns {Promise<Object>} Pinecone index instance
 */
const getIndex = async () => {
	if (pineconeIndex) return pineconeIndex;

	try {
		if (!pineconeClient) {
			pineconeClient = new Pinecone({
				apiKey: process.env.PINECONE_API_KEY,
			});
		}

		pineconeIndex = pineconeClient.index(PINECONE_INDEX_NAME);
		console.log(`[RAG] Connected to Pinecone index: ${PINECONE_INDEX_NAME}`);
		return pineconeIndex;
	} catch (err) {
		console.error("[RAG] Failed to connect to Pinecone:", err.message);
		return null;
	}
};

/**
 * Load documentation chunks from file (for ingestion)
 * @returns {Array} Array of documentation chunks
 */
const loadChunks = () => {
	if (!fs.existsSync(CHUNKS_PATH)) {
		console.warn("[RAG] documentation-chunks.json not found");
		return [];
	}
	return JSON.parse(fs.readFileSync(CHUNKS_PATH, "utf8"));
};

/**
 * Search for the most relevant chunks using Pinecone
 * @param {string} query - User question
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} Most relevant chunks with scores
 */
const searchRelevantChunks = async (query, topK = 5) => {
	const index = await getIndex();

	if (!index) {
		console.warn("[RAG] Pinecone not available, skipping search");
		return [];
	}

	// Generate query embedding
	console.log(`[RAG] Generating embedding for query: "${query.substring(0, 50)}..."`);
	const queryEmbedding = await generateQueryEmbedding(query);

	// Execute semantic search in Pinecone
	const results = await index.query({
		vector: queryEmbedding,
		topK: topK * 2, // Fetch more for dedup
		includeMetadata: true,
	});

	// Map to application format
	const mappedResults = results.matches.map(match => {
		// Parse parameters if stored as JSON string
		let params = [];
		try {
			params = match.metadata?.parameters_json
				? JSON.parse(match.metadata.parameters_json)
				: [];
		} catch (e) {
			params = [];
		}

		return {
			id: match.id,
			score: match.score, // Pinecone returns similarity score directly
			chunk: {
				id: match.id,
				title: match.metadata?.title,
				content: match.metadata?.content,
				source: match.metadata?.source,
				slug: match.metadata?.slug,
				method: match.metadata?.method,
				price: match.metadata?.price,
				parameters: params,
				parentId: match.metadata?.parentId,
				endpoint: match.metadata?.slug,
			}
		};
	});

	console.log(
		`[RAG] Top ${topK} results (Pinecone):`,
		mappedResults.slice(0, topK).map((r) => ({
			title: r.chunk?.title?.substring(0, 50),
			score: r.score.toFixed(4),
		}))
	);

	return mappedResults;
};

/**
 * @typedef {Object} RAGContextResult
 * @property {string} context - Formatted context string for the prompt
 * @property {Object} metadata - RAG metadata including sources, groundedness, and validation
 * @property {Array} rawResults - Raw search results for post-generation validation
 */

/**
 * Generate documentation context for the prompt with full traceability
 * @param {string} query - User question
 * @param {Object} options - Configuration options
 * @param {number} [options.topK=5] - Number of results to retrieve
 * @param {boolean} [options.includeAntiHallucination=true] - Include anti-hallucination instructions
 * @returns {Promise<RAGContextResult>} Context with metadata for traceability
 */
const getRAGContext = async (query, options = {}) => {
	const { topK = 5, includeAntiHallucination = true } = options;

	let relevantChunks = await searchRelevantChunks(query, topK * 2);

	// Deduplicate chunks based on content
	const seenContent = new Set();
	relevantChunks = relevantChunks.filter(r => {
		const signature = (r.chunk.content || "").substring(0, 50) + (r.chunk.title || "");
		if (seenContent.has(signature)) return false;
		seenContent.add(signature);
		return true;
	}).slice(0, topK);

	// Pre-filter: Remove low-scoring chunks
	const validChunks = relevantChunks.filter(r => r.score >= DEFAULT_CONFIG.minScoreThreshold);

	// Process through validator
	const metadata = ragValidator.processResults(validChunks);

	if (validChunks.length === 0) {
		return {
			context: "No relevant documentation found for this query.",
			metadata: {
				...metadata,
				groundedness: GroundednessLevel.UNGROUNDED,
			},
			rawResults: [],
		};
	}

	// Build formatted context string
	let context = "## 📚 RELEVANT DOCUMENTATION (Retrieved via Semantic Search)\n\n";
	context += `> **Sources Found:** ${metadata.sources.length} | `;
	context += `**Confidence:** ${metadata.confidence}% | `;
	context += `**Groundedness:** ${metadata.groundedness.toUpperCase()}\n\n`;

	for (const result of validChunks) {
		const chunk = result.chunk;
		if (!chunk) continue;

		context += `### ${chunk.title || "Untitled"}\n`;
		context += `**Relevance Score:** ${(result.score * 100).toFixed(1)}%\n`;
		context += `**Source:** \`${chunk.source || "N/A"}\`\n\n`;
		context += `${chunk.content}\n\n`;

		if (chunk.endpoint) context += `**Endpoint:** \`${chunk.endpoint}\`\n`;
		if (chunk.method) context += `**Method:** ${chunk.method}\n`;
		if (chunk.parameters && chunk.parameters.length > 0) {
			context += `**Parameters:** ${JSON.stringify(chunk.parameters)}\n`;
		}
		if (chunk.price) context += `**Price:** $${chunk.price}\n`;

		context += "\n---\n\n";
	}

	if (includeAntiHallucination) {
		context += ANTI_HALLUCINATION_PROMPT;
	}

	return {
		context,
		metadata,
		rawResults: relevantChunks,
	};
};

/**
 * Validate an LLM response against the source material
 * @param {string} response - LLM generated response
 * @param {Array} rawResults - Raw search results used for context
 * @returns {Object} Validation result with detected hallucinations
 */
const validateResponse = (response, rawResults) => {
	return ragValidator.validateResponse(response, rawResults);
};

/**
 * Full validation pipeline: retrieve context + validate response
 * @param {string} query - User question
 * @param {string} response - LLM generated response
 * @returns {Promise<Object>} Full RAG metadata with validation results
 */
const getFullValidation = async (query, response) => {
	const { rawResults } = await getRAGContext(query);
	return ragValidator.fullValidation(rawResults, response);
};

/**
 * Classify user intent from query
 * @param {string} query - User question
 * @returns {string} 'documentation' | 'execution' | 'hybrid'
 */
const classifyIntent = (query) => {
	const queryLower = query.toLowerCase();

	// Documentation keywords
	const docKeywords = [
		"what does", "how does", "how to", "what is", "explain",
		"documentation", "help", "parameters", "example", "how much",
		"price", "cost", "countries", "available", "what types",
		"difference", "which", "list", "show", "information",
		// Spanish
		"qué hace", "que hace", "cómo funciona", "como funciona",
		"parámetros", "parametros", "ejemplo", "cuánto cuesta",
		"cuanto cuesta", "precio", "qué es", "que es", "explicar",
		"explica", "documentación", "ayuda", "países", "paises",
		"disponible", "qué tipos", "que tipos", "diferencia",
		"cuáles", "cuales", "listar", "mostrar", "información", "informacion",
	];

	// Execution keywords
	const execKeywords = [
		"validate", "verify", "check", "search", "run", "execute", "lookup", "fetch", "get",
		// Spanish
		"valida", "verifica", "consulta", "busca", "ejecuta",
	];

	const hasDocumentNumber = /\d{6,}/.test(query);
	const hasPlate = /[A-Z]{3}[\s-]?\d{3}|[A-Z]{2}[\s-]?\d{4}/i.test(query);

	const hasDocKeyword = docKeywords.some((kw) => queryLower.includes(kw));
	const hasExecKeyword = execKeywords.some((kw) => queryLower.includes(kw));

	if ((hasDocumentNumber || hasPlate) && hasExecKeyword) return "execution";
	if (hasDocKeyword && !hasDocumentNumber && !hasPlate) return "documentation";
	if (hasExecKeyword && !hasDocumentNumber && !hasPlate) return "hybrid";
	if (hasDocumentNumber || hasPlate) return "execution";

	return "documentation";
};

/**
 * Reload caches (useful after re-ingesting)
 */
const reloadCaches = () => {
	pineconeIndex = null;
	console.log("[RAG] Pinecone connection will be refreshed on next query");
};

/**
 * Get the RAG validator instance for direct access
 * @returns {RAGValidator}
 */
const getValidator = () => ragValidator;

module.exports = {
	searchRelevantChunks,
	getRAGContext,
	validateResponse,
	getFullValidation,
	classifyIntent,
	loadChunks,
	reloadCaches,
	getValidator,
	getIndex,
};
