/**
 * Pinecone Ingestion Script
 * Uploads documentation chunks with embeddings to Pinecone
 * 
 * Usage: node scripts/ingest-pinecone.js
 */

require('dotenv').config({ path: '.env.local' });

const { Pinecone } = require('@pinecone-database/pinecone');
const fs = require('fs');
const path = require('path');

// Import the embedding generator
const { generateQueryEmbedding } = require('../src/core/ai/embeddings');

const CHUNKS_PATH = path.resolve(__dirname, '../src/data/documentation-chunks.json');
const INDEX_NAME = 'verifik-docs';
const BATCH_SIZE = 100;

async function main() {
    console.log('🚀 Starting Pinecone ingestion...\n');

    // Validate environment
    if (!process.env.PINECONE_API_KEY) {
        console.error('❌ PINECONE_API_KEY not found in environment');
        process.exit(1);
    }

    // Load chunks
    console.log('📄 Loading documentation chunks...');
    if (!fs.existsSync(CHUNKS_PATH)) {
        console.error('❌ documentation-chunks.json not found at:', CHUNKS_PATH);
        process.exit(1);
    }

    const chunks = JSON.parse(fs.readFileSync(CHUNKS_PATH, 'utf8'));
    console.log(`   Found ${chunks.length} chunks\n`);

    // Initialize Pinecone
    console.log('🔌 Connecting to Pinecone...');
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

    // Check if index exists, create if not
    const indexes = await pc.listIndexes();
    const indexExists = indexes.indexes?.some(idx => idx.name === INDEX_NAME);

    if (!indexExists) {
        console.log(`📦 Creating index "${INDEX_NAME}"...`);
        await pc.createIndex({
            name: INDEX_NAME,
            dimension: 768, // Gemini text-embedding-004 dimension
            metric: 'cosine',
            spec: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1'
                }
            }
        });

        // Wait for index to be ready
        console.log('   Waiting for index to be ready...');
        await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60s
    } else {
        console.log(`   Index "${INDEX_NAME}" already exists`);
    }

    const index = pc.index(INDEX_NAME);

    // Process chunks in batches
    console.log('\n📤 Uploading vectors to Pinecone...\n');

    let processed = 0;
    let errors = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const vectors = [];

        for (const chunk of batch) {
            try {
                // Generate embedding for the chunk content
                const textToEmbed = `${chunk.title || ''} ${chunk.content || ''}`.substring(0, 8000);
                const embedding = await generateQueryEmbedding(textToEmbed);

                vectors.push({
                    id: chunk.id || `chunk-${i}-${processed}`,
                    values: embedding,
                    metadata: {
                        title: chunk.title || '',
                        content: (chunk.content || '').substring(0, 10000), // Pinecone metadata limit
                        source: chunk.source || '',
                        slug: chunk.slug || '',
                        method: chunk.method || '',
                        price: chunk.price || '',
                        parameters_json: JSON.stringify(chunk.parameters || []),
                        parentId: chunk.parentId || '',
                    }
                });

                processed++;
            } catch (err) {
                console.error(`   ❌ Error processing chunk ${chunk.id}: ${err.message}`);
                errors++;
            }
        }

        // Upsert batch to Pinecone
        if (vectors.length > 0) {
            await index.upsert(vectors);
            console.log(`   ✅ Uploaded batch ${Math.floor(i / BATCH_SIZE) + 1} (${vectors.length} vectors)`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n📊 Ingestion Complete!');
    console.log(`   ✓ Processed: ${processed} chunks`);
    console.log(`   ✗ Errors: ${errors}`);
    console.log(`   📍 Index: ${INDEX_NAME}`);
}

main().catch(console.error);
