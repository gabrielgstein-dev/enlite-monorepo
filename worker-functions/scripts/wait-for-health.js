/**
 * wait-for-health.js
 *
 * Faz poll em GET /health até a API responder 200 ou o timeout expirar.
 * Usado pelo script test:e2e:docker antes de rodar os testes.
 *
 * Uso: node scripts/wait-for-health.js
 * Env: API_URL (default: http://localhost:8080), HEALTH_TIMEOUT_MS (default: 60000)
 */

const http = require('http');
const https = require('https');

const API_URL = process.env.API_URL || 'http://localhost:8080';
const TIMEOUT_MS = parseInt(process.env.HEALTH_TIMEOUT_MS || '60000', 10);
const INTERVAL_MS = 1000;

const healthUrl = `${API_URL}/health`;

function checkHealth() {
  return new Promise((resolve, reject) => {
    const client = healthUrl.startsWith('https') ? https : http;
    const req = client.get(healthUrl, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        reject(new Error(`Status ${res.statusCode}`));
      }
      res.resume();
    });
    req.on('error', reject);
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

async function waitForHealth() {
  const deadline = Date.now() + TIMEOUT_MS;
  let attempts = 0;

  console.log(`Aguardando API em ${healthUrl} (timeout: ${TIMEOUT_MS / 1000}s)...`);

  while (Date.now() < deadline) {
    attempts++;
    try {
      await checkHealth();
      console.log(`✓ API pronta após ${attempts} tentativa(s)`);
      process.exit(0);
    } catch {
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, INTERVAL_MS));
    }
  }

  console.error(`\n✗ API não ficou pronta em ${TIMEOUT_MS / 1000}s`);
  process.exit(1);
}

waitForHealth();
