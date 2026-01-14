#!/usr/bin/env node
/**
 * Stress Test & Performance Analysis for Hallucination Prevention System
 * @description Tests system performance under load
 * @author RAG Testing Expert
 * @date 2026-01-12
 */

'use strict';

const http = require('http');

const API_URL = 'http://localhost:3060';
const CHAT_ENDPOINT = '/api/agent/chat';

// Test queries
const TEST_QUERIES = [
  '¿Cuáles son los endpoints para validar identidad en Colombia?',
  '¿Cuánto cuesta validar una cédula?',
  '¿Qué es la validación de identidad?',
  '¿Cómo funciona el API de Verifik?',
  '¿Puedo validar documentos de México?'
];

const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  responseTimes: [],
  groundednessLevels: { high: 0, medium: 0, low: 0, ungrounded: 0 },
  hallucinationsDetected: 0,
  blockedResponses: 0,
  errors: []
};

async function makeRequest(message) {
  const startTime = Date.now();
  
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
      timeout: 60000
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        try {
          const parsed = JSON.parse(body);
          resolve({ 
            status: res.statusCode, 
            data: parsed,
            responseTime 
          });
        } catch (e) {
          resolve({ 
            status: res.statusCode, 
            data: body, 
            parseError: true,
            responseTime 
          });
        }
      });
    });

    req.on('error', (err) => {
      const responseTime = Date.now() - startTime;
      reject({ error: err.message, responseTime });
    });
    
    req.on('timeout', () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      reject({ error: 'Request timeout', responseTime });
    });
    
    req.write(data);
    req.end();
  });
}

async function runSingleRequest(query, index) {
  metrics.totalRequests++;
  
  try {
    const response = await makeRequest(query);
    
    if (response.status === 200) {
      metrics.successfulRequests++;
      metrics.responseTimes.push(response.responseTime);
      
      const metadata = response.data?.rag_metadata;
      if (metadata) {
        // Track groundedness levels
        const level = metadata.groundedness || 'ungrounded';
        if (metrics.groundednessLevels[level] !== undefined) {
          metrics.groundednessLevels[level]++;
        }
        
        // Track hallucinations
        const hallucinations = metadata.validationResult?.detectedHallucinations || [];
        metrics.hallucinationsDetected += hallucinations.length;
        
        // Track blocked responses
        if (metadata.validationResult?.sanitization?.action === 'blocked') {
          metrics.blockedResponses++;
        }
      }
      
      return { success: true, responseTime: response.responseTime };
    } else {
      metrics.failedRequests++;
      metrics.errors.push(`Request ${index}: Status ${response.status}`);
      return { success: false, responseTime: response.responseTime };
    }
  } catch (err) {
    metrics.failedRequests++;
    metrics.errors.push(`Request ${index}: ${err.error}`);
    return { success: false, error: err.error };
  }
}

async function runSequentialStressTest(numRequests) {
  console.log(`\n🔄 Ejecutando ${numRequests} requests secuenciales...`);
  
  const startTime = Date.now();
  
  for (let i = 0; i < numRequests; i++) {
    const query = TEST_QUERIES[i % TEST_QUERIES.length];
    await runSingleRequest(query, i + 1);
    process.stdout.write(`\r   Progreso: ${i + 1}/${numRequests}`);
  }
  
  const totalTime = Date.now() - startTime;
  console.log(`\n   Tiempo total: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`   Throughput: ${(numRequests / (totalTime / 1000)).toFixed(2)} req/s`);
}

async function runConcurrentStressTest(numRequests, concurrency) {
  console.log(`\n⚡ Ejecutando ${numRequests} requests con concurrencia ${concurrency}...`);
  
  const startTime = Date.now();
  const batches = Math.ceil(numRequests / concurrency);
  let completed = 0;
  
  for (let batch = 0; batch < batches; batch++) {
    const promises = [];
    const batchSize = Math.min(concurrency, numRequests - (batch * concurrency));
    
    for (let i = 0; i < batchSize; i++) {
      const index = batch * concurrency + i;
      const query = TEST_QUERIES[index % TEST_QUERIES.length];
      promises.push(runSingleRequest(query, index + 1));
    }
    
    await Promise.all(promises);
    completed += batchSize;
    process.stdout.write(`\r   Progreso: ${completed}/${numRequests}`);
  }
  
  const totalTime = Date.now() - startTime;
  console.log(`\n   Tiempo total: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`   Throughput: ${(numRequests / (totalTime / 1000)).toFixed(2)} req/s`);
}

function calculateStatistics() {
  const times = metrics.responseTimes;
  
  if (times.length === 0) {
    return {
      min: 0,
      max: 0,
      avg: 0,
      median: 0,
      p95: 0,
      p99: 0
    };
  }
  
  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / times.length),
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)]
  };
}

function printReport() {
  const stats = calculateStatistics();
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 INFORME DE STRESS TEST');
  console.log('='.repeat(70));
  
  console.log('\n📈 Resumen de Requests:');
  console.log(`   Total requests: ${metrics.totalRequests}`);
  console.log(`   Exitosos: ${metrics.successfulRequests} ✅`);
  console.log(`   Fallidos: ${metrics.failedRequests} ❌`);
  console.log(`   Tasa de éxito: ${Math.round((metrics.successfulRequests / metrics.totalRequests) * 100)}%`);
  
  console.log('\n⏱️ Tiempos de Respuesta (ms):');
  console.log(`   Mínimo: ${stats.min}ms`);
  console.log(`   Máximo: ${stats.max}ms`);
  console.log(`   Promedio: ${stats.avg}ms`);
  console.log(`   Mediana: ${stats.median}ms`);
  console.log(`   P95: ${stats.p95}ms`);
  console.log(`   P99: ${stats.p99}ms`);
  
  console.log('\n🎯 Niveles de Groundedness:');
  console.log(`   High: ${metrics.groundednessLevels.high}`);
  console.log(`   Medium: ${metrics.groundednessLevels.medium}`);
  console.log(`   Low: ${metrics.groundednessLevels.low}`);
  console.log(`   Ungrounded: ${metrics.groundednessLevels.ungrounded}`);
  
  console.log('\n🔍 Sistema Anti-Alucinación:');
  console.log(`   Alucinaciones detectadas: ${metrics.hallucinationsDetected}`);
  console.log(`   Respuestas bloqueadas: ${metrics.blockedResponses}`);
  console.log(`   Tasa de alucinación: ${(metrics.hallucinationsDetected / metrics.successfulRequests * 100).toFixed(2)}%`);
  
  if (metrics.errors.length > 0) {
    console.log('\n❌ Errores (primeros 5):');
    metrics.errors.slice(0, 5).forEach(err => console.log(`   - ${err}`));
  }
  
  console.log('\n' + '='.repeat(70));
  
  // Performance grading
  let grade = 'A';
  let gradeEmoji = '🌟';
  
  if (stats.avg > 5000) { grade = 'D'; gradeEmoji = '⚠️'; }
  else if (stats.avg > 3000) { grade = 'C'; gradeEmoji = '📊'; }
  else if (stats.avg > 2000) { grade = 'B'; gradeEmoji = '✅'; }
  
  const successRate = (metrics.successfulRequests / metrics.totalRequests) * 100;
  if (successRate < 95) { grade = 'F'; gradeEmoji = '❌'; }
  else if (successRate < 99) { grade = Math.max(grade, 'C'); gradeEmoji = '⚠️'; }
  
  console.log(`${gradeEmoji} CALIFICACIÓN DE RENDIMIENTO: ${grade}`);
  console.log('='.repeat(70) + '\n');
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 STRESS TEST - HALLUCINATION PREVENTION SYSTEM');
  console.log('='.repeat(70));
  console.log(`Servidor: ${API_URL}`);
  console.log(`Fecha: ${new Date().toISOString()}`);
  
  // Verify server is accessible
  console.log('\n🔌 Verificando conexión al servidor...');
  try {
    await makeRequest('test');
    console.log('   ✅ Servidor accesible');
  } catch (e) {
    console.log('   ❌ No se puede conectar al servidor');
    process.exit(1);
  }
  
  // Run sequential test (5 requests)
  await runSequentialStressTest(5);
  
  // Run concurrent test (10 requests, 3 concurrent)
  await runConcurrentStressTest(10, 3);
  
  // Print final report
  printReport();
}

main().catch(console.error);
