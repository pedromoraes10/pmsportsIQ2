'use strict';

const cheerio = require('cheerio');
const { tableToObjects, normalize } = require('../extract');

/**
 * A página /competicoes lista o detalhamento por competição em até 3
 * tabelas — confirmado em HTML real: "com estatísticas completas" (liga,
 * copas...), "sem estatísticas completas" (jogos antigos sem ficha
 * completa) e um resumo "Total". Colunas reais: P, T, J (=JOGOS), V, E, D,
 * GM (gols marcados), A (assistências), AA (cartões amarelos) — **não
 * existe coluna de minutos jogados nessa página** (minutos só aparece na
 * página /jogos, jogo a jogo).
 */
function parseCompetitions(html) {
  const $ = cheerio.load(html);

  const tables = [];
  $('table').each((_, t) => {
    tables.push({
      // tenta usar um heading/legenda próximo como identificador da tabela
      // (ex.: nome da temporada), quando existir
      context: findNearestHeading($, $(t)),
      rows: tableToObjects($, $(t)).map(normalizeCompetitionRow),
    });
  });

  return {
    tables,
    scrapedAt: new Date().toISOString(),
  };
}

function findNearestHeading($, $table) {
  // procura o heading/legenda mais próximo ANTES da tabela na árvore do DOM
  let prev = $table.prev();
  let hops = 0;
  while (prev && prev.length && hops < 5) {
    const txt = normalize(prev.text());
    if (txt && txt.length < 60) return txt;
    prev = prev.prev();
    hops += 1;
  }
  const parentHeading = $table.closest('div,section').find('h1,h2,h3,h4').first();
  return normalize(parentHeading.text()) || null;
}

// Nomes de coluna confirmados em HTML real. A primeira coluna (nome da
// competição) varia de rótulo conforme a tabela: "com estatísticas
// completas", "sem estatísticas completas" ou "total".
function normalizeCompetitionRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.toLowerCase().trim()] = v;
  }

  out.competicao =
    out['com estatísticas completas'] ||
    out['sem estatísticas completas'] ||
    out['total'] ||
    null;

  out.jogos = toNumberOrNull(out.jogos ?? out.j);
  out.gols = toNumberOrNull(out.gm);
  out.assistencias = toNumberOrNull(out.a);
  out.cartoesAmarelos = toNumberOrNull(out.aa);
  out.vitorias = toNumberOrNull(out.v);
  out.empates = toNumberOrNull(out.e);
  out.derrotas = toNumberOrNull(out.d);

  return out;
}

function toNumberOrNull(v) {
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

module.exports = { parseCompetitions };
