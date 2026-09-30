'use strict';

const cheerio = require('cheerio');
const {
  findCardByTitle,
  extractCardDataRows,
  extractSectionTables,
  tableToObjects,
  normalize,
  stripAccents,
} = require('../extract');

function parsePlayerProfile(html) {
  const $ = cheerio.load(html);

  // --- FOTO (confirmado em HTML real: <div class="profile_picture"><img src="...">) ---
  const foto = normalize($('.profile_picture img').first().attr('src')) || null;

  // --- ESCUDO DO CLUBE ATUAL (confirmado em HTML real: <a class="zz-enthdr-club" href="/equipe/...">
  // no cabeçalho da página). Só existe o do clube ATUAL — clubes de temporadas
  // passadas na tabela "Histórico" não têm escudo próprio nessa página; pegar
  // isso exigiria visitar a página de cada clube separadamente (não feito aqui). ---
  const clubeEscudoRaw = $('.zz-enthdr-club img').attr('src');
  const clubeEscudo = clubeEscudoRaw
    ? clubeEscudoRaw.startsWith('http')
      ? clubeEscudoRaw
      : `https://www.ogol.com.br${clubeEscudoRaw}`
    : null;
  const clubeSlug = $('.zz-enthdr-club').attr('href') || null;

  // --- DADOS PESSOAIS (card com título "DADOS PESSOAIS") ---
  const dadosCard = findCardByTitle($, 'DADOS PESSOAIS');
  const dadosPessoais = extractCardDataRows($, dadosCard);

  // --- "Histórico": card que contém, dentro dele, subseções como
  // "Futebol" (temporada a temporada por clube) e "EDIÇÕES" (torneios) ---
  const historicoCard = findCardByTitle($, 'Histórico');
  const sectionTables = extractSectionTables($, historicoCard);

  let historico = [];
  let edicoes = [];
  for (const [label, rows] of Object.entries(sectionTables)) {
    if (stripAccents(label).includes('EDIC')) {
      edicoes = edicoes.concat(rows.map(normalizeEdicaoRow));
    } else {
      // "Futebol" e qualquer outra subseção de temporada a temporada
      historico = historico.concat(rows.map((r) => normalizeSeasonRow(r, label)));
    }
  }

  // --- TRANSFERÊNCIAS (card com título "Transferências": tabela direta
  // Temporada/Equipe/Valor, sem subseção .section) ---
  const transferenciasCard = findCardByTitle($, 'Transferências');
  const transferencias = transferenciasCard
    ? tableToObjects($, transferenciasCard.find('table').first()).map(normalizeTransferRow)
    : [];

  return {
    foto,
    clubeEscudo,
    clubeSlug,
    dadosPessoais,
    historico,
    edicoes,
    transferencias,
    scrapedAt: new Date().toISOString(),
  };
}

// Colunas típicas da tabela "career" de temporadas: (ícone), TEMPORADA, EQUIPE, J, G, ASS
function normalizeSeasonRow(row, sectionLabel) {
  const out = { secao: sectionLabel };
  for (const [k, v] of Object.entries(row)) {
    const key = k.toLowerCase();
    if (key.includes('tempo')) out.temporada = v;
    else if (key.includes('equipe') || key.includes('clube')) out.equipe = v;
    else if (key === 'j') out.jogos = toNumberOrNull(v);
    else if (key === 'g') out.gols = toNumberOrNull(v);
    else if (key.includes('ass')) out.assistencias = toNumberOrNull(v);
    else if (!key.startsWith('col')) out[key] = v; // ignora colunas puramente de ícone (col0, col1...)
  }
  return out;
}

// Colunas típicas da tabela "career" de edições: (ícones), EDIÇÃO, J, G, ASS
function normalizeEdicaoRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.toLowerCase();
    if (key.includes('edi')) out.edicao = v;
    else if (key === 'j') out.jogos = toNumberOrNull(v);
    else if (key === 'g') out.gols = toNumberOrNull(v);
    else if (key.includes('ass')) out.assistencias = toNumberOrNull(v);
    else if (!key.startsWith('col')) out[key] = v;
  }
  return out;
}

// Colunas da tabela de transferências: Temporada, Equipe, Valor
function normalizeTransferRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.toLowerCase();
    if (key.includes('tempo')) out.temporada = v;
    else if (key.includes('equipe')) out.equipe = v;
    else if (key.includes('valor')) out.valor = v;
    else if (!key.startsWith('col')) out[key] = v;
  }
  return out;
}

function toNumberOrNull(v) {
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

module.exports = { parsePlayerProfile };

