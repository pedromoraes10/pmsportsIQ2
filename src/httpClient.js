'use strict';

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const { BASE_URL, USER_AGENTS, RETRY } = require('./config');
const { sleep, jitter } = require('./humanDelay');

// Playwright (Chromium headless) — ativo em produção quando USE_PLAYWRIGHT=true.
// Localmente, as requisições vão direto ao ogol com axios (IP residencial funciona).
const USE_PLAYWRIGHT = process.env.USE_PLAYWRIGHT === 'true';

if (USE_PLAYWRIGHT) {
  console.log('🎭 Playwright ativo: scraping via Chromium headless (bypass bot detection).');
} else {
  console.log('🔗 Modo direto: requisições ao ogol via axios (modo local).');
}

// Um cookiejar por execução do scraper: mantém sessão coerente entre as
// 3 páginas, como faria um navegador real.
const jar = new CookieJar();

const client = wrapper(
  axios.create({
    baseURL: BASE_URL,
    jar,
    withCredentials: true,
    timeout: 20000,
    validateStatus: (status) => status < 500, // trata 4xx manualmente
  })
);

function pickUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Faz um GET "humanizado": usa Playwright (produção) ou axios (local).
 * Mantém retry com backoff exponencial em caso de erro/bloqueio.
 */
async function humanGet(url, { referer } = {}) {
  let attempt = 0;
  let lastErr;

  while (attempt < RETRY.maxAttempts) {
    attempt += 1;
    await jitter();

    try {
      // --- Modo Playwright (produção) ---
      if (USE_PLAYWRIGHT) {
        const { browserGet } = require('./browser');
        const absoluteUrl = url.startsWith('http') ? url : BASE_URL + url;
        const html = await browserGet(absoluteUrl, { referer });
        return html;
      }

      // --- Modo direto via axios (local) ---
      const res = await client.get(url, {
        headers: {
          'User-Agent': pickUserAgent(),
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
          'Sec-Fetch-User': '?1',
          ...(referer ? { Referer: referer } : {}),
        },
      });

      if (res.status === 403 || res.status === 429) {
        const backoff = RETRY.baseBackoffMs * attempt + Math.floor(Math.random() * 2000);
        console.warn(
          `  ⚠️ status ${res.status} em ${url} (tentativa ${attempt}/${RETRY.maxAttempts}). ` +
            `Aguardando ${(backoff / 1000).toFixed(1)}s antes de tentar de novo...`
        );
        await sleep(backoff);
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }

      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status} ao buscar ${url}`);
      }

      return res.data;
    } catch (err) {
      lastErr = err;
      const backoff = RETRY.baseBackoffMs * attempt;
      console.warn(
        `  ⚠️ erro em ${url} (tentativa ${attempt}/${RETRY.maxAttempts}): ${err.message}. ` +
          `Aguardando ${(backoff / 1000).toFixed(1)}s...`
      );
      await sleep(backoff);
    }
  }

  throw lastErr || new Error(`Falha ao buscar ${url} após ${RETRY.maxAttempts} tentativas`);
}

module.exports = { humanGet };
