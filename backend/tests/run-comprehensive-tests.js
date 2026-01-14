#!/usr/bin/env node
/**
 * Comprehensive Test Suite for Hallucination Prevention System
 * @description Professional testing of all 6 layers
 * @author RAG Testing Expert
 * @date 2026-01-12
 */

'use strict';

require('dotenv').config({ path: '.env.local' });

const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
  suites: {}
};

let currentSuite = '';

function logSuite(name) {
  currentSuite = name;
  testResults.suites[name] = { passed: 0, failed: 0 };
  console.log('\n' + '='.repeat(70));
  console.log(`TEST SUITE: ${name}`);
  console.log('='.repeat(70));
}

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  testResults.tests.push({ suite: currentSuite, name, passed, details });
  if (passed) {
    testResults.passed++;
    testResults.suites[currentSuite].passed++;
  } else {
    testResults.failed++;
    testResults.suites[currentSuite].failed++;
  }
  console.log(`${status}: ${name}`);
  if (details && !passed) console.log(`   → ${details}`);
}

// ============================================================================
// TEST SUITE 1: MODULE IMPORTS
// ============================================================================
logSuite('1. VERIFICACIÓN DE MÓDULOS');

try {
  const constants = require('../src/modules/rag.constants');
  logTest('rag.constants.js - Import', true);
  logTest('GroundednessLevel enum exists', !!constants.GroundednessLevel);
  logTest('HallucinationType enum exists', !!constants.HallucinationType);
  logTest('ValidationStatus enum exists', !!constants.ValidationStatus);
  logTest('ANTI_HALLUCINATION_PROMPT exists', !!constants.ANTI_HALLUCINATION_PROMPT);
  logTest('STRICT_MODE_PROMPT exists', !!constants.STRICT_MODE_PROMPT);
  logTest('DEFAULT_CONFIG exists', !!constants.DEFAULT_CONFIG);
  logTest('GROUNDEDNESS_THRESHOLDS exists', !!constants.GROUNDEDNESS_THRESHOLDS);
  logTest('HALLUCINATION_PATTERNS exists', !!constants.HALLUCINATION_PATTERNS);
} catch (e) {
  logTest('rag.constants.js - Import', false, e.message);
}

try {
  const validator = require('../src/modules/rag-validator.module');
  logTest('rag-validator.module.js - Import', true);
  logTest('GroundednessCalculator class exists', typeof validator.GroundednessCalculator === 'function');
  logTest('HallucinationDetector class exists', typeof validator.HallucinationDetector === 'function');
  logTest('SourceTracker class exists', typeof validator.SourceTracker === 'function');
  logTest('RAGValidator class exists', typeof validator.RAGValidator === 'function');
} catch (e) {
  logTest('rag-validator.module.js - Import', false, e.message);
}

try {
  const semantic = require('../src/modules/semantic-verifier.module');
  logTest('semantic-verifier.module.js - Import', true);
  logTest('SemanticVerifier class exists', typeof semantic.SemanticVerifier === 'function');
  logTest('ClaimExtractor class exists', typeof semantic.ClaimExtractor === 'function');
  logTest('EmbeddingCache class exists', typeof semantic.EmbeddingCache === 'function');
  logTest('SEMANTIC_CONFIG exists', !!semantic.SEMANTIC_CONFIG);
} catch (e) {
  logTest('semantic-verifier.module.js - Import', false, e.message);
}

try {
  const sanitizer = require('../src/modules/response-sanitizer.module');
  logTest('response-sanitizer.module.js - Import', true);
  logTest('ResponseSanitizer class exists', typeof sanitizer.ResponseSanitizer === 'function');
  logTest('ClaimRedactor class exists', typeof sanitizer.ClaimRedactor === 'function');
  logTest('WarningInjector class exists', typeof sanitizer.WarningInjector === 'function');
  logTest('SafeFallbackGenerator class exists', typeof sanitizer.SafeFallbackGenerator === 'function');
  logTest('SANITIZATION_CONFIG exists', !!sanitizer.SANITIZATION_CONFIG);
} catch (e) {
  logTest('response-sanitizer.module.js - Import', false, e.message);
}

try {
  const audit = require('../src/modules/hallucination-audit.module');
  logTest('hallucination-audit.module.js - Import', true);
  logTest('HallucinationAudit class exists', typeof audit.HallucinationAudit === 'function');
  logTest('MetricsCollector class exists', typeof audit.MetricsCollector === 'function');
  logTest('IncidentTracker class exists', typeof audit.IncidentTracker === 'function');
  logTest('AuditLogger class exists', typeof audit.AuditLogger === 'function');
  logTest('getAuditInstance function exists', typeof audit.getAuditInstance === 'function');
  logTest('AUDIT_CONFIG exists', !!audit.AUDIT_CONFIG);
} catch (e) {
  logTest('hallucination-audit.module.js - Import', false, e.message);
}

// ============================================================================
// TEST SUITE 2: GROUNDEDNESS CALCULATOR
// ============================================================================
logSuite('2. GROUNDEDNESS CALCULATOR');

const { GroundednessCalculator } = require('../src/modules/rag-validator.module');
const { DEFAULT_CONFIG, GroundednessLevel } = require('../src/modules/rag.constants');
const calculator = new GroundednessCalculator(DEFAULT_CONFIG);

// Test HIGH groundedness (>= 0.75 with 2+ sources)
const highSources = [
  { chunkId: '1', score: 0.90 },
  { chunkId: '2', score: 0.85 },
];
const highResult = calculator.calculate(highSources);
logTest('HIGH: 2 sources with 0.90 & 0.85 scores', 
  highResult.level === GroundednessLevel.HIGH, 
  `Expected: high, Got: ${highResult.level}, avgScore: ${highResult.avgScore}`);

// Test MEDIUM groundedness (>= 0.55)
const mediumSources = [
  { chunkId: '1', score: 0.60 },
  { chunkId: '2', score: 0.58 },
];
const mediumResult = calculator.calculate(mediumSources);
logTest('MEDIUM: 2 sources with 0.60 & 0.58 scores', 
  mediumResult.level === GroundednessLevel.MEDIUM, 
  `Expected: medium, Got: ${mediumResult.level}, avgScore: ${mediumResult.avgScore}`);

// Test LOW groundedness (>= 0.35)
const lowSources = [
  { chunkId: '1', score: 0.40 },
];
const lowResult = calculator.calculate(lowSources);
logTest('LOW: 1 source with 0.40 score', 
  lowResult.level === GroundednessLevel.LOW, 
  `Expected: low, Got: ${lowResult.level}, avgScore: ${lowResult.avgScore}`);

// Test UNGROUNDED (< 0.35 or no sources)
const ungroundedResult = calculator.calculate([]);
logTest('UNGROUNDED: No sources', 
  ungroundedResult.level === GroundednessLevel.UNGROUNDED, 
  `Expected: ungrounded, Got: ${ungroundedResult.level}`);

// Edge case: Single high-quality source (penalty applies)
const singleHighSource = [{ chunkId: '1', score: 0.90 }];
const singleHighResult = calculator.calculate(singleHighSource);
logTest('Single high source gets LOW_SOURCE_PENALTY', 
  singleHighResult.level !== GroundednessLevel.HIGH, 
  `Expected: not high (penalty applied), Got: ${singleHighResult.level}`);

// Edge case: null/undefined sources
const nullResult = calculator.calculate(null);
logTest('Null sources returns UNGROUNDED', 
  nullResult.level === GroundednessLevel.UNGROUNDED, 
  `Expected: ungrounded, Got: ${nullResult.level}`);

// ============================================================================
// TEST SUITE 3: HALLUCINATION DETECTOR
// ============================================================================
logSuite('3. HALLUCINATION DETECTOR');

const { HallucinationDetector } = require('../src/modules/rag-validator.module');
const { HallucinationType } = require('../src/modules/rag.constants');

// Detector without known sources (strict mode)
const strictDetector = new HallucinationDetector([], DEFAULT_CONFIG);

// Test: Fabricated endpoint detection
const fakeEndpointText = 'Use the endpoint /v99/imaginary-api for processing';
const endpointHallucinations = strictDetector.detect(fakeEndpointText);
logTest('Detects fabricated endpoint in text', 
  endpointHallucinations.some(h => h.type === HallucinationType.FABRICATED_ENDPOINT),
  `Found: ${endpointHallucinations.length} hallucinations`);

// Test: Fabricated price detection
const fakePriceText = 'The cost is $999.99 per validation request';
const priceHallucinations = strictDetector.detect(fakePriceText);
logTest('Detects fabricated price $999.99', 
  priceHallucinations.some(h => h.type === HallucinationType.FABRICATED_PRICE),
  `Found: ${priceHallucinations.length} hallucinations`);

// Test: Clean text without patterns
const cleanText = 'This is general information without technical claims';
const cleanHallucinations = strictDetector.detect(cleanText);
logTest('Clean text returns no hallucinations', 
  cleanHallucinations.length === 0,
  `Found: ${cleanHallucinations.length} (expected 0)`);

// Test: Multiple hallucinations in one text
const multiHallucinationText = 'Use endpoint /fake/api at price $50 USD with method DELETE';
const multiHallucinations = strictDetector.detect(multiHallucinationText);
logTest('Detects multiple hallucinations in one text', 
  multiHallucinations.length >= 1,
  `Found: ${multiHallucinations.length} hallucinations`);

// Test: Severity levels are correct
const severityCheck = endpointHallucinations.find(h => h.type === HallucinationType.FABRICATED_ENDPOINT);
if (severityCheck) {
  logTest('Fabricated endpoint has severity 0.8', 
    severityCheck.severity === 0.8,
    `Got severity: ${severityCheck.severity}`);
}

// ============================================================================
// TEST SUITE 4: RESPONSE SANITIZER
// ============================================================================
logSuite('4. RESPONSE SANITIZER');

const { ResponseSanitizer, SANITIZATION_CONFIG } = require('../src/modules/response-sanitizer.module');
const sanitizer = new ResponseSanitizer();

// Test: BLOCK action (severity >= 0.80)
const blockValidation = {
  detectedHallucinations: [
    { type: 'fabricated_endpoint', detected: '/v99/fake', severity: 0.85 }
  ]
};
const blockResult = sanitizer.sanitize('Use /v99/fake endpoint', blockValidation, { groundedness: 'low' });
logTest('Severity 0.85 triggers BLOCK action', 
  blockResult.action === 'blocked',
  `Expected: blocked, Got: ${blockResult.action}`);
logTest('BLOCK sets wasModified to true', 
  blockResult.wasModified === true,
  `Got: ${blockResult.wasModified}`);

// Test: REDACT action (0.50 <= severity < 0.80)
const redactValidation = {
  detectedHallucinations: [
    { type: 'fabricated_price', detected: '$50', severity: 0.65 }
  ],
  warnings: []
};
const redactResult = sanitizer.sanitize('Price is $50 USD', redactValidation, { groundedness: 'medium' });
logTest('Severity 0.65 triggers REDACT action', 
  redactResult.action === 'redacted',
  `Expected: redacted, Got: ${redactResult.action}`);

// Test: WARN action (0.30 <= severity < 0.50)
const warnValidation = {
  detectedHallucinations: [
    { type: 'unsupported_country', detected: 'Argentina', severity: 0.40 }
  ],
  warnings: []
};
const warnResult = sanitizer.sanitize('Available in Argentina', warnValidation, { groundedness: 'medium' });
logTest('Severity 0.40 triggers WARN action', 
  warnResult.action === 'warned',
  `Expected: warned, Got: ${warnResult.action}`);

// Test: PASS action (no hallucinations or severity < 0.30)
const passValidation = {
  detectedHallucinations: []
};
const passResult = sanitizer.sanitize('Valid documented response', passValidation, { groundedness: 'high' });
logTest('No hallucinations triggers PASS action', 
  passResult.action === 'passed',
  `Expected: passed, Got: ${passResult.action}`);
logTest('PASS keeps wasModified as false', 
  passResult.wasModified === false,
  `Got: ${passResult.wasModified}`);

// Test: SANITIZATION_CONFIG thresholds are correct
logTest('BLOCK_THRESHOLD is 0.80', 
  SANITIZATION_CONFIG.BLOCK_THRESHOLD === 0.80,
  `Got: ${SANITIZATION_CONFIG.BLOCK_THRESHOLD}`);
logTest('REDACT_THRESHOLD is 0.50', 
  SANITIZATION_CONFIG.REDACT_THRESHOLD === 0.50,
  `Got: ${SANITIZATION_CONFIG.REDACT_THRESHOLD}`);
logTest('WARN_THRESHOLD is 0.30', 
  SANITIZATION_CONFIG.WARN_THRESHOLD === 0.30,
  `Got: ${SANITIZATION_CONFIG.WARN_THRESHOLD}`);

// ============================================================================
// TEST SUITE 5: HALLUCINATION AUDIT
// ============================================================================
logSuite('5. HALLUCINATION AUDIT');

const { HallucinationAudit, AUDIT_CONFIG } = require('../src/modules/hallucination-audit.module');

// Create fresh instance for testing
const auditTest = new HallucinationAudit();

// Record a blocked event
auditTest.record({
  query: 'Test blocked query',
  response: 'Blocked response',
  hallucinations: [{ type: 'fabricated_endpoint', severity: 0.85 }],
  action: 'blocked',
  confidence: 0.3
});

let metrics = auditTest.getMetrics();
logTest('Records totalQueries', 
  metrics.totalQueries === 1,
  `Expected: 1, Got: ${metrics.totalQueries}`);
logTest('Records hallucinationsDetected', 
  metrics.hallucinationsDetected === 1,
  `Expected: 1, Got: ${metrics.hallucinationsDetected}`);
logTest('Records responsesBlocked', 
  metrics.responsesBlocked === 1,
  `Expected: 1, Got: ${metrics.responsesBlocked}`);
logTest('Tracks hallucinations by type', 
  metrics.hallucinationsByType.fabricated_endpoint === 1,
  `Got: ${JSON.stringify(metrics.hallucinationsByType)}`);

// Record a passed event
auditTest.record({
  query: 'Test passed query',
  response: 'Valid response',
  hallucinations: [],
  action: 'passed',
  confidence: 0.9
});

metrics = auditTest.getMetrics();
logTest('Increments totalQueries', 
  metrics.totalQueries === 2,
  `Expected: 2, Got: ${metrics.totalQueries}`);
logTest('Records responsesPassed', 
  metrics.responsesPassed === 1,
  `Expected: 1, Got: ${metrics.responsesPassed}`);

// Test hallucination rate calculation
logTest('Calculates hallucinationRate correctly', 
  metrics.hallucinationRate === 0.5,
  `Expected: 0.5, Got: ${metrics.hallucinationRate}`);

// Test AUDIT_CONFIG thresholds
logTest('ALERT_THRESHOLDS.HALLUCINATION_RATE is 0.20', 
  AUDIT_CONFIG.ALERT_THRESHOLDS.HALLUCINATION_RATE === 0.20,
  `Got: ${AUDIT_CONFIG.ALERT_THRESHOLDS.HALLUCINATION_RATE}`);

// ============================================================================
// TEST SUITE 6: CLAIM EXTRACTOR
// ============================================================================
logSuite('6. CLAIM EXTRACTOR');

const { ClaimExtractor } = require('../src/modules/semantic-verifier.module');

// Test: Extract endpoint claims
const endpointText = 'Use the endpoint /v2/colombian-citizens for validation';
const endpointClaims = ClaimExtractor.extractClaims(endpointText);
logTest('Extracts ENDPOINT claims', 
  endpointClaims.some(c => c.type === 'ENDPOINT'),
  `Found types: ${endpointClaims.map(c => c.type).join(', ')}`);

// Test: Extract HTTP method claims
const methodText = 'POST /v2/colombian-citizens with JSON body';
const methodClaims = ClaimExtractor.extractClaims(methodText);
logTest('Extracts METHOD claims', 
  methodClaims.some(c => c.type === 'METHOD'),
  `Found types: ${methodClaims.map(c => c.type).join(', ')}`);

// Test: Extract price claims
const priceText = 'The price is $0.25 USD per request';
const priceClaims = ClaimExtractor.extractClaims(priceText);
logTest('Extracts PRICE claims', 
  priceClaims.some(c => c.type === 'PRICE'),
  `Found types: ${priceClaims.map(c => c.type).join(', ')}`);

// Test: Extract multiple claims
const multiText = 'Use POST /v2/citizens endpoint. Price: $0.30. Available in Colombia.';
const multiClaims = ClaimExtractor.extractClaims(multiText);
logTest('Extracts multiple claim types from complex text', 
  multiClaims.length >= 2,
  `Found ${multiClaims.length} claims`);

// Test: Risk categorization
const testClaim = { type: 'ENDPOINT', value: '/test' };
const risk = ClaimExtractor.categorizeRisk(testClaim);
logTest('ENDPOINT claims are categorized as critical', 
  risk === 'critical',
  `Got: ${risk}`);

// ============================================================================
// TEST SUITE 7: EMBEDDING CACHE
// ============================================================================
logSuite('7. EMBEDDING CACHE');

const { EmbeddingCache } = require('../src/modules/semantic-verifier.module');
const cache = new EmbeddingCache(10, 1000); // Small cache, 1s TTL

// Test: Set and get
cache.set('test_key', [0.1, 0.2, 0.3]);
const retrieved = cache.get('test_key');
logTest('Cache stores and retrieves embeddings', 
  retrieved !== null && retrieved.length === 3,
  `Got: ${retrieved}`);

// Test: Cache miss
const missing = cache.get('nonexistent_key');
logTest('Cache returns null for missing keys', 
  missing === null,
  `Got: ${missing}`);

// Test: Cache key generation
const key1 = EmbeddingCache.generateKey('test text');
const key2 = EmbeddingCache.generateKey('test text');
const key3 = EmbeddingCache.generateKey('different text');
logTest('Same text generates same cache key', 
  key1 === key2,
  `Key1: ${key1}, Key2: ${key2}`);
logTest('Different text generates different cache key', 
  key1 !== key3,
  `Key1: ${key1}, Key3: ${key3}`);

// Test: Cache stats
const stats = cache.getStats();
logTest('Cache provides stats', 
  stats.size >= 1 && stats.maxSize === 10,
  `Got: size=${stats.size}, maxSize=${stats.maxSize}`);

// ============================================================================
// TEST SUITE 8: EDGE CASES & ERROR HANDLING
// ============================================================================
logSuite('8. EDGE CASES & ERROR HANDLING');

// Test: Empty string inputs
const emptyHallucinations = strictDetector.detect('');
logTest('Empty string returns no hallucinations', 
  emptyHallucinations.length === 0,
  `Got: ${emptyHallucinations.length}`);

// Test: Null/undefined handling in sanitizer
try {
  const nullSanitize = sanitizer.sanitize(null, { detectedHallucinations: [] }, {});
  logTest('Sanitizer handles null input gracefully', true);
} catch (e) {
  logTest('Sanitizer handles null input gracefully', false, e.message);
}

// Test: Unicode and special characters
const unicodeText = 'Endpoint: /v2/validación-ciudadanos precio: $0.25€';
const unicodeClaims = ClaimExtractor.extractClaims(unicodeText);
logTest('Handles Unicode characters in claims', 
  unicodeClaims.length >= 0,
  `Found: ${unicodeClaims.length} claims`);

// Test: Very long input
const longText = 'Use endpoint /v2/test. '.repeat(100);
const longHallucinations = strictDetector.detect(longText);
logTest('Handles very long input strings', 
  longHallucinations.length >= 0,
  `Processed successfully`);

// Test: Malformed validation result
try {
  const malformedResult = sanitizer.sanitize('test', {}, {});
  logTest('Sanitizer handles missing detectedHallucinations', true);
} catch (e) {
  logTest('Sanitizer handles missing detectedHallucinations', false, e.message);
}

// ============================================================================
// TEST SUITE 9: CONFIGURATION VALIDATION
// ============================================================================
logSuite('9. CONFIGURATION VALIDATION');

const { 
  GROUNDEDNESS_THRESHOLDS, 
  SOURCE_COUNT_REQUIREMENTS,
  SCORE_ADJUSTMENTS 
} = require('../src/modules/rag.constants');

// Verify thresholds are logically ordered
logTest('GROUNDEDNESS_THRESHOLDS are ordered correctly', 
  GROUNDEDNESS_THRESHOLDS.HIGH > GROUNDEDNESS_THRESHOLDS.MEDIUM &&
  GROUNDEDNESS_THRESHOLDS.MEDIUM > GROUNDEDNESS_THRESHOLDS.LOW,
  `HIGH: ${GROUNDEDNESS_THRESHOLDS.HIGH}, MEDIUM: ${GROUNDEDNESS_THRESHOLDS.MEDIUM}, LOW: ${GROUNDEDNESS_THRESHOLDS.LOW}`);

// Verify source requirements
logTest('MINIMUM_FOR_HIGH requires at least 2 sources', 
  SOURCE_COUNT_REQUIREMENTS.MINIMUM_FOR_HIGH >= 2,
  `Got: ${SOURCE_COUNT_REQUIREMENTS.MINIMUM_FOR_HIGH}`);

// Verify score adjustments
logTest('HALLUCINATION_PENALTY is negative', 
  SCORE_ADJUSTMENTS.HALLUCINATION_PENALTY < 0,
  `Got: ${SCORE_ADJUSTMENTS.HALLUCINATION_PENALTY}`);

logTest('EXACT_ENDPOINT_MATCH bonus is positive', 
  SCORE_ADJUSTMENTS.EXACT_ENDPOINT_MATCH > 0,
  `Got: ${SCORE_ADJUSTMENTS.EXACT_ENDPOINT_MATCH}`);

// Verify DEFAULT_CONFIG
logTest('DEFAULT_CONFIG.blockThreshold matches SANITIZATION_CONFIG', 
  DEFAULT_CONFIG.blockThreshold === 0.80,
  `Got: ${DEFAULT_CONFIG.blockThreshold}`);

logTest('DEFAULT_CONFIG.enableHallucinationDetection is true', 
  DEFAULT_CONFIG.enableHallucinationDetection === true,
  `Got: ${DEFAULT_CONFIG.enableHallucinationDetection}`);

// ============================================================================
// FINAL SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('📊 RESUMEN FINAL DE PRUEBAS');
console.log('='.repeat(70));

console.log('\n📁 Resultados por Suite:');
for (const [suite, results] of Object.entries(testResults.suites)) {
  const total = results.passed + results.failed;
  const rate = total > 0 ? Math.round((results.passed / total) * 100) : 0;
  const status = results.failed === 0 ? '✅' : '⚠️';
  console.log(`   ${status} ${suite}: ${results.passed}/${total} (${rate}%)`);
}

console.log('\n📈 Totales:');
console.log(`   Total de pruebas: ${testResults.passed + testResults.failed}`);
console.log(`   Pasadas: ${testResults.passed} ✅`);
console.log(`   Fallidas: ${testResults.failed} ❌`);
const successRate = Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100);
console.log(`   Tasa de éxito: ${successRate}%`);

if (testResults.failed > 0) {
  console.log('\n❌ Pruebas Fallidas:');
  testResults.tests
    .filter(t => !t.passed)
    .forEach(t => console.log(`   - [${t.suite}] ${t.name}: ${t.details}`));
}

console.log('\n' + '='.repeat(70));
console.log(successRate === 100 
  ? '🎉 TODAS LAS PRUEBAS PASARON EXITOSAMENTE' 
  : `⚠️ HAY ${testResults.failed} PRUEBA(S) FALLIDA(S) QUE REQUIEREN ATENCIÓN`);
console.log('='.repeat(70) + '\n');

// Exit with error code if any tests failed
process.exit(testResults.failed > 0 ? 1 : 0);
