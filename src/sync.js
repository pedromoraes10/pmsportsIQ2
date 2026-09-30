'use strict';

/**
 * Sincronizador local → Railway
 *
 * Quando SYNC_URL e SYNC_TOKEN estão definidos (no .env local),
 * envia automaticamente cada resultado de scrape para o servidor
 * de produção após salvar localmente.
 *
 * Configuração local (.env):
 *   SYNC_URL=https://pmsportsiq-production.up.railway.app
 *   SYNC_TOKEN=seu-token-secreto
 *
 * Configuração Railway (Variables):
 *   SYNC_TOKEN=seu-token-secreto   ← mesmo valor
 */

const axios = require('axios');

const SYNC_URL = process.env.SYNC_URL || '';
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';

if (SYNC_URL) {
  console.log(`☁️  Auto-sync ativo: dados serão enviados para ${SYNC_URL} após cada scrape.`);
}

/**
 * Envia um resultado de scrape para o servidor de produção.
 * Falha silenciosamente (só loga o erro) para não interromper o fluxo local.
 *
 * @param {object} data - Resultado completo do scrape de um jogador
 * @param {string} filename - Nome do arquivo (ex: "neymar_54814.json")
 */
async function syncToProduction(data, filename) {
  if (!SYNC_URL || !SYNC_TOKEN) return;

  const url = `${SYNC_URL.replace(/\/$/, '')}/api/sync/upload`;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await axios.post(
        url,
        { filename, data },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Sync-Token': SYNC_TOKEN,
          },
          timeout: 25000,
        }
      );
      console.log(`  ☁️  Sincronizado com Railway: ${filename}`);
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.warn(
          `  ⚠️  Falha ao sincronizar ${filename} com Railway após ${maxAttempts} tentativas: ${err.message}`
        );
        return;
      }
      console.warn(`  ⚠️  Tentativa ${attempt}/${maxAttempts} falhou (${filename}): ${err.message}. Tentando de novo...`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
}

module.exports = { syncToProduction, SYNC_URL };
