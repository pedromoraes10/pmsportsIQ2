'use strict';

/**
 * Parser da página de perfil do Transfermarkt — construído e validado contra
 * HTML real (não é heurística às cegas, como os outros parsers do projeto
 * tiveram que ser por falta de acesso ao site em ambiente de desenvolvimento).
 *
 * Estrutura confirmada:
 *  - Cabeçalho: <h1 class="data-header__headline-wrapper"><strong>Nome</strong></h1>
 *  - Dados pessoais: <div class="info-table"> com sequência plana de
 *    <span class="info-table__content--regular">Label:</span>
 *    <span class="info-table__content--bold">Valor</span> (não são pares
 *    aninhados numa linha própria, é só uma sequência — por isso o parsing
 *    aqui é posicional: dado um label, o valor é o próximo span).
 *  - Valor de mercado: <div class="current-and-max"> com .current-value e .max-value.
 *  - Histórico de transferências: web component <tm-player-transfer-history>
 *    com <template shadowrootmode="open"> (declarative shadow DOM) por dentro.
 *    IMPORTANTE: o Cheerio (via parse5) respeita a semântica de <template> do
 *    HTML5 — o conteúdo fica num fragmento isolado, fora da árvore navegável
 *    por $(...).find(). Por isso pegamos o .html() do template e reparseamos
 *    como um documento à parte antes de extrair as linhas.
 *  - Performance por competição: .tm-player-performance-table com linhas
 *    [role="row"], colunas por posição (competição, jogos, gols, assist.,
 *    min/gol, min jogados).
 */

const cheerio = require('cheerio');

function normalize(txt) {
  return (txt || '').replace(/\s+/g, ' ').trim();
}

function textWithoutImgs($, $el) {
  const $clone = $el.clone();
  $clone.find('img').remove();
  return normalize($clone.text());
}

// Lê a sequência plana de spans regular/bold e devolve { "Label": <cheerio do valor> }
// pra cada campo poder extrair texto/imagem/link do jeito que precisar.
function parseInfoTablePairs($, $table) {
  const spans = $table.find('span.info-table__content').toArray();
  const result = {};
  for (let i = 0; i < spans.length; i++) {
    const $el = $(spans[i]);
    if ($el.hasClass('info-table__content--regular')) {
      const label = normalize($el.text()).replace(/:$/, '');
      const $next = $(spans[i + 1]);
      if (label && $next && $next.hasClass('info-table__content--bold')) {
        result[label] = $next;
      }
    }
  }
  return result;
}

// O transfermarkt.com serve o idioma da página conforme geolocalização do IP
// de quem pede — um servidor em produção (fora do Brasil) recebe os labels em
// INGLÊS, mesmo que o HTML validado originalmente (colado por um usuário no
// Brasil) tenha vindo em português. Por isso cada campo tenta um label PT e,
// se não achar, cai pro equivalente EN — sem isso, em produção o parser
// silenciosamente não encontrava nada (nenhum erro, só dadosPessoais vazio).
function pick(pairs, labels) {
  for (const label of labels) {
    if (pairs[label]) return pairs[label];
  }
  return null;
}

function parseTransfermarktProfile(html) {
  const $ = cheerio.load(html);

  const nome = normalize($('.data-header__headline-wrapper strong').first().text());
  const camisa = normalize($('.data-header__shirt-number').first().text()).replace('#', '');

  const pairs = parseInfoTablePairs($, $('.info-table').first());
  const dadosPessoais = {};

  const pNomeCompleto = pick(pairs, ['Nome completo', 'Full name']);
  if (pNomeCompleto) dadosPessoais['Nome completo'] = normalize(pNomeCompleto.text());

  const pNascIdade = pick(pairs, ['Nasc./Idade', 'Date of birth/Age']);
  if (pNascIdade) {
    dadosPessoais['Nascimento'] = normalize(pNascIdade.text());
    const href = pNascIdade.find('a').attr('href') || '';
    const m = href.match(/datum\/(\d{4}-\d{2}-\d{2})/);
    dadosPessoais['DataNascimentoISO'] = m ? m[1] : null;
  }

  const pLocalNasc = pick(pairs, ['Local de nascimento', 'Place of birth']);
  if (pLocalNasc) {
    dadosPessoais['CidadeNatal'] = textWithoutImgs($, pLocalNasc);
    dadosPessoais['PaisNatal'] = pLocalNasc.find('img').attr('alt') || null;
  }

  const pAltura = pick(pairs, ['Altura', 'Height']);
  if (pAltura) dadosPessoais['Altura'] = normalize(pAltura.text());
  const pNacionalidade = pick(pairs, ['Nacionalidade', 'Citizenship']);
  if (pNacionalidade) dadosPessoais['Nacionalidade'] = textWithoutImgs($, pNacionalidade);
  const pPosicao = pick(pairs, ['Posição', 'Position']);
  if (pPosicao) dadosPessoais['Posição'] = normalize(pPosicao.text());
  const pPe = pick(pairs, ['Pé', 'Foot']);
  if (pPe) dadosPessoais['Pé'] = normalize(pPe.text());
  const pEmpresarios = pick(pairs, ['Empresários', 'Agent']);
  if (pEmpresarios) dadosPessoais['Empresarios'] = normalize(pEmpresarios.text());

  const pClubeAtual = pick(pairs, ['Clube atual', 'Current club']);
  if (pClubeAtual) {
    const $links = pClubeAtual.find('a');
    dadosPessoais['ClubeAtual'] = normalize($links.last().text());
    const $clubeImg = pClubeAtual.find('img').first();
    const srcset = $clubeImg.attr('srcset') || '';
    dadosPessoais['ClubeEscudo'] =
      $clubeImg.attr('src') || (srcset.split(',')[0] || '').trim().split(' ')[0] || null;
    const href = $links.first().attr('href') || '';
    const idMatch = href.match(/verein\/(\d+)/);
    dadosPessoais['ClubeId'] = idMatch ? idMatch[1] : null;
  }

  const pNoTimeDesde = pick(pairs, ['No time desde', 'In the team since']);
  if (pNoTimeDesde) dadosPessoais['NoTimeDesde'] = normalize(pNoTimeDesde.text());
  const pContratoAte = pick(pairs, ['Contrato até', 'Contract until']);
  if (pContratoAte) dadosPessoais['ContratoAte'] = normalize(pContratoAte.text());
  const pUltimaRenovacao = pick(pairs, ['Última renovação de contrato', 'Contract extension']);
  if (pUltimaRenovacao) dadosPessoais['UltimaRenovacao'] = normalize(pUltimaRenovacao.text());
  const pFornecedor = pick(pairs, ['Fornecedor', 'Outfitter']);
  if (pFornecedor) dadosPessoais['Fornecedor'] = normalize(pFornecedor.text());

  const valorMercado = {
    atual: normalize($('.current-value').first().text()),
    maximo: normalize($('.max-value').first().text()),
  };

  // Histórico de transferências (ver nota sobre <template> no topo do arquivo)
  const transferencias = [];
  const transferTemplateHtml = $('tm-player-transfer-history template').first().html();
  const $tt = transferTemplateHtml ? cheerio.load(transferTemplateHtml) : null;
  if ($tt) {
    $tt('section').each((_, sec) => {
      const $sec = $tt(sec);
      const $divs = $sec.children('div');
      if ($divs.length < 6) return; // pula a section de "Valor total" (2 divs)
      const temporada = normalize($tt($divs.get(0)).text());
      if (!/^\d{2}\/\d{2}$/.test(temporada)) return; // pula a linha de cabeçalho ("Temporada")
      const $origem = $tt($divs.get(2));
      const $destino = $tt($divs.get(3));
      transferencias.push({
        temporada,
        data: normalize($tt($divs.get(1)).text()),
        origemClube: normalize($origem.find('a').last().text()),
        origemPais: $origem.find('img.flag').attr('alt') || null,
        destinoClube: normalize($destino.find('a').last().text()),
        destinoPais: $destino.find('img.flag').attr('alt') || null,
        valorMercado: normalize($tt($divs.get(4)).text()),
        taxaPaga: normalize($tt($divs.get(5)).text()),
      });
    });
  }

  // Performance por competição (temporada exibida na página)
  const performance = [];
  $('.tm-player-performance-table [role="row"]').each((_, row) => {
    const $row = $(row);
    const cells = $row.find('a.tm-grid__cell, div.tm-grid__cell');
    if (cells.length < 6) return;
    performance.push({
      competicao: normalize($(cells.get(0)).clone().find('img').remove().end().text()),
      jogos: normalize($(cells.get(1)).text()),
      gols: normalize($(cells.get(2)).text()),
      assistencias: normalize($(cells.get(3)).text()),
      minutosPorGol: normalize($(cells.get(4)).text()),
      minutosJogados: normalize($(cells.get(5)).text()),
    });
  });

  return { nome, camisa, dadosPessoais, valorMercado, transferencias, performance };
}

module.exports = { parseTransfermarktProfile };
