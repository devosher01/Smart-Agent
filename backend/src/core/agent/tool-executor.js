/**
 * Tool Executor - Executes API tools via Verifik Backend.
 * Single Responsibility: Tool execution and payment handling.
 * @module agent/tool-executor
 */

'use strict';

const axios = require('axios');
const config = require('../../config');

/**
 * @typedef {Object} ToolExecutionResult
 * @property {'success'|'error'|'payment_required'} status
 * @property {Object} [data] - Response data on success
 * @property {string} [error] - Error message on failure
 * @property {Object} [details] - Payment details when payment_required
 */

class ToolExecutor {
    constructor(toolsManifest) {
        this.tools = toolsManifest.endpoints || [];
        this.proxyBaseUrl = `http://localhost:${config.port}`;
    }

    /**
     * Execute a tool call via Verifik Backend.
     * @param {string} toolName - Tool identifier
     * @param {Object} args - Tool arguments
     * @param {Object} options - Execution options
     * @returns {Promise<ToolExecutionResult>}
     */
    async execute(toolName, args, options = {}) {
        const { paymentTx, paymentWallet, paymentAmount, userToken } = options;

        const tool = this.tools.find(t => t.id === toolName);
        if (!tool) {
            return { status: 'error', error: `Tool ${toolName} not found` };
        }

        const url = this._resolveUrl(tool.url);
        const headers = this._buildHeaders(paymentTx, paymentWallet, paymentAmount, userToken);

        try {
            console.log(`[ToolExecutor] Executing ${toolName} at ${url}`);

            const axiosConfig = {
                method: tool.method,
                url,
                headers,
                validateStatus: status => status < 500,
            };

            if (tool.method === 'GET') {
                axiosConfig.params = args;
            } else {
                axiosConfig.data = args;
            }

            const response = await axios(axiosConfig);

            return this._processResponse(response, tool, toolName, userToken);

        } catch (error) {
            console.error(`[ToolExecutor] Failed:`, error.message);
            return { status: 'error', error: error.message };
        }
    }

    /**
     * Resolve proxy URL for local development.
     * @private
     */
    _resolveUrl(originalUrl) {
        if (originalUrl.startsWith('https://x402-agent.verifik.co')) {
            return originalUrl.replace('https://x402-agent.verifik.co', this.proxyBaseUrl);
        }
        if (originalUrl.startsWith('https://verifik.app')) {
            return originalUrl.replace('https://verifik.app', this.proxyBaseUrl);
        }
        return originalUrl;
    }

    /**
     * Build request headers with authentication and payment info.
     * @private
     */
    _buildHeaders(paymentTx, paymentWallet, paymentAmount, userToken) {
        const headers = {
            'Content-Type': 'application/json',
            Authorization: userToken
                ? `Bearer ${userToken}`
                : `Bearer ${config.verifik.serviceToken}`,
        };

        if (paymentTx) headers['x-payment-tx'] = paymentTx;
        if (paymentWallet) headers['x-wallet-address'] = paymentWallet;
        if (paymentAmount) headers['x-payment-amount'] = paymentAmount;

        return headers;
    }

    /**
     * Process API response and determine result status.
     * @private
     */
    _processResponse(response, tool, toolName, userToken) {
        if (response.status === 402) {
            return this._handlePaymentRequired(response, tool, toolName, userToken);
        }

        if (response.status >= 400) {
            const errorMsg = response.data?.error || response.data?.message || 'Unknown Backend Error';
            return { status: 'error', error: `Backend returned ${response.status}: ${errorMsg}` };
        }

        console.log(`[ToolExecutor] Success for ${toolName}`);
        return { status: 'success', data: response.data };
    }

    /**
     * Handle 402 Payment Required response.
     * @private
     */
    _handlePaymentRequired(response, tool, toolName, userToken) {
        if (userToken) {
            return {
                status: 'error',
                error: 'Insufficient Credits. Please top up your account or switch to x402 mode.',
            };
        }

        const details = typeof response.data === 'object' && response.data !== null
            ? response.data
            : { message: response.data };

        // Override with configured payment contract
        if (config.x402?.contractAddress) {
            details.receiver_address = config.x402.contractAddress;
            details.chain_id = config.x402.chainId;
        }

        return {
            status: 'payment_required',
            details: {
                ...details,
                endpoint: tool.url,
                toolName,
            },
        };
    }

    /**
     * Find tool definition by ID.
     */
    getTool(toolName) {
        return this.tools.find(t => t.id === toolName);
    }
}

module.exports = { ToolExecutor };
