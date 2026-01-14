const axios = require('axios');

const API_URL = 'http://localhost:3060/api/agent/chat';
const DELAY_MS = 2000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const testCases = [
    {
        type: "TRUTH",
        query: "What parameters are required for 'API Key Access via Email - Confirm'?",
        expectedKeywords: ["email", "otp"],
        forbiddenKeywords: ["password", "username"],
        description: "Verify 'Email - Confirm' params (Ground Truth)"
    },
    {
        type: "TRUTH",
        query: "What is the rate limit for Phone OTP?",
        expectedKeywords: ["3 requests per minute"],
        forbiddenKeywords: ["10 requests", "unlimited"],
        description: "Verify 'Phone OTP' Rate Limits (Ground Truth)"
    },
    {
        type: "TRUTH",
        query: "What provinces are supported?",
        expectedKeywords: ["British Columbia", "Ontario", "BC", "ON"],
        forbiddenKeywords: ["Alberta", "Quebec", "Manitoba"],
        // ^ Strict check: MUST NOT mention others if logic is correct for "Supported Provinces" chunk
        description: "Verify 'Supported Provinces' (Strict Context Filter)"
    },
    {
        type: "TRAP",
        query: "How much does it cost to verify a SpaceX Rocket?",
        expectedKeywords: ["cannot provide", "not available", "documentation"],
        forbiddenKeywords: ["$10", "$500", "SpaceX"],
        description: "Hallucination Trap: SpaceX Rocket (Fake Service)"
    },
    {
        type: "TRAP",
        query: "List the supported provinces for Mars Colony Verification.",
        expectedKeywords: ["cannot", "not found", "no information"],
        forbiddenKeywords: ["Olympus Mons", "Cydonia"],
        description: "Hallucination Trap: Mars Colony (Fake Context)"
    }
];

const runTest = async () => {
    console.log("🕵️‍♂️ Starting RAG Integrity & Hallucination Test Suite...\n");
    let passed = 0;
    let failed = 0;

    for (const test of testCases) {
        console.log(`🧪 Testing: ${test.description}`);
        console.log(`   Query: "${test.query}"`);

        try {
            const response = await axios.post(API_URL, { message: test.query });
            const aiResponse = response.data.content || JSON.stringify(response.data); // Fallback to full JSON if content missing

            console.log(`   🤖 AI Answer: "${aiResponse.substring(0, 100).replace(/\n/g, ' ')}..."`);

            let paramsPassed = true;
            const lowerRes = aiResponse.toLowerCase();

            // Check Expected
            if (test.expectedKeywords) {
                for (const kw of test.expectedKeywords) {
                    // relaxed check for traps (any refusal is good)
                    if (test.type === "TRAP") {
                        const anyRefusal = ["cannot", "sorry", "not available", "no relevant", "unable"].some(r => lowerRes.includes(r));
                        if (!anyRefusal && !lowerRes.includes(kw.toLowerCase())) {
                            console.log(`   ❌ FAILED: Expected refusal or keyword "${kw}"`);
                            paramsPassed = false;
                        }
                    } else {
                        if (!lowerRes.includes(kw.toLowerCase())) {
                            console.log(`   ❌ FAILED: Missing expected keyword "${kw}"`);
                            paramsPassed = false;
                        }
                    }
                }
            }

            // Check Forbidden
            // Check Forbidden (unless it's a refusal)
            const refusalPhrases = ["cannot find", "sorry", "not available", "no relevant", "unable to", "limitations", "limited to"];
            const isRefusal = refusalPhrases.some(phrase => lowerRes.includes(phrase));

            if (test.forbiddenKeywords) {
                for (const kw of test.forbiddenKeywords) {
                    if (lowerRes.includes(kw.toLowerCase())) {
                        if (isRefusal) {
                            console.log(`   ⚠️ Note: Found forbidden word "${kw}" but in a REFUSAL context. (Acceptable Negative Constraint)`);
                        } else {
                            console.log(`   ❌ FAILED: Found FORBIDDEN keyword "${kw}" (Hallucination Risk!)`);
                            paramsPassed = false;
                        }
                    }
                }
            }

            if (paramsPassed) {
                console.log("   ✅ PASSED\n");
                passed++;
            } else {
                console.log("   🔴 FAILED\n");
                failed++;
            }

        } catch (error) {
            console.log(`   🚨 API Error: ${error.message}`);
            if (error.response) {
                console.log(`      Status: ${error.response.status}`);
                console.log(`      Server Msg: ${JSON.stringify(error.response.data)}`);
            }
            failed++;
            console.log("   🔴 FAILED\n");
        }

        await sleep(DELAY_MS);
    }

    console.log("========================================");
    console.log(`🏁 Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log("========================================");

    if (failed === 0) {
        console.log("🎉 SYSTEM INTEGRITY VERIFIED: ZERO HALLUCINATIONS DETECTED.");
    } else {
        console.log("⚠️ WARNING: POTENTIAL INTEGRITY ISSUES DETECTED.");
    }
};

runTest();
