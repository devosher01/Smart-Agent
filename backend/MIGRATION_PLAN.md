# x402 Agent Migration Checklist

This document outlines the steps to migrate the AI Agent (x402) logic from `verifik-backend` to the dedicated `Smart-Agent/backend` service.

## 1. Project Initialization

-   [ ] Initialize Node.js project in `Smart-Agent/backend` (`npm init -y`)
-   [ ] Install dependencies:
    -   `koa` (Server framework)
    -   `koa-router` (Routing)
    -   `koa-body` (Body parsing)
    -   `koa-cors` (CORS)
    -   `dotenv` (Environment variables)
    -   `axios` (HTTP requests)
    -   `ethers` (Blockchain interaction)
    -   `nodemon` (Dev server)

## 2. Code Migration

-   [ ] Create directory structure:
    -   `src/controllers`
    -   `src/modules`
    -   `src/routes`
    -   `src/config`
    -   `src/utils`
-   [ ] migrate `verifik-backend/Repositories/AI/modules/agent.module.js` -> `src/modules/agent.module.js`
-   [ ] migrate `verifik-backend/Repositories/AI/modules/gemini.module.js` -> `src/modules/gemini.module.js`
-   [ ] migrate `verifik-backend/Repositories/AI/modules/erc8004.module.js` -> `src/modules/erc8004.module.js`
-   [ ] migrate `verifik-backend/Repositories/AI/controllers/agent.controller.js` -> `src/controllers/agent.controller.js`
-   [ ] Copy `verifik-backend/x402-endpoints.json` to `src/config/tools-manifest.json`

## 3. Configuration & Refactoring

-   [ ] **Config Module**: Create `src/config/index.js` to manage env vars (replacing the dependency on `verifik-backend/Core/config`).
-   [ ] **Tool Execution logic (`agent.module.js`)**:
    -   Update `executeTool` to call the _external_ Verifik Backend URL (`https://verifik.app` or configurable env var).
    -   Implement Service-to-Service authentication:
        -   Add `VERIFIK_SERVICE_TOKEN` to `.env`.
        -   Inject this token into the `Authorization` header when calling tools.
-   [ ] **Gemini Module**:
    -   Ensure Google Cloud credentials (`gemini_key.json`) are correctly loaded from a secure location or env vars.
-   [ ] **ERC8004 Module**:
    -   Verify RPC URLs and Contract Addresses are loaded from `.env`.

## 4. API Routes & Server

-   [ ] Create `src/routes/agent.routes.js` to map endpoints.
-   [ ] Create `src/index.js` (entry point) to set up Express app and routes.

## 5. Environment Setup (`.env`)

-   [ ] Create `.env` file with:
    -   `PORT=3000` (or 3001)
    -   `VERIFIK_API_URL=https://verifik.app`
    -   `VERIFIK_SERVICE_TOKEN=...` (The JWT for the credit-funded account)
    -   `GOOGLE_APPLICATION_CREDENTIALS` or JSON content
    -   `X402_RPC_URL`
    -   `X402_WALLET_PRIVATE_KEY`
    -   `ERC8004_IDENTITY_REGISTRY`
    -   `ERC8004_REPUTATION_REGISTRY`
    -   `ERC8004_VALIDATION_REGISTRY`

## 6. Testing

-   [ ] Test `/chat` endpoint from Postman/Frontend.
-   [ ] Verify tool execution calls `verifik-backend` successfully.
-   [ ] Verify payment logic (simulated or actual) works.
-   [ ] Verify ERC8004 validation recording.
