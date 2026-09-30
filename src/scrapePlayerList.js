'use strict';

const fs = require('fs');
const path = require('path');
const { humanGet } = require('./httpClient');
const { humanPause } = require('./humanDelay');
const { parsePlayerList } = require('./parsers/parsePlayerList');
const { scrapePlayer } = require('./scrapePlayer');

const { OUTPUT_DIR, cachePath } = require('./paths');
const LISTS_DIR = path.join(OUTPUT_DIR, '_lists');

function ensureListsDir() {
  if (!fs.existsSync(LISTS_DIR)) fs.mkdirSync(LISTS_DIR, { recursive: true });
}

function saveListRaw(pageNum, html) {
  ensureListsDir();
  fs.writeFileSync(path.join(LISTS_DIR, `list_p${pageNum}.raw.html`), html, 'utf-8');
}


function slugifyUrl(url) {
  return String(url)
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function appendPageParam(url, page) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}page=${page}`;
}

function saveListSummary(summary) {
  ensureListsDir();
  const file = path.join(LISTS_DIR, `${slugifyUrl(summary.listUrl)}.json`);
  fs.writeFileSync(file, JSON.stringify(summary, null, 2), 'utf-8');
  return file;
}

/**
 * @param {string} listUrl - ex: https://www.ogol.com.br/jogadores/brasil/ativo
 * @param {object} opts
 * @param {number} opts.maxPlayers - quantos jogadores no máximo processar (padrão 20)
 * @param {number} opts.maxListPages - quantas páginas da LISTAGEM seguir (padrão 5)
 * @param {number} opts.maxGamePages - páginas de /jogos por jogador (padrão 3, menor que o default do single-player para não deixar o lote muito longo)
 * @param {boolean} opts.force - se true, re-raspa mesmo jogadores já em cache (padrão false: pula quem já tem .json salvo, permitindo retomar uma lista interrompida por bloqueio sem repetir trabalho)
 * @param {function} opts.onProgress
 */
async function scrapePlayerList(listUrl, opts = {}) {
  const maxPlayers = opts.maxPlayers ?? 20;
  const maxListPages = opts.maxListPages ?? 5;
  const maxGamePages = opts.maxGamePages ?? 3;
  const force = opts.force ?? false;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  // 1) Coleta a lista de jogadores (paginada) ------------------------------
  onProgress({ step: 'list', message: 'Buscando lista de jogadores...', pct: 1 });

  let allPlayers = [];
  let page = 1;
  let referer;

  while (page <= maxListPages && allPlayers.length < maxPlayers) {
    const pageUrl = page === 1 ? listUrl : appendPageParam(listUrl, page);
    onProgress({ step: 'list', message: `Lendo página ${page} da lista...`, pct: 1 + page });
    const html = await humanGet(pageUrl, referer ? { referer } : {});
    saveListRaw(page, html);
    const { players, pagination } = parsePlayerList(html);

    for (const p of players) {
      if (!allPlayers.find((x) => x.id === p.id && x.slug === p.slug)) allPlayers.push(p);
    }

    referer = pageUrl;
    const nextExists = pagination.hasNext || pagination.knownPages.includes(page + 1);
    if (!nextExists || players.length === 0) break;

    page += 1;
    await humanPause('short', `indo para página ${page} da lista`);
  }

  allPlayers = allPlayers.slice(0, maxPlayers);

  if (!allPlayers.length) {
    throw new Error(
      'Nenhum jogador encontrado nessa URL de lista. Confira se a página tem links ' +
        'para /jogador/{slug}/{id} (veja output/_lists ou o .raw.html salvo pelo scrape individual para depurar).'
    );
  }

  onProgress({
    step: 'list-done',
    message: `${allPlayers.length} jogador(es) encontrado(s). Iniciando coleta individual...`,
    pct: 6,
  });

  // 2) Faz o scrape completo (perfil+competições+jogos) de cada jogador ----
  const results = [];
  const errors = [];

  let skipped = 0;

  for (let i = 0; i < allPlayers.length; i++) {
    const pl = allPlayers[i];
    const basePct = 6 + Math.round((i / allPlayers.length) * 90);

    if (!force && fs.existsSync(cachePath(pl.slug, pl.id))) {
      skipped += 1;
      onProgress({
        step: 'player-skip',
        message: `(${i + 1}/${allPlayers.length}) ${pl.name || pl.slug}: já em cache, pulando.`,
        pct: basePct,
      });
      results.push({ slug: pl.slug, id: pl.id, name: pl.name, ok: true, skipped: true });
      continue;
    }

    onProgress({
      step: 'player',
      message: `(${i + 1}/${allPlayers.length}) ${pl.name || pl.slug}...`,
      pct: basePct,
    });

    try {
      await scrapePlayer(pl.slug, pl.id, {
        maxGamePages,
        onProgress: (p) => {
          onProgress({
            step: 'player-detail',
            message: `(${i + 1}/${allPlayers.length}) ${pl.name || pl.slug}: ${p.message}`,
            pct: basePct,
          });
        },
      });
      results.push({ slug: pl.slug, id: pl.id, name: pl.name, ok: true });
    } catch (err) {
      console.warn(`  ⚠️ falhou ${pl.slug}/${pl.id}: ${err.message}`);
      errors.push({ slug: pl.slug, id: pl.id, name: pl.name, error: err.message });
    }

    if (i < allPlayers.length - 1) {
      onProgress({
        step: 'pause',
        message: `Pausa entre jogadores (${i + 1}/${allPlayers.length} feitos)...`,
        pct: basePct,
      });
      await humanPause('long', 'pausa entre jogadores da lista');
    }
  }

  const summary = {
    listUrl,
    totalFound: allPlayers.length,
    totalScraped: results.length,
    totalSkipped: skipped,
    totalErrors: errors.length,
    players: allPlayers,
    results,
    errors,
    scrapedAt: new Date().toISOString(),
  };

  saveListSummary(summary);
  onProgress({ step: 'done', message: 'Lista concluída.', pct: 100 });

  return summary;
}

function listSavedLists() {
  ensureListsDir();
  return fs
    .readdirSync(LISTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const full = path.join(LISTS_DIR, f);
      const stat = fs.statSync(full);
      let summary = {};
      try {
        summary = JSON.parse(fs.readFileSync(full, 'utf-8'));
      } catch (_) {}
      return {
        file: f,
        listUrl: summary.listUrl,
        totalFound: summary.totalFound,
        totalScraped: summary.totalScraped,
        totalErrors: summary.totalErrors,
        scrapedAt: stat.mtime,
      };
    })
    .sort((a, b) => new Date(b.scrapedAt) - new Date(a.scrapedAt));
}

function getSavedList(file) {
  const full = path.join(LISTS_DIR, path.basename(file)); // basename evita path traversal
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf-8'));
}

module.exports = { scrapePlayerList, listSavedLists, getSavedList };
