const axios = require('axios');
// const colors = require('colors'); // Removed dependency

const API_URL = 'http://localhost:3060/api/agent/chat';

/**
 * STRICT RAG VERIFICATION SUITE
 * 
 * This suite explicitly tests:
 * 1. CITATION ACCURACY: Does the AI cite sources that actually exist?
 * 2. HALLUCINATION REFUSAL: Does it refuse to answer about non-existent features?
 * 3. DATA GROUNDING: Are returned prices/endpoints strictly from the docs?
 */

const TEST_SCENARIOS = [
    {
        name: "Sanity Check - Ground Truth (Zelf Tokens)",
        query: "How much is the Zelf token price?",
        intent: "ACCURACY",
        checks: {
            mustContain: ["$0.10", "USD"], // Confirmed from airdrop_rules_es.md
            mustNotContain: ["cannot find", "sorry"]
        }
    },
    {
        name: "Sanity Check - Ground Truth (Dates)",
        query: "When is the Airdrop distribution date?",
        intent: "ACCURACY",
        checks: {
            mustContain: ["December 25, 2025"], // Confirmed from airdrop_rules.md
            mustNotContain: ["January", "2024"]
        }
    },
    {
        name: "Refusal Check - Missing Service (National Police)",
        query: "How much does the National Police background check cost?",
        intent: "REFUSAL",
        checks: {
            mustContain: ["don't have information", "documentation"], // Removed "not list"
            mustNotContain: ["$0.20", "$0.60"]
        }
    },
    {
        name: "Hallucination Trap - Fake Service",
        query: "I need the endpoint for the Colombian Space Agency launch codes.",
        intent: "REFUSAL",
        checks: {
            mustContain: ["don't have information", "documentation"], // Standardized refusal
            mustNotContain: ["/space/codes"]
        }
    },
    {
        name: "Strict Data - Exact Endpoint",
        query: "What is the endpoint for RUAF validation?",
        intent: "ACCURACY",
        checks: {
            // Adjust based on real docs expectation
            mustContain: ["/v2/co/ruaf"],
            mustNotContain: ["/v2/col/ruaf", "/api/ruaf"] // Fake variants
        }
    },
    {
        name: "Strict Data - Unsupported Country (Chile)",
        query: "Does Verifik support Chile criminal records?",
        intent: "REFUSAL",
        checks: {
            // Assuming Chile is NOT in the chunk set for this specific service
            mustContain: ["not", "cannot confirm", "documentation"],
            mustNotContain: ["Yes, we support Chile"]
        }
    }
];

const runStrictTests = async () => {
    console.log("\n🛡️  STARTING STRICT RAG VERIFICATION  🛡️\n".bold.cyan);

    let passed = 0;
    let failed = 0;

    for (const test of TEST_SCENARIOS) {
        console.log(`[TEST] ${test.name}`.yellow);
        console.log(`Query: "${test.query}"`);

        try {
            const start = Date.now();
            const response = await axios.post(API_URL, { message: test.query });
            const duration = Date.now() - start;

            // Handle different response structures
            let aiContent = '';
            if (response.data && response.data.content) {
                aiContent = response.data.content;
            } else if (response.data && response.data.response) {
                aiContent = response.data.response;
            } else {
                console.log("   ❌ ERROR: Unexpected response structure:", Object.keys(response.data));
                failed++;
                console.log("-".repeat(50).gray + "\n");
                continue; // Skip to the next test
            }

            const meta = response.data.rag_metadata;
            const lowerContent = aiContent.toLowerCase();

            console.log(`Response (${duration}ms):`.gray);
            console.log(aiContent.trim().replace(/\n/g, ' ').substring(0, 150) + "...");
            console.log(`Sources Used: ${meta ? meta.sources.length : 0}`.magenta);

            let testPassed = true;
            const errors = [];

            // 1. Check Mandatory Phrases
            test.checks.mustContain.forEach(phrase => {
                if (!lowerContent.includes(phrase.toLowerCase())) {
                    testPassed = false;
                    errors.push(`Missing mandatory phrase: "${phrase}"`);
                }
            });

            // 2. Check Forbidden Phrases
            test.checks.mustNotContain.forEach(phrase => {
                if (lowerContent.includes(phrase.toLowerCase())) {
                    testPassed = false;
                    errors.push(`Found forbidden phrase (Hallucination?): "${phrase}"`);
                }
            });

            // 3. Strict Refusal Logic
            if (test.intent === "REFUSAL") {
                if (meta && meta.groundedness === "high") {
                    testPassed = false;
                    errors.push("CRITICAL: High confidence reported for a REFUSAL/TRAP query!");
                }
                if (meta && meta.validationResult.detectedHallucinations.length > 0) {
                    console.log("   (System correctly detected potential hallucinations internally)".green);
                }
            }

            if (testPassed) {
                console.log("✅ PASSED".green.bold);
                passed++;
            } else {
                console.log("❌ FAILED".red.bold);
                errors.forEach(e => console.log(`   - ${e}`.red));
                failed++;
            }

        } catch (err) {
            console.log("❌ ERROR".red.bold);
            console.log(`   ${err.message}`.red);
            failed++;
        }
        console.log("-".repeat(50).gray + "\n");
    }

    console.log(`\nRESULTS: ${passed} Passed | ${failed} Failed`.bold);
    if (failed === 0) {
        console.log("🏆 SYSTEM IS STRICT AND ROBUST".rainbow);
    } else {
        console.log("⚠️  INTEGRITY ADJUSTMENTS NEEDED".yellow.bold);
    }
};

// Simple shim for colors if not installed, purely visual
String.prototype.__defineGetter__('red', function () { return this; });
String.prototype.__defineGetter__('green', function () { return this; });
String.prototype.__defineGetter__('yellow', function () { return this; });
String.prototype.__defineGetter__('blue', function () { return this; });
String.prototype.__defineGetter__('magenta', function () { return this; });
String.prototype.__defineGetter__('cyan', function () { return this; });
String.prototype.__defineGetter__('gray', function () { return this; });
String.prototype.__defineGetter__('bold', function () { return this; });
String.prototype.__defineGetter__('rainbow', function () { return this; });

runStrictTests();
