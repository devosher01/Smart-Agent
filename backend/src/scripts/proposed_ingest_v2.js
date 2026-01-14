/**
 * Proposed Ingestion Script V2 (Enterprise Grade)
 *
 * GOALS:
 * 1. Semantic Chunking (Split by Headers, not arbitrary characters) -> Solves "Hard Cutoffs"
 * 2. Context-Aware Extraction (Find methods in code blocks only) -> Solves "Method Hallucination"
 * 3. Parent/Child Relationship -> Solves "Token Waste" optimization
 */

const fs = require('fs');
const path = require('path');

// Configuration
const DOCS_DIR = path.resolve(__dirname, '../../../../verifik-documentation/docs');
const OUTPUT_FILE = path.join(__dirname, '../data/documentation-chunks-v2.json'); // Saving to NEW file as requested

/**
 * Main execution function
 */
async function main() {
    console.log('🚀 Starting Enterprise Ingestion V2...');
    console.log(`📂 Reading from: ${DOCS_DIR}`);

    // 1. Recursive file finding
    const files = findMarkdownFiles(DOCS_DIR);
    console.log(`Found ${files.length} markdown files.`);

    let allChunks = [];

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const filename = path.basename(file);

        // 2. Parse Frontmatter & Body
        const { metadata, body } = parseFrontmatter(content);

        // 3. Create PARENT Chunk (The "Main" reference)
        const parentChunk = {
            id: generateId(filename, 'main'),
            type: 'document',
            title: metadata.title || filename,
            content: body, // Full content
            source: 'docs/' + path.relative(DOCS_DIR, file), // Normalize path for frontend
            slug: metadata.slug || null,
            metadata: {
                ...metadata,
                isParent: true
            }
        };
        allChunks.push(parentChunk);

        // 4. Semantic Splitting (The "Child" chunks)
        const sections = splitByHeaders(body);

        sections.forEach((section, index) => {
            // Smart Extraction per section
            const method = extractHttpMethod(section.content);
            const parameters = extractParameters(section.content);
            const price = extractPrice(section.content);

            const childChunk = {
                id: generateId(filename, `section_${index + 1}`),
                type: 'section',
                title: `${metadata.title} - ${section.header}`,
                content: section.content,
                source: 'docs/' + path.relative(DOCS_DIR, file),
                slug: metadata.slug || null,
                parentId: parentChunk.id, // Link to parent
                // Extracted structured data
                method: method,
                parameters: parameters,
                price: price,
                metadata: {
                    country: metadata.country || 'Global',
                    category: metadata.category || 'general'
                }
            };

            allChunks.push(childChunk);
        });
    }

    // 5. Save validation
    console.log(`✅ Generated ${allChunks.length} chunks.`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allChunks, null, 2));
    console.log(`💾 Saved to ${OUTPUT_FILE}`);
}

// ------------------------------------------------------------------
// 🧠 INTELLIGENT PARSING LOGIC
// ------------------------------------------------------------------

/**
 * Splits markdown by H2 (##) or H3 (###) headers.
 * Ensures we never cut a sentence in half.
 */
function splitByHeaders(markdown) {
    const lines = markdown.split('\n');
    const sections = [];
    let currentSection = { header: 'Intro', content: '' };

    for (const line of lines) {
        // Regex for headers (## Title or ### Title)
        const headerMatch = line.match(/^(#{2,3})\s+(.+)/);

        if (headerMatch) {
            // Functionality: Save current accumulator
            if (currentSection.content.trim().length > 0) {
                sections.push(currentSection);
            }
            // Start new accumulator
            currentSection = {
                header: headerMatch[2].trim(),
                content: line + '\n'
            };
        } else {
            currentSection.content += line + '\n';
        }
    }

    // Push last section
    if (currentSection.content.trim().length > 0) {
        sections.push(currentSection);
    }

    return sections;
}

/**
 * FIXED LOGIC: Looks for methods in ALL code blocks.
 * Supports: RAW HTTP, CURL, AXIOS, REQUESTS, ETC.
 */
function extractHttpMethod(text) {
    // Match ANY code block: ```lang ... ``` or just ``` ... ```
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
        const codeContent = match[2];

        // 1. Explicit HTTP (GET /path)
        const rawHttp = codeContent.match(/^(GET|POST|PUT|DELETE|PATCH)\s+[\/\w-]+/im);
        if (rawHttp) return rawHttp[1].toUpperCase();

        // 2. cURL (-X POST or just POST)
        if (codeContent.includes('curl')) {
            const curlMethod = codeContent.match(/-X\s+(GET|POST|PUT|DELETE|PATCH)/i);
            if (curlMethod) return curlMethod[1].toUpperCase();
        }

        // 3. Common SDKs (axios.post, requests.post, http.NewRequest("POST"))
        const sdkMethod = codeContent.match(/\.(get|post|put|delete|patch)\(/i);
        if (sdkMethod) return sdkMethod[1].toUpperCase();

        const goMethod = codeContent.match(/NewRequest\(\s*"(GET|POST|PUT|DELETE|PATCH)"/i);
        if (goMethod) return goMethod[1].toUpperCase();
    }

    return null;
}

/**
 * Extract parameters from Markdown Tables
 * Finds tables with headers like | Parameter | Type | ...
 */
function extractParameters(text) {
    const lines = text.split('\n');
    const parameters = [];
    let insideTable = false;
    let headers = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('|')) {
            const cols = line.split('|').filter(c => c).map(c => c.trim());

            // Header detection
            if (!insideTable) {
                const lowerCols = cols.map(c => c.toLowerCase());
                // Match if we have "parameter" OR ("name" AND ("type" or "description"))
                const hasParamName = lowerCols.some(c => c.includes('parameter') || c.includes('field') || c.includes('name'));
                const hasTypeOrDesc = lowerCols.some(c => c.includes('type') || c.includes('description'));

                if (hasParamName && hasTypeOrDesc) {
                    insideTable = true;
                    headers = lowerCols;
                    i++; // Skip separator line |---|---|
                    continue;
                }
            } else {
                // Row parsing
                if (cols.length >= 2) {
                    const param = {};
                    cols.forEach((col, idx) => {
                        const h = headers[idx] || '';
                        if (h.includes('parameter') || h.includes('field') || h.includes('name')) param.name = col.replace(/[`*]/g, ''); // Clean markdown chars
                        if (h.includes('type')) param.type = col.replace(/[`*]/g, '');
                        if (h.includes('description')) param.description = col;
                        if (h.includes('required')) param.required = col.toLowerCase().includes('yes') || col.toLowerCase().includes('true');
                    });
                    if (param.name && param.name !== '---') parameters.push(param);
                }
            }
        } else if (insideTable) {
            insideTable = false; // Table ended
        }
    }

    return parameters;
}

/**
 * Extract Price strictly from currency symbols strings
 */
function extractPrice(text) {
    const priceRegex = /\$\s?(\d+\.?\d*)\s*(?:USD|COP)/i;
    const match = text.match(priceRegex);
    return match ? match[1] : null;
}

/**
 * Simple Frontmatter parser (--- ... ---)
 */
function parseFrontmatter(text) {
    const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { metadata: {}, body: text };

    const yamlStr = match[1];
    const body = match[2];

    const metadata = {};
    yamlStr.split('\n').forEach(line => {
        const [key, val] = line.split(':').map(s => s.trim());
        if (key && val) metadata[key] = val;
    });

    return { metadata, body };
}

// Utils
/**
 * Recursively find markdown files
 */
function findMarkdownFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            if (file !== 'node_modules' && !file.startsWith('.')) {
                findMarkdownFiles(filePath, fileList);
            }
        } else {
            if (file.endsWith('.md') || file.endsWith('.mdx')) {
                fileList.push(filePath);
            }
        }
    });

    return fileList;
}

/**
 * Normalize text for ID generation
 */
function generateId(filename, suffix) {
    return `${filename.replace(/[^a-zA-Z0-9]/g, '_')}_${suffix}`;
}

// Run
if (require.main === module) {
    main();
}

module.exports = { main }; // Export for testing
