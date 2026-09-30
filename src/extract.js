'use strict';

/**
 * O ogol renderiza os "cards" de dados (Dados Pessoais, Histórico, Edições...)
 * como um bloco com título e, dentro, pares label/valor ou tabelas.
 * Como não temos acesso ao HTML ao vivo neste ambiente para fixar classes
 * exatas, a extração abaixo é feita por TEXTO/estrutura (robusta a mudanças
 * de nome de classe), em vez de seletores CSS rígidos:
 *
 *  - findSectionByHeading: acha o container cujo título bate com o texto
 *    procurado (ex.: "DADOS PESSOAIS"), tentando primeiro headings comuns
 *    (h1-h4, .zz-title, .box-title, [class*="title"]) e caindo para busca
 *    textual genérica se necessário.
 *  - extractLabelValues: dentro de uma section, percorre os elementos-folha
 *    (sem filhos-elemento) em ordem de documento; quando o texto bate com
 *    um dos labels esperados, assume que o próximo elemento-folha não vazio
 *    é o valor.
 *  - tableToObjects: converte uma <table> em array de objetos usando o
 *    cabeçalho (thead/primeira linha) como chaves.
 *
 * IMPORTANTE: como não pude testar contra o HTML real do ogol (rede
 * restrita neste ambiente), confira o resultado da primeira execução salvo
 * em output/*.raw.html e ajuste os seletores/labels aqui se algum campo
 * não for capturado.
 */

function normalize(txt) {
  return (txt || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAccents(txt) {
  return normalize(txt)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

/**
 * ── Extração baseada na estrutura REAL do ogol.com.br ──────────────────
 * Confirmada inspecionando HTML bruto real (não é mais heurística às
 * cegas). O site organiza a página de perfil em blocos `.card-data`:
 *
 *   <div class="card-data ...">
 *     <div class="card-data__header"><h2 class="card-data__title">TÍTULO</h2></div>
 *     <div class="card-data__body">
 *       <div class="card-data__row"><span class="card-data__label">Label</span>
 *            <span class="card-data__value">Valor</span></div>
 *       ...
 *       <div class="section"><span>Nome da subseção</span></div>
 *       <table class="career">...</table>
 *     </div>
 *   </div>
 *
 * `findCardByTitle` acha o `.card-data` certo pelo texto do título; as
 * demais funções extraem os dados de dentro dele.
 */
function findCardByTitle($, titleText) {
  const target = stripAccents(titleText);
  let exact = null;
  let partial = null;

  $('.card-data__title').each((_, el) => {
    const txt = stripAccents($(el).text());
    if (txt === target) exact = $(el).closest('.card-data');
    else if (!partial && txt.startsWith(target)) partial = $(el).closest('.card-data');
  });

  const found = exact || partial;
  return found && found.length ? found : null;
}

/** Extrai os pares label→valor de um `.card-data` no formato "Dados Pessoais". */
function extractCardDataRows($, $card) {
  const result = {};
  if (!$card || !$card.length) return result;

  $card.find('.card-data__row').each((_, row) => {
    const $row = $(row);
    const $label = $row.find('.card-data__label').first().clone();
    $label.find('.info-icon').remove(); // remove ícones de "?" (tooltip) do texto do label
    const label = normalize($label.text());
    if (!label || result[label]) return;

    const values = $row
      .find('.card-data__value')
      .map((_, v) => normalize($(v).text()))
      .get()
      .filter(Boolean);
    result[label] = values.join(' / ');
  });

  return result;
}

/**
 * Dentro de um `.card-data` (ex: o card "Histórico"), pode haver várias
 * subseções (`<div class="section"><span>Nome</span></div>` seguido de
 * `<table class="career">`). Retorna { "Nome da subseção": [linhas...] }.
 */
function extractSectionTables($, $card) {
  const result = {};
  if (!$card || !$card.length) return result;

  $card.find('.section').each((_, sec) => {
    const label = normalize($(sec).find('span').first().text()) || normalize($(sec).text());
    const $table = $(sec).nextAll('table').first();
    if (label && $table.length) {
      result[label] = tableToObjects($, $table);
    }
  });

  return result;
}

function findSectionByHeading($, headingText) {
  const target = stripAccents(headingText);
  const headingSelectors = [
    'h1', 'h2', 'h3', 'h4',
    '[class*="title" i]', '[class*="titulo" i]', '[class*="heading" i]',
  ];

  let found = null;
  $(headingSelectors.join(',')).each((_, el) => {
    if (found) return;
    const txt = stripAccents($(el).text());
    if (txt === target || txt.startsWith(target)) {
      // container = pai mais próximo que pareça um "card"/"box"
      const container =
        $(el).closest('[class*="box" i]').length
          ? $(el).closest('[class*="box" i]')
          : $(el).parent();
      found = container;
    }
  });

  return found; // cheerio object ou null
}

function extractLabelValues($, $section, labels) {
  if (!$section || !$section.length) return {};

  const wanted = labels.map((l) => ({ raw: l, key: stripAccents(l) }));
  const result = {};

  // pega todos os elementos-folha (sem filhos elemento) em ordem de documento
  const leaves = [];
  $section.find('*').each((_, el) => {
    const $el = $(el);
    if ($el.children().length === 0) {
      const txt = normalize($el.text());
      if (txt) leaves.push(txt);
    }
  });

  for (let i = 0; i < leaves.length; i++) {
    const norm = stripAccents(leaves[i]);
    const match = wanted.find((w) => norm === w.key);
    if (match && !result[match.raw]) {
      // procura o próximo texto "diferente" como valor
      for (let j = i + 1; j < leaves.length; j++) {
        if (stripAccents(leaves[j]) !== match.key && leaves[j]) {
          result[match.raw] = leaves[j];
          break;
        }
      }
    }
  }

  return result;
}

function tableToObjects($, $table) {
  if (!$table || !$table.length) return [];

  const headers = [];
  const headerRow = $table.find('thead tr').first().length
    ? $table.find('thead tr').first()
    : $table.find('tr').first();

  headerRow.find('th,td').each((_, el) => {
    headers.push(normalize($(el).text()) || `col${headers.length}`);
  });

  const bodyRows = $table.find('thead tr').first().length
    ? $table.find('tbody tr')
    : $table.find('tr').slice(1);

  const rows = [];
  bodyRows.each((_, tr) => {
    const cells = $(tr).find('td,th');
    if (!cells.length) return;
    const obj = {};
    cells.each((i, td) => {
      const key = headers[i] || `col${i}`;
      obj[key] = normalize($(td).text());
    });
    rows.push(obj);
  });

  return rows;
}

/** Retorna todas as tabelas encontradas dentro de uma section como arrays de objetos */
function allTablesIn($, $section) {
  if (!$section || !$section.length) return [];
  const tables = [];
  $section.find('table').each((_, t) => {
    tables.push(tableToObjects($, $(t)));
  });
  return tables;
}

module.exports = {
  normalize,
  stripAccents,
  findSectionByHeading,
  extractLabelValues,
  tableToObjects,
  allTablesIn,
  findCardByTitle,
  extractCardDataRows,
  extractSectionTables,
};
