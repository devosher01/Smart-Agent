# Verifik Smart Agent - Backend

AI-powered conversational agent for identity validation services. Supports documentation queries via RAG and real-time API execution with guided parameter collection.

## Overview

This backend provides an intelligent chat interface that:

- **Answers documentation questions** using Retrieval-Augmented Generation (RAG) with Pinecone
- **Executes API validations** with tool calling and guided flows
- **Differentiates user intent** automatically (documentation vs execution)
- **Validates responses** against source material to prevent hallucinations
- **Provides inline citations** with links to documentation sources

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
│  │(Pinecone) │  │  │  Builder  │  │     │  Validation   │       │
│  ├───────────┤  │  ├───────────┤  │     └───────────────┘       │
│  │ Validator │  │  │   Tool    │  │                             │
│  │(Grounding)│  │  │ Executor  │  │                             │
│  ├───────────┤  │  ├───────────┤  │                             │
│  │ Semantic  │  │  │Validation │  │                             │
│  │ Verifier  │  │  │ Pipeline  │  │                             │
│  └───────────┘  │  └───────────┘  │                             │
├─────────────────┴─────────────────┴─────────────────────────────┤
│                        AI Layer                                 │
│              (Gemini API + Pinecone Embeddings)                 │
├─────────────────────────────────────────────────────────────────┤
│                     Data Layer                                  │
│      (Pinecone Vectors with Integrated Embeddings)              │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flow

1. **Intent Classification** → Determines if query is documentation or execution
2. **RAG Retrieval** → Fetches relevant documentation chunks from Pinecone
3. **Source Filtering** → Focuses on primary document for cleaner citations
4. **Prompt Construction** → Builds context-aware prompt with numbered sources
5. **LLM Generation** → Gemini processes and generates response with inline citations
6. **Response Validation** → Validates claims against source material

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Framework | Koa 3.x |
| AI Provider | Google Gemini 2.5 Flash |
| Vector DB | Pinecone (Integrated Embeddings) |
| Embeddings | multilingual-e5-large (via Pinecone) |
| Blockchain | Ethers.js (Avalanche Fuji) |

## Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- Google AI API Key
- Pinecone API Key
- Verifik API Token

### Installation

```bash
cd backend
npm install
```

### Environment Variables

Create `.env.local`:

```env
# AI Provider
GOOGLE_API_KEY=your_gemini_api_key

# Vector Database
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=verifik-docs-v3

# Verifik API
VERIFIK_TOKEN=your_verifik_token
VERIFIK_API_URL=https://api.verifik.co

# Optional: Blockchain (ERC-8004)
PRIVATE_KEY=your_wallet_private_key
```

### Run

```bash
npm start
```

Server starts at `http://localhost:3060`

### Ingest Documentation

To update the RAG knowledge base:

```bash
npm run ingest
```

This processes markdown files from the Verifik documentation and uploads them to Pinecone.

## Project Structure

```
src/
├── core/
│   ├── agent/          # Agent orchestration, prompts, tool execution
│   │   ├── index.js           # Main agent module
│   │   ├── prompt-builder.js  # Context-aware prompt construction
│   │   ├── tool-executor.js   # API execution handler
│   │   └── validation-pipeline.js  # Multi-layer response validation
│   ├── ai/             # Gemini API client
│   ├── blockchain/     # ERC-8004 validation registry
│   └── rag/            # RAG system
│       ├── retriever.js    # Pinecone search, URL generation
│       ├── validator.js    # Groundedness, source tracking
│       ├── sanitizer.js    # Response cleanup
│       └── constants.js    # Thresholds, prompts
├── controllers/        # HTTP request handlers
├── repositories/       # Data persistence (conversations)
├── infrastructure/     # Audit logging, hallucination tracking
└── routes/             # API route definitions

scripts/
└── ingest.mjs          # Documentation ingestion pipeline
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/agent/chat` | Main chat endpoint |
| GET | `/api/agent/info` | Agent identity and capabilities |
| GET | `/api/agent/agent-card.json` | ERC-8004 agent card |
| GET | `/api/agent/conversations` | List user conversations |
| GET | `/api/agent/history/:id` | Get conversation history |

### Chat Request

```json
{
  "message": "What endpoints are available for Colombia?",
  "conversationId": "optional-uuid",
  "mode": "credits"
}
```

### Chat Response

```json
{
  "role": "assistant",
  "content": "Colombia offers several verification endpoints [1]...",
  "response_type": "documentation",
  "rag_metadata": {
    "sources": [
      {
        "number": 1,
        "title": "Colombian Identity Verification > Endpoint",
        "url": "https://docs.verifik.co/identity/colombia",
        "score": 0.72
      }
    ],
    "groundedness": "high",
    "avgScore": 0.68
  }
}
```

## Key Features

### RAG with Pinecone

- **Integrated Embeddings**: Uses `multilingual-e5-large` model directly in Pinecone
- **Smart Chunking**: Documents split by headers with breadcrumb context
- **Primary Document Filtering**: Focuses citations on most relevant document
- **Anchor URLs**: Links point to specific sections (#response, #request, etc.)

### Intent Classification

Three response types:
- `documentation` - Informational queries about APIs, features, pricing
- `api_execution` - Direct API calls with tool execution
- `guided_flow` - Interactive parameter collection for incomplete requests

### Hallucination Prevention

Multi-layer validation system:
- **Groundedness Scoring** - Measures response alignment with sources
- **Pattern Detection** - Catches common hallucination patterns
- **Semantic Verification** - Validates claims against embeddings
- **Audit Logging** - Tracks and alerts on problematic responses

### Citation System

- Numbered inline citations: `[1]`, `[2]`, etc.
- Each citation links to documentation source
- Frontend displays clickable source pills
- URLs include section anchors for precise navigation

## Development

### Debug Mode

Enable verbose logging:

```bash
DEBUG=true npm start
```

### Generate JSDoc

```bash
npm run docs
```

Output in `docs/` directory.

## Deployment

Configured for Railway deployment:

```bash
# railway.toml is pre-configured
railway up
```

Required environment variables must be set in Railway dashboard.
