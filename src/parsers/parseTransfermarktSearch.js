'use strict';

/**
 * Parser da página de busca do Transfermarkt (schnellsuche) — validado
 * contra HTML real (busca por "hulk").
 *
 * Estrutura: #player-grid > table.items > tbody > tr, uma linha por
 * jogador. A 1ª <td> contém uma <table class="inline-table"> com foto +
 * nome (linha 1) e clube atual ou "Fim de carreira" (linha 2). As <td>
 * seguintes são: Posição (sigla, ex. "CA"/"ZAG"/"VOL"), Clube (escudo,
 * redundante com a 1ª célula), Idade, Nacionalidade(s) (uma ou mais
 * bandeiras), Valor de mercado, Empresário.
 */

const cheerio = require('cheerio');

function normalize(txt) {
  return (txt || '').replace(/\s+/g, ' ').trim();
}

function parseTransfermarktSearch(html) {
  const $ = cheerio.load(html);
  const results = [];

  $('#player-grid table.items > tbody > tr').each((_, tr) => {
    const $tr = $(tr);
    const cells = $tr.find('> td');
    if (cells.length < 6) return;

    const $firstCell = $(cells.get(0));
    const $nameLink = $firstCell.find('td.hauptlink a').first();
    const nome = normalize($nameLink.text());
    const href = $nameLink.attr('href') || '';
    const idMatch = href.match(/spieler\/(\d+)/);
    const slugMatch = href.match(/^\/([^/]+)\//);

    if (!idMatch || !nome) return; // pula linhas que não são de jogador (defensivo)

    const fotoUrl = $firstCell.find('img.bilderrahmen-fixed').attr('src') || null;

    // 2ª linha da inline-table: link do clube, ou texto solto ("Fim de carreira")
    const $clubRow = $firstCell.find('table.inline-table tr').eq(1).find('td');
    const $clubLink = $clubRow.find('a').first();
    const clube = $clubLink.length ? normalize($clubLink.text()) : normalize($clubRow.text());
    const clubHref = $clubLink.attr('href') || '';
    const clubIdMatch = clubHref.match(/verein\/(\d+)/);

    const posicao = normalize($(cells.get(1)).text());
    const idade = normalize($(cells.get(3)).text());

    const nacionalidades = $(cells.get(4))
      .find('img.flaggenrahmen')
      .map((__, img) => $(img).attr('alt'))
      .get()
      .filter(Boolean);

    const valorMercado = normalize($(cells.get(5)).text());
    const $empresarioLink = $(cells.get(6)).find('a').first();
    const empresario = $empresarioLink.length ? normalize($empresarioLink.text()) : null;

    results.push({
      nome,
      transfermarktId: idMatch[1],
      slug: slugMatch ? slugMatch[1] : null,
      fotoUrl,
      posicao,
      clube: clube || null,
      clubeId: clubIdMatch ? clubIdMatch[1] : null,
      idade: idade || null,
      nacionalidades,
      valorMercado: valorMercado === '-' ? null : valorMercado,
      empresario,
    });
  });

  return results;
}

module.exports = { parseTransfermarktSearch };
