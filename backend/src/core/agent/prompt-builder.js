/**
 * Prompt Builder - Constructs system prompts with RAG context.
 * Single Responsibility: Prompt construction and template loading.
 * @module agent/prompt-builder
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = path.resolve(__dirname, '../../prompts');

class PromptBuilder {
    constructor(toolsManifest) {
        this.tools = toolsManifest.endpoints || [];
        this._loadTemplates();
    }

    /**
     * Load prompt templates from files or use defaults.
     * @private
     */
    _loadTemplates() {
        this.templates = {
            base: this._loadTemplateFile('system-base.md') || this._getDefaultBasePrompt(),
            instructions: this._loadTemplateFile('response-instructions.md') || this._getDefaultInstructions(),
        };
    }

    /**
     * Load template file if exists.
     * @private
     */
    _loadTemplateFile(filename) {
        const filepath = path.join(PROMPTS_DIR, filename);
        if (fs.existsSync(filepath)) {
            return fs.readFileSync(filepath, 'utf8');
        }
        return null;
    }

    /**
     * Build full system prompt.
     */
    build(options = {}) {
        const {
            ragContext = '',
            ragMetadata = null,
            intent = 'documentation',
            paymentTx = null,
            images = [],
        } = options;

        let prompt = this._buildBaseSection(ragMetadata);
        prompt += this._buildModeSection(intent);
        prompt += this._buildRAGSection(ragContext);
        prompt += this._buildToolsSection();
        prompt += this._buildInstructionsSection();
        prompt += this._buildImageSection(images);
        prompt += this._buildContextSection(paymentTx);

        return prompt;
    }

    /**
     * Build conversation prompt (base + history + user message).
     */
    buildFull(options = {}) {
        const { history = [], userMessage = '' } = options;
        let fullPrompt = this.build(options);

        fullPrompt += '\n\n## 💬 CONVERSATION HISTORY\n';
        const recentHistory = history.slice(-10);
        recentHistory.forEach(msg => {
            const role = msg.role === 'user' ? '**User**' : '**Assistant**';
            fullPrompt += `${role}: ${msg.content}\n\n`;
        });

        fullPrompt += `**User**: ${userMessage}\n`;
        return fullPrompt;
    }

    _buildBaseSection(ragMetadata) {
        let section = `
You are a **specialized AI Assistant for identity validation** by Verifik.
Your goal is to help users to:
1. **Answer questions** about Verifik's documentation and API endpoints
2. **Execute validations** when the user provides specific data
`;
        if (ragMetadata?.groundedness === 'ungrounded') {
            section += `
## ⚠️ CRITICAL NOTICE: NO DOCUMENTATION FOUND
No relevant documentation was found for this query.
**INSTRUCTIONS:**
1. For greetings, respond politely.
2. For specific questions, state: "I don't have information about that topic in the current documentation."
`;
        }
        return section;
    }

    _buildModeSection(intent) {
        const modeDescriptions = {
            documentation: 'The user is asking about documentation. Respond based on the provided documentation.',
            hybrid: 'The user might want information OR execute an action. Provide info and offer to execute.',
            execution: 'The user wants to execute a validation. Use the available tools.',
        };
        return `\n## 🎯 CURRENT MODE: ${intent.toUpperCase()}\n${modeDescriptions[intent] || modeDescriptions.documentation}\n`;
    }

    _buildRAGSection(ragContext) {
        if (!ragContext) return '';
        return `\n## 📚 DOCUMENTATION CONTEXT\n${ragContext}\n`;
    }

    _buildToolsSection() {
        return `\n## 🛠️ AVAILABLE TOOLS\n${JSON.stringify(this.tools, null, 2)}\n`;
    }

    _buildInstructionsSection() {
        return `
## 📋 RESPONSE INSTRUCTIONS
- **ALWAYS RESPOND IN ENGLISH** unless explicitly told otherwise.

### For DOCUMENTATION questions:
- Use **Markdown** with headers, lists, and code blocks
- If you don't have the information, say so naturally without referencing "provided documentation"

### 📊 PROACTIVE TABLE FORMATTING:
When presenting structured information (endpoints, pricing, services), use tables:
| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

### For TOOL EXECUTION (GUIDED FLOW):
1. Identify the service needed
2. Check for required parameters
3. Ask for missing data before executing
4. Confirm before execution
5. Execute: {"tool": "tool_id", "args": { ... }}

**RULES:**
- NEVER execute with missing required parameters
- NEVER guess parameter values
`;
    }

    _buildImageSection(images) {
        if (!images || images.length === 0) return '';
        return `
## 🖼️ IMAGE PROCESSING
- You have received ${images.length} image(s)
- Analyze to identify document type and extract data
`;
    }

    _buildContextSection(paymentTx) {
        return `\n## 📝 CURRENT CONTEXT\n- Available payment: ${paymentTx || 'None'}\n`;
    }

    _getDefaultBasePrompt() {
        return 'You are an AI assistant for Verifik identity validation services.';
    }

    _getDefaultInstructions() {
        return 'Respond helpfully and accurately based on available documentation.';
    }
}

module.exports = { PromptBuilder };
