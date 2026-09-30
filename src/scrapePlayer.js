'use strict';

const fs = require('fs');
const path = require('path');
const { humanGet } = require('./httpClient');
const { humanPause } = require('./humanDelay');
const config = require('./config');
const { parsePlayerProfile } = require('./parsers/parsePlayerProfile');
const { parseCompetitions } = require('./parsers/parseCompetitions');
const { parseGames } = require('./parsers/parseGames');
const { sanitizeSlug, sanitizeId } = require('./playerInput');
const { syncToProduction } = require('./sync');

const { OUTPUT_DIR } = require('./paths');

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function safeFileName(name) {
  // usado para *.raw.html (ex: "perfil", "jogos_p2") — nunca deve conter
  // barras ou caracteres de path
  return String(name).replace(/[^a-z0-9_-]/gi, '_');
}

function saveRaw(name, html) {
  ensureOutputDir();
  fs.writeFileSync(path.join(OUTPUT_DIR, `${safeFileName(name)}.raw.html`), html, 'utf-8');
}

function saveJson(name, data) {
  ensureOutputDir();
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${safeFileName(name)}.json`),
    JSON.stringify(data, null, 2),
    'utf-8'
  );
}

/**
 * Coleta perfil + histórico de competições + jogos para um jogador do ogol,
 * respeitando pausas "humanas" entre cada requisição e mantendo referer
 * coerente (simula clicar de uma aba para outra dentro do mesmo perfil).
 *
 * @param {string} slug - ex: "neymar"
 * @param {string|number} id - ex: 54814
 * @param {object} opts
 * @param {number} opts.maxGamePages - quantas temporadas de jogos buscar no total, incluindo a atual (padrão 5)
 */
async function scrapePlayer(slug, id, opts = {}) {
  slug = sanitizeSlug(slug);
  id = sanitizeId(id);
  if (!slug || !id) {
    throw new Error(`slug/id inválidos: slug="${slug}" id="${id}"`);
  }

  const maxGamePages = opts.maxGamePages ?? 5;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  const urls = config.urls(slug, id);
  let requestCount = 0;

  const maybeLongPause = async (label) => {
    requestCount += 1;
    if (requestCount % config.LONG_PAUSE_EVERY === 0) {
      onProgress({ step: 'pause', message: `Pausa periódica (${requestCount} requisições feitas)` });
      await humanPause('long', `pausa periódica após ${requestCount} requisições`);
    }
  };

  // 1) PERFIL -----------------------------------------------------------
  console.log(`\n📄 [1/3] Perfil: ${urls.perfil}`);
  onProgress({ step: 'perfil', message: `Buscando perfil de ${slug}...`, pct: 5 });
  let perfilHtml = await humanGet(urls.perfil);
  saveRaw('perfil', perfilHtml);
  let perfil = parsePlayerProfile(perfilHtml);

  // Se veio vazio (sem Dados Pessoais), pode ter sido um bloqueio/página
  // diferente passageira — espera uma pausa longa "de verdade" (mais que
  // as pausas normais, pra parecer bem menos suspeito) e tenta 1 vez de novo
  // antes de aceitar o resultado vazio.
  if (Object.keys(perfil.dadosPessoais || {}).length === 0) {
    console.warn(
      '  ⚠️ Perfil veio sem "Dados Pessoais" — possível bloqueio/página diferente. Tentando de novo...'
    );
    onProgress({ step: 'retry-perfil', message: 'Perfil veio vazio, tentando de novo...', pct: 8 });
    await humanPause('long', 'retry após perfil vazio');
    perfilHtml = await humanGet(urls.perfil);
    saveRaw('perfil_retry', perfilHtml);
    perfil = parsePlayerProfile(perfilHtml);
    if (Object.keys(perfil.dadosPessoais || {}).length === 0) {
      console.warn('  ⚠️ Perfil continuou vazio na 2ª tentativa. Prosseguindo mesmo assim (ver perfil_retry.raw.html).');
    }
  }

  await maybeLongPause();
  onProgress({ step: 'reading', message: 'Simulando leitura do perfil...', pct: 20 });
  await humanPause('reading', 'lendo o perfil antes de ir para competições');

  // 2) COMPETIÇÕES --------------------------------------------------------
  console.log(`📄 [2/3] Competições: ${urls.competicoes}`);
  onProgress({ step: 'competicoes', message: 'Buscando histórico de competições...', pct: 35 });
  const competicoesHtml = await humanGet(urls.competicoes, { referer: urls.perfil });
  saveRaw('competicoes', competicoesHtml);
  const competicoes = parseCompetitions(competicoesHtml);
  await maybeLongPause();
  onProgress({ step: 'reading', message: 'Simulando leitura das competições...', pct: 50 });
  await humanPause('reading', 'lendo competições antes de ir para jogos');

  // 3) JOGOS (por temporada — o ogol não pagina "/jogos" por número de
  // página; a URL sem parâmetro mostra só a temporada atual, e temporadas
  // anteriores são acessadas via ?epoca_id=N) --------------------------
  console.log(`📄 [3/3] Jogos: ${urls.jogos}`);
  onProgress({ step: 'jogos', message: 'Buscando jogos (temporada atual)...', pct: 58 });
  const jogosAtualHtml = await humanGet(urls.jogos, { referer: urls.competicoes });
  saveRaw('jogos_atual', jogosAtualHtml);
  const jogosAtualParsed = parseGames(jogosAtualHtml);
  const seasons = jogosAtualParsed.seasonOptions || [];
  const currentSeasonLabel = seasons[0]?.label || null;
  const allGames = jogosAtualParsed.games.map((g) => ({ ...g, temporada: currentSeasonLabel }));
  await maybeLongPause();

  // maxGamePages aqui significa "quantas temporadas no total" (atual + anteriores)
  const seasonsToFetch = seasons.slice(1, Math.max(0, maxGamePages - 1));
  let refererJogos = urls.jogos;

  for (let i = 0; i < seasonsToFetch.length; i++) {
    const season = seasonsToFetch[i];
    console.log(`   ↳ temporada ${season.label} (epoca_id=${season.value})`);
    onProgress({
      step: 'jogos',
      message: `Buscando jogos da temporada ${season.label}...`,
      pct: 58 + Math.min(35, (i + 1) * 8),
    });
    await humanPause('short', `indo para temporada ${season.label}`);

    const seasonUrl = `${urls.jogos}?epoca_id=${season.value}`;
    const seasonHtml = await humanGet(seasonUrl, { referer: refererJogos });
    saveRaw(`jogos_temporada_${season.value}`, seasonHtml);
    const seasonParsed = parseGames(seasonHtml);
    allGames.push(...seasonParsed.games.map((g) => ({ ...g, temporada: season.label })));

    refererJogos = seasonUrl;
    await maybeLongPause();
  }

  onProgress({ step: 'saving', message: 'Salvando resultado...', pct: 97 });
  const result = {
    slug,
    id,
    urls,
    perfil,
    competicoes,
    jogos: { total: allGames.length, partidas: allGames },
    scrapedAt: new Date().toISOString(),
  };

  const jsonFilename = `${slug}_${id}.json`;
  saveJson(`${slug}_${id}`, result);
  console.log(`\n✅ Concluído. JSON salvo em output/${jsonFilename}`);

  // Sincroniza automaticamente com o servidor de produção (Railway),
  // se SYNC_URL e SYNC_TOKEN estiverem configurados no .env local.
  await syncToProduction(result, jsonFilename);

  onProgress({ step: 'done', message: 'Concluído.', pct: 100 });

  return result;
}

module.exports = { scrapePlayer };
