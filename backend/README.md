# Verifik Smart Agent - Backend

AI-powered conversational agent for identity validation services. Supports documentation queries via RAG and real-time API execution with guided parameter collection.

## Overview

This backend provides an intelligent chat interface that:

- **Answers documentation questions** using Retrieval-Augmented Generation (RAG)
- **Executes API validations** with tool calling and guided flows
- **Differentiates user intent** automatically (documentation vs execution)
- **Validates responses** against source material to prevent hallucinations

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer (Koa)                         │
├─────────────────────────────────────────────────────────────────┤
│                      Agent Controller                           │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   RAG Module    │  Agent Module   │     Blockchain Module       │
│  ┌───────────┐  │  ┌───────────┐  │     ┌───────────────┐       │
│  │ Retriever │  │  │  Prompt   │  │     │   ERC-8004    │       │
│  │ (LanceDB) │  │  │  Builder  │  │     │  Validation   │       │
│  ├───────────┤  │  ├───────────┤  │     └───────────────┘       │
│  │ Validator │  │  │   Tool    │  │                             │
│  │(Grounding)│  │  │ Executor  │  │                             │
│  ├───────────┤  │  ├───────────┤  │                             │
│  │ Semantic  │  │  │Validation │  │                             │
│  │ Verifier  │  │  │ Pipeline  │  │                             │
│  └───────────┘  │  └───────────┘  │                             │
├─────────────────┴─────────────────┴─────────────────────────────┤
│                        AI Layer                                 │
│              (Gemini API + Embeddings)                          │
├─────────────────────────────────────────────────────────────────┤
│                     Data Layer                                  │
│         (LanceDB Vectors + Documentation Chunks)                │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flow

1. **Intent Classification** → Determines if query is documentation or execution
2. **RAG Retrieval** → Fetches relevant documentation chunks (for doc queries)
3. **Prompt Construction** → Builds context-aware prompt with mode-specific instructions
4. **LLM Generation** → Gemini processes and generates response
5. **Tool Execution** → If tool call detected, executes API and returns result
6. **Response Validation** → Validates claims against source material

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Framework | Koa 3.x |
| AI Provider | Google Gemini 2.0 Flash |
| Vector DB | LanceDB |
| Embeddings | Gemini text-embedding-004 |
| Blockchain | Ethers.js (Avalanche Fuji) |

## Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- Google AI API Key
- Verifik API Token

### Installation

```bash
cd backend
npm install
```

### Environment Variables

Create `.env.local`:

```env
GEMINI_API_KEY=your_gemini_api_key
VERIFIK_API_TOKEN=your_verifik_token
VERIFIK_API_URL=https://api.verifik.co
PRIVATE_KEY=your_wallet_private_key  # For ERC-8004 validation proofs
```

### Run

```bash
npm start
```

Server starts at `http://localhost:3000`

## Project Structure

```
src/
├── core/
│   ├── agent/          # Agent orchestration, prompts, tool execution
│   ├── ai/             # Gemini API client, embeddings
│   ├── blockchain/     # ERC-8004 validation registry
│   └── rag/            # Retriever, validator, semantic verification
├── controllers/        # HTTP request handlers
├── routes/             # API route definitions
├── data/               # LanceDB vectors, documentation chunks
└── prompts/            # System prompt templates
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Main chat endpoint |
| GET | `/api/agent/info` | Agent identity and reputation |
| GET | `/api/agent/card` | ERC-8004 agent card |

### Chat Request

```json
{
  "message": "What endpoints are available for Colombia?",
  "history": [],
  "mode": "credits"
}
```

### Chat Response

```json
{
  "content": "...",
  "response_type": "documentation",
  "rag_metadata": {
    "sources": [...],
    "groundedness": "grounded"
  }
}
```

## Key Design Decisions

### RAG with LanceDB

Chose LanceDB for vector storage due to:
- Embedded database (no external service required)
- Native Node.js support
- Fast approximate nearest neighbor search
- Simple persistence to disk

### Intent Classification

Two-tier classification approach:
1. **Keyword heuristics** for obvious patterns (fast path)
2. **Semantic similarity** for ambiguous queries (accurate path)

Returns: `documentation` | `execution` | `guided_flow`

### Hallucination Prevention

Multi-layer validation:
- **Groundedness scoring** against source chunks
- **Claim extraction** for fact verification
- **Source tracking** with confidence scores
- **Audit logging** for problematic responses

### Guided Execution Flow

When user requests API execution without all parameters:
1. Agent identifies missing required fields
2. Returns `guided_flow` response asking for data
3. User provides missing info
4. Agent executes with complete parameters
