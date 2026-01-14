#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const lancedb = require("@lancedb/lancedb");

require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const CHUNKS_PATH = path.resolve(__dirname, "../src/data/documentation-chunks.json");
const { generateEmbedding } = require("../src/modules/embeddings.module");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
	console.log("🧠 Generador de Embeddings para RAG (LanceDB Edition - Enterprise)\n");

	if (!fs.existsSync(CHUNKS_PATH)) {
		console.error("❌ No se encontró documentation-chunks.json");
		process.exit(1);
	}

	if (!process.env.GOOGLE_API_KEY) {
		console.error("❌ GOOGLE_API_KEY no está configurado en .env");
		process.exit(1);
	}

	// Connect to LanceDB
	const dbPath = path.resolve(__dirname, "../src/data/lancedb");
	const db = await lancedb.connect(dbPath);
	console.log(` Conectado a LanceDB en: ${dbPath}`);

	const chunks = JSON.parse(fs.readFileSync(CHUNKS_PATH, "utf8"));
	console.log(` Procesando ${chunks.length} chunks...\n`);

	let processed = 0;
	let errors = 0;
	const startTime = Date.now();

	// Batch configuration
	const BATCH_SIZE = 20;
	let batch = [];
	let table = null;

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		const method = chunk.method ? String(chunk.method).toUpperCase() : "";

		try {
			let contextString = `Title: ${chunk.title}\n`;
			if (chunk.metadata?.description) contextString += `Description: ${chunk.metadata.description}\n`;
			if (method) contextString += `Method: ${method}\n`;
			if (chunk.parameters && chunk.parameters.length > 0) {
				const paramStr = chunk.parameters.map(p => `${p.name} (${p.type})`).join(', ');
				contextString += `Parameters: ${paramStr}\n`;
			}
			if (chunk.price) contextString += `Price: ${chunk.price}\n`;
			contextString += `\nContent:\n${chunk.content}`;

			const textToEmbed = contextString.substring(0, 3000);
			const embedding = await generateEmbedding(textToEmbed);

			batch.push({
				id: String(chunk.id),
				vector: embedding,
				title: String(chunk.title || ""),
				content: String(chunk.content || ""),
				source: String(chunk.source || ""),
				slug: String(chunk.slug || ""),
				method: method,
				price: String(chunk.price || ""),
				parentId: String(chunk.parentId || ""),
				parameters_json: JSON.stringify(chunk.parameters || [])
			});

			// Process Batch
			if (batch.length >= BATCH_SIZE || i === chunks.length - 1) {
				if (!table) {
					// First batch: Create table
					console.log(`\n💾 Inicializando tabla con ${batch.length} vectores...`);
					table = await db.createTable("vectors", batch, { mode: "overwrite" });
				} else {
					// Subsequent batches: Add to table
					await table.add(batch);
				}

				processed += batch.length;
				batch = []; // Reset batch

				const percent = ((processed / chunks.length) * 100).toFixed(1);
				const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
				process.stdout.write(`\r  ⏳ Progreso: ${percent}% (${processed}/${chunks.length}) - ${elapsed}s`);
			}

			// Rate limiting
			await sleep(50); // Small delay between individual requests to avoid API rate limits

		} catch (err) {
			console.error(`\n  ❌ Error en chunk ${chunk.id}: ${err.message}`);
			errors++;
			if (errors > 20) break;
			await sleep(2000);
		}
	}

	if (table) {
		console.log(`\n\n✅ Tabla 'vectors' finalizada.`);
		console.log(`   📊 Registros totales: ${await table.countRows()}`);
	} else {
		console.log("\n⚠️ No se generaron vectores.");
	}

	const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
	console.log(`\n🎉 Completado en ${totalTime}s`);
};

main().catch((err) => {
	console.error("\nError fatal:", err);
	process.exit(1);
});
