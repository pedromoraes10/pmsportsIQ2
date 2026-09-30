'use strict';

const { chromium } = require('playwright');
const { sleep } = require('./humanDelay');
const { USER_AGENTS } = require('./config');

let browser = null;

function pickUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Retorna (ou inicializa) a instância única do Chromium headless.
 * Reutilizar o browser entre requests economiza memória e tempo de startup.
 */
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    console.log('🔵 Iniciando Chromium headless (Playwright)...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // essencial em containers Docker
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--no-first-run',
        // Esconde o sinal mais óbvio de automação (navigator.webdriver=true
        // e afins) — sites com proteção anti-bot mais forte que o ogol
        // (ex: transfermarkt) podem detectar isso e servir uma página de
        // desafio/bloqueio em vez do conteúdo real, mesmo com Chromium real.
        '--disable-blink-features=AutomationControlled',
      ],
    });
    console.log('✅ Chromium pronto.');
  }
  return browser;
}

/**
 * Navega até uma URL usando um browser real e retorna o HTML da página.
 * Cada chamada abre um contexto isolado (aba limpa) e fecha ao terminar.
 *
 * @param {string} url - URL absoluta a visitar
 * @param {{ referer?: string }} opts
 * @returns {Promise<string>} HTML da página
 */
async function browserGet(url, { referer } = {}) {
  const b = await getBrowser();

  const context = await b.newContext({
    userAgent: pickUserAgent(),
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1366, height: 768 },
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  // Some anti-bot checks read navigator.webdriver directly via JS antes de
  // decidir se servem a página real ou uma tela de desafio/bloqueio.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    // Se tem referer, visita ele primeiro para simular navegação orgânica
    if (referer) {
      await page.goto(referer, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await sleep(800 + Math.floor(Math.random() * 1200));
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Pequena pausa para JS carregar e parecer humano
    await sleep(600 + Math.floor(Math.random() * 800));

    return await page.content();
  } finally {
    await context.close();
  }
}

module.exports = { browserGet };
