#!/usr/bin/env node
/**
 * Extrae la documentación del repo de Verifik y la convierte en chunks
 *
 * Uso:
 *   node scripts/extract-documentation.js <ruta-al-repo>
 *
 * Ejemplo:
 *   node scripts/extract-documentation.js ../../verifik-documentation
 */

const fs = require("fs");
const path = require("path");

const DOCS_DIRS = ["docs", "docs-es"];
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/documentation-chunks.json");

/**
 * Parsea un archivo MDX y extrae información estructurada
 */
const parseMdxFile = (filePath, content) => {
	const chunks = [];

	// Limpiar contenido de imports y componentes JSX
	let cleanContent = content
		.replace(/^import\s+.*$/gm, "") // Remove imports
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove scripts
		.replace(/<Tabs>[\s\S]*?<\/Tabs>/gi, (match) => {
			// Extraer solo el código de los tabs
			const codeBlocks = match.match(/```[\s\S]*?```/g) || [];
			return codeBlocks.join("\n\n");
		})
		.replace(/<TabItem[^>]*>/gi, "")
		.replace(/<\/TabItem>/gi, "")
		.replace(/<[^>]+>/g, "") // Remove remaining HTML/JSX tags
		.trim();

	// Extraer título
	const titleMatch = cleanContent.match(/^#\s+(.+)$/m);
	const title = titleMatch ? titleMatch[1].replace(/[🇦-🇿]/gu, "").trim() : path.basename(filePath, ".mdx");

	// Extraer endpoint si existe
	const endpointMatch =
		cleanContent.match(/```\n?(https?:\/\/[^\s`]+)/i) ||
		cleanContent.match(/\*\*Endpoint[:\s]*\*\*[:\s]*`?([^`\n]+)`?/i) ||
		cleanContent.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(https?:\/\/[^\s]+)/im);

	let endpoint = null;
	let method = "GET";

	if (endpointMatch) {
		if (endpointMatch[2]) {
			method = endpointMatch[1];
			endpoint = endpointMatch[2];
		} else {
			endpoint = endpointMatch[1];
		}
	}

	// Extraer parámetros de tablas
	const parameters = [];
	const paramTableMatch = cleanContent.match(/\|\s*(?:Name|Nombre|Parameter)[^\n]*\n\|[-\s|]+\n((?:\|[^\n]+\n?)+)/i);
	if (paramTableMatch) {
		const rows = paramTableMatch[1].split("\n").filter((r) => r.trim());
		rows.forEach((row) => {
			const cols = row.split("|").filter((c) => c.trim());
			if (cols.length >= 3) {
				parameters.push({
					name: cols[0]?.trim().replace(/`/g, ""),
					type: cols[1]?.trim(),
					required: cols[2]?.toLowerCase().includes("yes") || cols[2]?.toLowerCase().includes("sí"),
					description: cols[3]?.trim() || "",
				});
			}
		});
	}

	// Extraer ejemplos de código
	const examples = {};
	const codeBlocks = cleanContent.match(/```(\w+)?\n([\s\S]*?)```/g) || [];
	codeBlocks.forEach((block) => {
		const langMatch = block.match(/```(\w+)?/);
		const lang = langMatch?.[1] || "text";
		const code = block.replace(/```\w*\n?/, "").replace(/```$/, "").trim();

		if (lang === "javascript" || lang === "js" || lang === "node") {
			examples.javascript = code;
		} else if (lang === "python" || lang === "py") {
			examples.python = code;
		} else if (lang === "bash" || lang === "curl" || lang === "shell") {
			examples.curl = code;
		} else if (lang === "json") {
			examples.response = code;
		}
	});

	// Extraer precio si existe
	const priceMatch = cleanContent.match(/\$?([\d.]+)\s*USD/i) || cleanContent.match(/precio[:\s]*\$?([\d.]+)/i);
	const price = priceMatch ? parseFloat(priceMatch[1]) : null;

	// Detectar país
	const countryPatterns = {
		Colombia: /colombia|co\//i,
		Argentina: /argentina|ar\//i,
		Mexico: /mexico|mx\//i,
		Peru: /peru|pe\//i,
		Chile: /chile|cl\//i,
		Brazil: /brazil|brasil|br\//i,
		Venezuela: /venezuela|ve\//i,
		Ecuador: /ecuador|ec\//i,
		"Costa Rica": /costa.?rica|cr\//i,
		Panama: /panama|pa\//i,
		"Dominican Republic": /dominican|do\//i,
		Paraguay: /paraguay|py\//i,
		Bolivia: /bolivia|bo\//i,
		Honduras: /honduras|hn\//i,
		Spain: /spain|españa|es\//i,
		USA: /usa|united.?states/i,
		Global: /interpol|fbi|dea|ofac|onu|world/i,
	};

	let country = null;
	for (const [countryName, pattern] of Object.entries(countryPatterns)) {
		if (pattern.test(filePath) || pattern.test(cleanContent)) {
			country = countryName;
			break;
		}
	}

	// Detectar categoría
	const categoryPatterns = {
		identity: /identity|identidad|cedula|cédula|citizen/i,
		business: /business|empresa|company|nit|rut|cuit/i,
		vehicle: /vehicle|vehículo|vehiculo|placa|runt|simit/i,
		background_check: /background|antecedentes|interpol|fbi|dea|ofac|onu/i,
		legal: /legal|judicial|procesos|abogado|lawyer/i,
		document_validation: /document.?validation|validación.?documento/i,
		biometric: /biometric|liveness|vivacidad|facial/i,
		ocr: /ocr|scan|escane/i,
	};

	let category = "other";
	for (const [cat, pattern] of Object.entries(categoryPatterns)) {
		if (pattern.test(filePath) || pattern.test(cleanContent)) {
			category = cat;
			break;
		}
	}

	// Crear chunk principal
	const mainChunk = {
		id: `${filePath.replace(/[\/\\\.]/g, "_")}_main`,
		title: title,
		source: filePath,
		type: "endpoint",
		content: cleanContent.substring(0, 3000), // Limitar contenido
		endpoint: endpoint,
		method: method,
		parameters: parameters,
		examples: Object.keys(examples).length > 0 ? examples : null,
		price: price,
		country: country,
		category: category,
	};

	chunks.push(mainChunk);

	// Si el contenido es muy largo, crear chunks adicionales por secciones
	if (cleanContent.length > 3000) {
		const sections = cleanContent.split(/^##\s+/m);
		sections.forEach((section, index) => {
			if (index === 0 || section.length < 200) return;

			const sectionTitleMatch = section.match(/^(.+?)[\n\r]/);
			const sectionTitle = sectionTitleMatch ? sectionTitleMatch[1].trim() : `Section ${index}`;

			chunks.push({
				id: `${filePath.replace(/[\/\\\.]/g, "_")}_section_${index}`,
				title: `${title} - ${sectionTitle}`,
				source: filePath,
				type: "section",
				content: section.substring(0, 2000),
				parentTitle: title,
				country: country,
				category: category,
			});
		});
	}

	return chunks;
};

/**
 * Recorre recursivamente un directorio buscando archivos .mdx/.md
 */
const walkDir = (dir, fileList = []) => {
	if (!fs.existsSync(dir)) return fileList;

	const files = fs.readdirSync(dir);

	files.forEach((file) => {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);

		if (stat.isDirectory()) {
			// Skip node_modules, build, .git
			if (!["node_modules", "build", ".git", ".docusaurus"].includes(file)) {
				walkDir(filePath, fileList);
			}
		} else if (file.endsWith(".mdx") || file.endsWith(".md")) {
			fileList.push(filePath);
		}
	});

	return fileList;
};

/**
 * Función principal
 */
const main = () => {
	const repoPath = process.argv[2] || "../../verifik-documentation";
	const resolvedPath = path.resolve(__dirname, repoPath);

	if (!fs.existsSync(resolvedPath)) {
		console.error(`❌ El directorio no existe: ${resolvedPath}`);
		console.error("   Uso: node extract-documentation.js <ruta-al-repo>");
		console.error("   Ejemplo: node extract-documentation.js ../../verifik-documentation");
		process.exit(1);
	}

	console.log(`📂 Extrayendo documentación de: ${resolvedPath}`);

	let allChunks = [];
	let totalFiles = 0;

	for (const docsDir of DOCS_DIRS) {
		const fullPath = path.join(resolvedPath, docsDir);
		if (!fs.existsSync(fullPath)) {
			console.log(`⚠️  Directorio no encontrado: ${docsDir}`);
			continue;
		}

		console.log(`\n📁 Procesando: ${docsDir}`);
		const files = walkDir(fullPath);

		files.forEach((file) => {
			try {
				const content = fs.readFileSync(file, "utf8");
				const relativePath = path.relative(resolvedPath, file);
				const chunks = parseMdxFile(relativePath, content);
				allChunks = allChunks.concat(chunks);
				totalFiles++;

				// Solo mostrar archivos con endpoints
				const hasEndpoint = chunks.some((c) => c.endpoint);
				if (hasEndpoint) {
					console.log(`  ✅ ${relativePath} (${chunks.length} chunks, endpoint: ${chunks[0].endpoint || "N/A"})`);
				}
			} catch (err) {
				console.error(`  ❌ Error procesando ${file}: ${err.message}`);
			}
		});
	}

	// Filtrar chunks vacíos o muy cortos
	allChunks = allChunks.filter((chunk) => chunk.content && chunk.content.length > 100);

	// Asegurar que el directorio existe
	const outputDir = path.dirname(OUTPUT_PATH);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Guardar chunks
	fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allChunks, null, 2));

	console.log(`\n✅ Extracción completada:`);
	console.log(`   📄 Archivos procesados: ${totalFiles}`);
	console.log(`   📦 Chunks generados: ${allChunks.length}`);
	console.log(`   💾 Guardado en: ${OUTPUT_PATH}`);

	// Estadísticas por categoría
	const byCategory = {};
	allChunks.forEach((c) => {
		byCategory[c.category] = (byCategory[c.category] || 0) + 1;
	});
	console.log(`\n📊 Chunks por categoría:`);
	Object.entries(byCategory)
		.sort((a, b) => b[1] - a[1])
		.forEach(([cat, count]) => {
			console.log(`   ${cat}: ${count}`);
		});

	// Estadísticas por país
	const byCountry = {};
	allChunks.forEach((c) => {
		if (c.country) {
			byCountry[c.country] = (byCountry[c.country] || 0) + 1;
		}
	});
	console.log(`\n🌎 Chunks por país:`);
	Object.entries(byCountry)
		.sort((a, b) => b[1] - a[1])
		.forEach(([country, count]) => {
			console.log(`   ${country}: ${count}`);
		});
};

main();
