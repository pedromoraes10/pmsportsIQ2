'use strict';

/**
 * Busca e scraping do Transfermarkt — segunda fonte de dados do projeto
 * (além do ogol.com.br). Diferente do ogol, o perfil do jogador vem inteiro
 * numa página só (dados pessoais + transferências + performance), então não
 * precisa de fila de job/progresso — é um único GET + parse, síncrono.
 *
 * Reaproveita USER_AGENTS e RETRY de src/config.js (genéricos o bastante
 * pra qualquer alvo), mas usa seu próprio cliente HTTP porque a base URL e
 * o comportamento anti-bot são de um site diferente do ogol.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const { USER_AGENTS, RETRY } = require('./config');
const { sleep, jitter } = require('./humanDelay');
const { parseTransfermarktSearch } = require('./parsers/parseTransfermarktSearch');
const { parseTransfermarktProfile } = require('./parsers/parseTransfermarktProfile');
const { OUTPUT_DIR } = require('./paths');

const BASE_URL = 'https://www.transfermarkt.com';
const CACHE_DIR = path.join(OUTPUT_DIR, 'transfermarkt');

// Mesma lógica do ogol (src/httpClient.js): em produção (Railway), o IP de
// datacenter é bloqueado/desafiado por proteção anti-bot muito mais
// agressivamente que um IP residencial local — buscas ficavam "penduradas"
// minutos a fio (5 tentativas x backoff crescente) até falhar. Playwright
// (Chromium real) contorna isso do mesmo jeito que já resolveu pro ogol.
const USE_PLAYWRIGHT = process.env.USE_PLAYWRIGHT === 'true';

if (USE_PLAYWRIGHT) {
  console.log('🎭 [transfermarkt] Playwright ativo: scraping via Chromium headless.');
} else {
  console.log('🔗 [transfermarkt] Modo direto: requisições via axios (sem Playwright).');
}

const jar = new CookieJar();
const client = wrapper(
  axios.create({
    baseURL: BASE_URL,
    jar,
    withCredentials: true,
    timeout: 20000,
    validateStatus: (status) => status < 500,
  })
);

function pickUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function tmGet(urlPath) {
  let attempt = 0;
  let lastErr;

  while (attempt < RETRY.maxAttempts) {
    attempt += 1;
    await jitter();

    try {
      if (USE_PLAYWRIGHT) {
        const { browserGet } = require('./browser');
        return await browserGet(BASE_URL + urlPath, {});
      }

      const res = await client.get(urlPath, {
        headers: {
          'User-Agent': pickUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      if (res.status === 403 || res.status === 429) {
        const backoff = RETRY.baseBackoffMs * attempt + Math.floor(Math.random() * 2000);
        console.warn(
          `  ⚠️ [transfermarkt] status ${res.status} em ${urlPath} (tentativa ${attempt}/${RETRY.maxAttempts}). ` +
            `Aguardando ${(backoff / 1000).toFixed(1)}s...`
        );
        await sleep(backoff);
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }

      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status} ao buscar ${urlPath}`);
      }

      return res.data;
    } catch (err) {
      lastErr = err;
      const backoff = RETRY.baseBackoffMs * attempt;
      console.warn(
        `  ⚠️ [transfermarkt] erro em ${urlPath} (tentativa ${attempt}/${RETRY.maxAttempts}): ${err.message}. ` +
          `Aguardando ${(backoff / 1000).toFixed(1)}s...`
      );
      await sleep(backoff);
    }
  }

  throw lastErr || new Error(`Falha ao buscar ${urlPath} após ${RETRY.maxAttempts} tentativas`);
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Salva o HTML bruto recebido — igual ao padrão já usado pro ogol
// (src/scrapePlayer.js), pra poder inspecionar em /api/transfermarkt/debug/raw
// exatamente o que o servidor recebeu, sem precisar de acesso ao terminal.
// Essencial pra diagnosticar bloqueio anti-bot ou mudança de layout do site
// sem depender de reproduzir o problema localmente.
function saveDebugRaw(name, html) {
  ensureCacheDir();
  const safeName = String(name).replace(/[^a-z0-9_-]/gi, '_');
  fs.writeFileSync(path.join(CACHE_DIR, `${safeName}.raw.html`), html, 'utf-8');
}

async function searchTransfermarkt(query) {
  const html = await tmGet(`/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(query)}`);
  saveDebugRaw('_ultima_busca', html);
  const results = parseTransfermarktSearch(html);
  if (!results.length) {
    console.warn(
      `  ⚠️ [transfermarkt] busca por "${query}" não achou nenhum resultado — ` +
        `veja o HTML bruto recebido em /api/transfermarkt/debug/raw/_ultima_busca.raw.html`
    );
  }
  return results;
}

function cachePath(slug, id) {
  const safeSlug = String(slug || '').replace(/[^a-z0-9_-]/gi, '');
  const safeId = String(id || '').replace(/[^0-9]/g, '');
  return path.join(CACHE_DIR, `${safeSlug}_${safeId}.json`);
}

async function scrapeTransfermarktProfile(slug, id, { force = false } = {}) {
  const file = cachePath(slug, id);
  if (!force && fs.existsSync(file)) {
    return { cached: true, result: JSON.parse(fs.readFileSync(file, 'utf-8')) };
  }

  const html = await tmGet(`/${slug}/profil/spieler/${id}`);
  saveDebugRaw(`${slug}_${id}`, html);
  const parsed = parseTransfermarktProfile(html);
  const result = { slug, transfermarktId: id, ...parsed, scrapedAt: new Date().toISOString() };

  ensureCacheDir();
  fs.writeFileSync(file, JSON.stringify(result, null, 2), 'utf-8');

  return { cached: false, result };
}

function listCachedTransfermarktPlayers() {
  if (!fs.existsSync(CACHE_DIR)) return [];
  return fs
    .readdirSync(CACHE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const full = path.join(CACHE_DIR, f);
      const stat = fs.statSync(full);
      const m = f.match(/^(.+)_(\d+)\.json$/);
      let nome = null;
      try {
        nome = JSON.parse(fs.readFileSync(full, 'utf-8')).nome || null;
      } catch (_) {}
      return {
        file: f,
        slug: m ? m[1] : f.replace(/\.json$/, ''),
        transfermarktId: m ? m[2] : null,
        nome,
        scrapedAt: stat.mtime,
      };
    });
}

function getCachedTransfermarktPlayer(slug, id) {
  const file = cachePath(slug, id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function listDebugRawFiles() {
  if (!fs.existsSync(CACHE_DIR)) return [];
  return fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.raw.html'));
}

function getDebugRawFile(name) {
  const safeName = path.basename(name); // evita path traversal
  const file = path.join(CACHE_DIR, safeName);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf-8');
}

module.exports = {
  searchTransfermarkt,
  scrapeTransfermarktProfile,
  listCachedTransfermarktPlayers,
  getCachedTransfermarktPlayer,
  listDebugRawFiles,
  getDebugRawFile,
};
