/**
 * Agent Module - Main facade for AI agent functionality.
 * Delegates to specialized modules following SRP.
 * @module agent
 */

'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers } = require('ethers');

const config = require('../../config');
const GeminiModule = require('../ai/gemini');
const ERC8004Module = require('../blockchain/erc8004');

const { ToolExecutor } = require('./tool-executor');
const { PromptBuilder } = require('./prompt-builder');
const { ValidationPipeline } = require('./validation-pipeline');

// Configuration
const MODELS = {
    DEFAULT: 'gemini-2.5-flash-lite',
    POWERFUL: 'gemini-2.5-flash',
};
const DEFAULT_MODEL = MODELS.DEFAULT;
const API_VERSION = 'v1beta';

// Load tools manifest
const toolsPath = path.resolve(__dirname, '../../config/tools-manifest.json');
const toolsDef = JSON.parse(fs.readFileSync(toolsPath, 'utf8'));

// Initialize components
const toolExecutor = new ToolExecutor(toolsDef);
const promptBuilder = new PromptBuilder(toolsDef);
let validationPipeline = null;

/**
 * Initialize hallucination prevention with embeddings module.
 */
const initializeHallucinationPrevention = (embeddingsModule) => {
    validationPipeline = new ValidationPipeline(embeddingsModule);
    console.log('[Agent] ✅ Hallucination prevention initialized');
};

// Create default validation pipeline if not initialized
if (!validationPipeline) {
    validationPipeline = new ValidationPipeline();
}

/**
 * Chat with the Agent.
 */
const chatWithAgent = async (
    userMessage,
    history = [],
    paymentTx = null,
    paymentWallet = null,
    paymentAmount = null,
    mode = 'x402',
    userToken = null,
    images = []
) => {
    console.log(`[Agent] Processing: "${userMessage?.substring(0, 50)}..."`);

    // 1. Classify intent
    const intent = validationPipeline.classifyIntent(userMessage);
    console.log(`[Agent] Intent: ${intent}`);

    // 2. Retrieve RAG context
    let ragContext = '';
    let ragMetadata = null;
    let rawResults = [];

    if (intent === 'documentation' || intent === 'hybrid') {
        const ragResult = await validationPipeline.getContext(userMessage);
        ragContext = ragResult.context;
        ragMetadata = ragResult.metadata;
        rawResults = ragResult.rawResults;
    }

    // 3. Build prompt
    const fullPrompt = promptBuilder.buildFull({
        ragContext,
        ragMetadata,
        intent,
        paymentTx,
        images,
        history,
        userMessage,
    });

    // 4. Call AI Provider
    try {
        const responseText = await callGemini(fullPrompt, images);
        console.log('[Agent] Response received');

        // 5. Validate and sanitize response
        let finalResponse = responseText;
        let validationResult = null;

        if (ragMetadata && rawResults.length > 0) {
            validationResult = await validationPipeline.validate(responseText, rawResults, {
                query: userMessage,
                metadata: ragMetadata,
            });
            finalResponse = validationResult.content;

            if (validationResult.wasModified) {
                console.log(`[Agent] Response sanitized: ${validationResult.action}`);
            }
        }

        // 6. Check for tool calls
        const toolCallResult = await checkAndExecuteToolCall(
            responseText,
            { paymentTx, paymentWallet, paymentAmount, userToken },
            ragMetadata
        );
        if (toolCallResult) return toolCallResult;

        // 7. Handle blocked responses
        if (validationResult?.action === 'blocked') {
            return {
                role: 'assistant',
                content: validationResult.content,
                rag_metadata: ragMetadata,
                hallucination_blocked: true,
            };
        }

        // 8. Build response
        return buildAgentResponse(finalResponse, ragMetadata, intent);

    } catch (error) {
        console.error('[Agent] Error:', error.message);
        throw new Error(`Failed to communicate with AI Agent: ${error.message}`);
    }
};

/**
 * Call Gemini API.
 */
async function callGemini(prompt, images = []) {
    const accessToken = await GeminiModule.getServiceAccountToken();
    let url = `https://generativelanguage.googleapis.com/${API_VERSION}/models/${DEFAULT_MODEL}:generateContent`;

    if (!accessToken && config.google.apiKey) {
        url += `?key=${config.google.apiKey}`;
    }

    const parts = [{ text: prompt }];
    if (images?.length > 0) {
        images.forEach(img => {
            parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
        });
    }

    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await axios.post(url, {
        contents: [{ parts }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            stopSequences: ['User:', 'System:'],
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
    }, { headers });

    return response.data.candidates[0].content.parts[0].text;
}

/**
 * Check for tool call in response and execute if found.
 */
async function checkAndExecuteToolCall(responseText, paymentOptions, ragMetadata) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
        const toolCall = JSON.parse(jsonMatch[0]);
        if (!toolCall.tool || !toolCall.args) return null;

        console.log('[Agent] Tool call detected:', toolCall.tool);

        const result = await toolExecutor.execute(toolCall.tool, toolCall.args, paymentOptions);

        if (result.status === 'payment_required') {
            return {
                role: 'assistant',
                content: 'I need to perform a paid action. Please confirm payment.',
                tool_call: toolCall,
                payment_required: result.details,
                rag_metadata: ragMetadata,
            };
        }

        if (result.status === 'error') {
            return {
                role: 'assistant',
                content: `Tool execution error: ${result.error}`,
                rag_metadata: ragMetadata,
            };
        }

        // Record validation proof on-chain
        const proof = await recordValidationProof(toolCall.tool, toolCall.args, result.data, paymentOptions.paymentTx);

        return {
            role: 'assistant',
            content: 'Tool executed successfully.',
            data: result.data,
            proof,
            rag_metadata: ragMetadata,
        };
    } catch (e) {
        console.warn('[Agent] Failed to parse tool call:', e.message);
        return null;
    }
}

/**
 * Build the final agent response object.
 */
function buildAgentResponse(content, ragMetadata, intent) {
    const hasToolExecution = content.includes('{"tool":');
    let responseType = 'documentation';
    if (hasToolExecution) responseType = 'api_execution';
    else if (intent === 'action') responseType = 'guided_flow';

    const response = {
        role: 'assistant',
        content,
        response_type: responseType,
    };

    if (ragMetadata) {
        const shouldIncludeSources = responseType === 'documentation' && ragMetadata.groundedness !== 'ungrounded';
        response.rag_metadata = {
            sources: shouldIncludeSources ? ragMetadata.sources : [],
            groundedness: ragMetadata.groundedness,
            avgScore: ragMetadata.avgScore,
            confidence: ragMetadata.confidence,
            validationResult: ragMetadata.validationResult,
            retrievedAt: ragMetadata.retrievedAt,
        };
    }

    return response;
}

/**
 * Record validation proof on ERC8004 Validation Registry.
 */
async function recordValidationProof(toolName, args, result, paymentTx) {
    if (!config.erc8004?.agentTokenId) {
        console.log('[Agent] ERC8004 not configured, skipping');
        return null;
    }

    try {
        const agentTokenId = parseInt(config.erc8004.agentTokenId);
        const taskId = `${toolName}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        const output = JSON.stringify({
            tool: toolName,
            args,
            result,
            timestamp: new Date().toISOString(),
            paymentTx,
        });

        const outputHash = ERC8004Module.hashOutput(output);
        const proofHash = paymentTx ? ethers.keccak256(ethers.toUtf8Bytes(paymentTx)) : outputHash || ethers.ZeroHash;

        const signer = ERC8004Module.getAgentWallet();
        if (!signer) {
            console.warn('[Agent] No agent wallet available');
            return null;
        }

        const validationHash = await ERC8004Module.recordValidation(
            signer,
            agentTokenId,
            taskId,
            output,
            proofHash,
            ethers.ZeroAddress,
            0,
            true,
            ''
        );

        console.log(`[Agent] Validation proof: ${validationHash}`);
        return validationHash;
    } catch (error) {
        console.error('[Agent] Validation proof error:', error.message);
        return null;
    }
}

/**
 * Get agent identity and reputation info.
 */
const getAgentInfo = async () => {
    const agentTokenId = config.erc8004?.agentTokenId;
    if (!agentTokenId) return null;

    const identity = await ERC8004Module.getAgentIdentity(agentTokenId);
    const reputation = await ERC8004Module.getReputation(agentTokenId);
    const feedbacks = await ERC8004Module.getAgentFeedbacks(agentTokenId);

    return { identity, reputation, feedbacks };
};

/**
 * Get agent card in ERC8004 format.
 */
const getAgentCard = async () => {
    const agentTokenId = config.erc8004?.agentTokenId;
    if (!agentTokenId) return null;

    try {
        const identity = await ERC8004Module.getAgentIdentity(agentTokenId);
        if (!identity) return null;

        return {
            name: identity.name || 'Verifik AI Agent',
            description: identity.description || 'AI-powered identity validation agent using x402 protocol',
            image: 'https://verifik.app/images/agent-avatar.png',
            external_url: 'https://verifik.app',
            attributes: [
                { trait_type: 'Agent Type', value: 'Identity Verification' },
                { trait_type: 'Protocol', value: 'x402' },
                { trait_type: 'Network', value: 'Avalanche C-Chain' },
                { trait_type: 'Status', value: identity.active ? 'Active' : 'Inactive' },
            ],
            capabilities: identity.capabilities || [
                'identity-validation',
                'document-ocr',
                'biometric-verification',
                'x402-payment-processing',
            ],
            agentAddress: identity.agentAddress,
            tokenId: agentTokenId,
            registryContract: config.erc8004?.identityRegistry || '0x7c6a168455C94092f8d51aBC515B73f4Ed9813a6',
            network: config.x402?.networkName || 'avalanche-fuji-testnet',
            chainId: Number(config.x402?.chainId) || 43113,
        };
    } catch (error) {
        console.error('[Agent] Error getting agent card:', error.message);
        return null;
    }
};

module.exports = {
    chatWithAgent,
    initializeHallucinationPrevention,
    getAgentInfo,
    getAgentCard,
};
