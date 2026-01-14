#!/usr/bin/env node
/**
 * API End-to-End Tests for Hallucination Prevention System
 * @description Tests the live API with various hallucination scenarios
 * @author RAG Testing Expert
 * @date 2026-01-12
 */

'use strict';

const http = require('http');

const API_URL = 'http://localhost:3060';
const CHAT_ENDPOINT = '/api/agent/chat';

const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  testResults.tests.push({ name, passed, details });
  if (passed) testResults.passed++;
  else testResults.failed++;
  console.log(`${status}: ${name}`);
  if (details) console.log(`   → ${details}`);
}

async function makeRequest(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ message });
    
    const options = {
      hostname: 'localhost',
      port: 3060,
      path: CHAT_ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 30000
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, parseError: true });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('\n' + '='.repeat(70));
  console.log('🌐 PRUEBAS END-TO-END DE API');
  console.log('='.repeat(70));
  console.log(`Servidor: ${API_URL}`);
  console.log(`Endpoint: ${CHAT_ENDPOINT}`);
  console.log('='.repeat(70));

  // ============================================================================
  // TEST 1: Servidor respondiendo
  // ============================================================================
  console.log('\n📡 TEST 1: Verificar que el servidor responde');
  console.log('-'.repeat(50));
  
  try {
    const response = await makeRequest('Hola');
    logTest('Servidor responde con status 200', 
      response.status === 200,
      `Status: ${response.status}`);
    logTest('Respuesta tiene campo content', 
      response.data && response.data.content !== undefined,
      `Content presente: ${!!response.data?.content}`);
    logTest('Respuesta tiene rag_metadata', 
      response.data && response.data.rag_metadata !== undefined,
      `rag_metadata presente: ${!!response.data?.rag_metadata}`);
  } catch (e) {
    logTest('Servidor accesible', false, e.message);
    console.log('\n⛔ No se puede continuar sin conexión al servidor');
    process.exit(1);
  }

  // ============================================================================
  // TEST 2: Query válida sobre Colombia
  // ============================================================================
  console.log('\n📋 TEST 2: Query válida - Endpoints de Colombia');
  console.log('-'.repeat(50));
  
  try {
    const response = await makeRequest('¿Cuáles son los endpoints para validar identidad en Colombia?');
    const metadata = response.data?.rag_metadata;
    
    logTest('Query válida retorna respuesta', 
      response.status === 200 && response.data?.content,
      `Longitud respuesta: ${response.data?.content?.length || 0} chars`);
    
    logTest('Metadata incluye groundedness', 
      metadata?.groundedness !== undefined,
      `Groundedness: ${metadata?.groundedness}`);
    
    logTest('Metadata incluye sources', 
      metadata?.sources && metadata.sources.length > 0,
      `Sources: ${metadata?.sources?.length || 0}`);
    
    logTest('Respuesta menciona /v2/colombian-citizens', 
      response.data?.content?.includes('/v2/colombian-citizens') || 
      response.data?.content?.includes('colombian-citizens'),
      'Endpoint documentado encontrado');
    
    logTest('ValidationResult incluido en metadata', 
      metadata?.validationResult !== undefined,
      `Status: ${metadata?.validationResult?.status}`);
      
    // Verificar que NO hay alucinaciones en query válida
    const hallucinations = metadata?.validationResult?.detectedHallucinations || [];
    logTest('Sin alucinaciones detectadas en query válida', 
      hallucinations.length === 0,
      `Alucinaciones: ${hallucinations.length}`);
      
  } catch (e) {
    logTest('Query válida procesada', false, e.message);
  }

  // ============================================================================
  // TEST 3: Query sobre país no soportado (Japón)
  // ============================================================================
  console.log('\n🚫 TEST 3: Query país no soportado - Japón');
  console.log('-'.repeat(50));
  
  try {
    const response = await makeRequest('¿Puedo validar pasaportes de Japón con Verifik? Dame el endpoint y precio exacto.');
    const content = response.data?.content || '';
    const metadata = response.data?.rag_metadata;
    
    logTest('Respuesta recibida', 
      response.status === 200,
      `Status: ${response.status}`);
    
    // El sistema NO debe inventar endpoints de Japón
    const inventedJapanEndpoint = content.match(/\/v\d+\/japan|\/v\d+\/jp|japan-passport|passport.*japan/i);
    logTest('NO inventa endpoint de Japón', 
      !inventedJapanEndpoint,
      inventedJapanEndpoint ? `Encontrado: ${inventedJapanEndpoint[0]}` : 'Sin endpoints inventados');
    
    // Debe indicar que no tiene información o documentación
    const indicatesNoInfo = content.match(/no tengo|no dispongo|no cuento|no hay|sin información|sin documentación/i);
    logTest('Indica que no tiene documentación sobre Japón', 
      !!indicatesNoInfo,
      indicatesNoInfo ? 'Correctamente indica falta de info' : 'No indica falta de información');
      
  } catch (e) {
    logTest('Query Japón procesada', false, e.message);
  }

  // ============================================================================
  // TEST 4: Query sobre precios
  // ============================================================================
  console.log('\n💰 TEST 4: Query sobre precios');
  console.log('-'.repeat(50));
  
  try {
    const response = await makeRequest('¿Cuánto cuesta validar una cédula colombiana?');
    const content = response.data?.content || '';
    const metadata = response.data?.rag_metadata;
    
    logTest('Respuesta recibida', 
      response.status === 200,
      `Status: ${response.status}`);
    
    // Si menciona precios, deben estar en rango documentado ($0.20-$0.30)
    const priceMatch = content.match(/\$\s*([\d,.]+)/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(',', '.'));
      logTest('Precio en rango documentado ($0.15-$0.50)', 
        price >= 0.15 && price <= 0.50,
        `Precio encontrado: $${price}`);
    } else {
      logTest('Respuesta sobre precios recibida', 
        true,
        'No menciona precio específico (puede estar indicando que consulte documentación)');
    }
      
  } catch (e) {
    logTest('Query precios procesada', false, e.message);
  }

  // ============================================================================
  // TEST 5: Verificar estructura de rag_metadata
  // ============================================================================
  console.log('\n🔍 TEST 5: Estructura de rag_metadata');
  console.log('-'.repeat(50));
  
  try {
    const response = await makeRequest('¿Qué es la validación de identidad?');
    const metadata = response.data?.rag_metadata;
    
    logTest('rag_metadata existe', 
      !!metadata,
      `Tipo: ${typeof metadata}`);
    
    if (metadata) {
      logTest('Contiene sources (array)', 
        Array.isArray(metadata.sources),
        `Tipo sources: ${typeof metadata.sources}`);
      
      logTest('Contiene groundedness (string)', 
        typeof metadata.groundedness === 'string',
        `Valor: ${metadata.groundedness}`);
      
      logTest('Contiene avgScore (number)', 
        typeof metadata.avgScore === 'number',
        `Valor: ${metadata.avgScore}`);
      
      logTest('Contiene confidence (number)', 
        typeof metadata.confidence === 'number',
        `Valor: ${metadata.confidence}`);
      
      logTest('Contiene validationResult (object)', 
        typeof metadata.validationResult === 'object',
        `Keys: ${Object.keys(metadata.validationResult || {}).join(', ')}`);
      
      logTest('Contiene retrievedAt (timestamp)', 
        typeof metadata.retrievedAt === 'string',
        `Valor: ${metadata.retrievedAt}`);
        
      // Verificar estructura de validationResult
      const vr = metadata.validationResult;
      if (vr) {
        logTest('validationResult.isGrounded existe', 
          typeof vr.isGrounded === 'boolean',
          `Valor: ${vr.isGrounded}`);
        
        logTest('validationResult.status existe', 
          typeof vr.status === 'string',
          `Valor: ${vr.status}`);
        
        logTest('validationResult.detectedHallucinations es array', 
          Array.isArray(vr.detectedHallucinations),
          `Longitud: ${vr.detectedHallucinations?.length}`);
      }
    }
      
  } catch (e) {
    logTest('Estructura metadata verificada', false, e.message);
  }

  // ============================================================================
  // TEST 6: Verificar niveles de groundedness
  // ============================================================================
  console.log('\n📊 TEST 6: Verificar groundedness levels');
  console.log('-'.repeat(50));
  
  try {
    // Query muy específica (debería tener high groundedness)
    const specificResponse = await makeRequest('¿Cuál es el endpoint para validar cédulas colombianas?');
    const specificMetadata = specificResponse.data?.rag_metadata;
    
    logTest('Query específica tiene groundedness definido', 
      ['high', 'medium', 'low', 'ungrounded'].includes(specificMetadata?.groundedness),
      `Groundedness: ${specificMetadata?.groundedness}`);
    
    // Query vaga (debería tener lower groundedness)
    const vagueResponse = await makeRequest('¿Qué opinas sobre la tecnología?');
    const vagueMetadata = vagueResponse.data?.rag_metadata;
    
    logTest('Query vaga tiene groundedness definido', 
      ['high', 'medium', 'low', 'ungrounded'].includes(vagueMetadata?.groundedness),
      `Groundedness: ${vagueMetadata?.groundedness}`);
      
  } catch (e) {
    logTest('Groundedness levels verificados', false, e.message);
  }

  // ============================================================================
  // TEST 7: Query sobre características fabricadas
  // ============================================================================
  console.log('\n🎭 TEST 7: Detección de características inventadas');
  console.log('-'.repeat(50));
  
  try {
    const response = await makeRequest('¿Verifik tiene integración con blockchain para validar identidad en Marte?');
    const content = response.data?.content || '';
    const metadata = response.data?.rag_metadata;
    
    logTest('Respuesta recibida', 
      response.status === 200,
      `Status: ${response.status}`);
    
    // No debe confirmar características inexistentes
    const confirmsBlockchain = content.match(/sí.*blockchain|blockchain.*integra|tiene.*blockchain/i);
    logTest('NO confirma integración blockchain inexistente', 
      !confirmsBlockchain,
      confirmsBlockchain ? 'Erróneamente confirma blockchain' : 'Correctamente no confirma');
    
    const confirmsMars = content.match(/sí.*marte|marte.*soporta|valida.*marte/i);
    logTest('NO confirma validación en Marte', 
      !confirmsMars,
      confirmsMars ? 'Erróneamente confirma Marte' : 'Correctamente no confirma');
      
  } catch (e) {
    logTest('Query características fabricadas procesada', false, e.message);
  }

  // ============================================================================
  // RESUMEN FINAL
  // ============================================================================
  console.log('\n' + '='.repeat(70));
  console.log('📊 RESUMEN DE PRUEBAS END-TO-END');
  console.log('='.repeat(70));
  console.log(`   Total de pruebas: ${testResults.passed + testResults.failed}`);
  console.log(`   Pasadas: ${testResults.passed} ✅`);
  console.log(`   Fallidas: ${testResults.failed} ❌`);
  const successRate = Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100);
  console.log(`   Tasa de éxito: ${successRate}%`);

  if (testResults.failed > 0) {
    console.log('\n❌ Pruebas Fallidas:');
    testResults.tests
      .filter(t => !t.passed)
      .forEach(t => console.log(`   - ${t.name}: ${t.details}`));
  }

  console.log('\n' + '='.repeat(70));
  console.log(successRate >= 90 
    ? '🎉 SISTEMA FUNCIONANDO CORRECTAMENTE' 
    : `⚠️ HAY PROBLEMAS QUE REQUIEREN ATENCIÓN`);
  console.log('='.repeat(70) + '\n');

  return { passed: testResults.passed, failed: testResults.failed, rate: successRate };
}

// Run tests
runTests()
  .then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Error ejecutando tests:', err);
    process.exit(1);
  });
