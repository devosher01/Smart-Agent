const lancedb = require("@lancedb/lancedb");
const path = require("path");
const { generateQueryEmbedding } = require("../src/modules/embeddings.module");

// Mock config to access embeddings
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

async function debugRetrieval() {
    console.log("🔍 Debugging Retrieval for 'Supported Provinces in Canada'...");

    const dbPath = path.resolve(__dirname, "../src/data/lancedb");
    const db = await lancedb.connect(dbPath);
    const table = await db.openTable("vectors");

    const query = "API Key Access via Email header and params please";
    const embedding = await generateQueryEmbedding(query);

    const results = await table
        .search(embedding)
        .limit(5)
        .toArray();

    console.log("\n📊 Raw Results Type:", typeof results);
    console.log("📊 Is Array?", Array.isArray(results));
    console.log("📊 Raw Content:", results);

    const entries = Array.isArray(results) ? results : (results.data || []);

    entries.forEach((r, i) => {
        const score = 1 - (r._distance || 0);
        console.log(`\n[${i + 1}] Score: ${score.toFixed(4)}`);
        console.log(`    Title: ${r.title}`);
        console.log(`    Content Snippet: ${r.content ? r.content.substring(0, 100).replace(/\n/g, " ") : "N/A"}...`);
    });
}

debugRetrieval().catch(console.error);
