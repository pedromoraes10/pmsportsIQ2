'use strict';

const cheerio = require('cheerio');
const { normalize } = require('../extract');

/**
 * A tabela de jogos do ogol tem cabeçalhos quase todos vazios (só ícones,
 * ex: cartão amarelo/vermelho, nota do jogador) — não dá pra confiar no
 * texto do <thead>. Mapeamos por POSIÇÃO, confirmado inspecionando o HTML
 * real de uma conta (16 colunas). Se o ogol mudar a ordem das colunas,
 * isso quebra — confira os `.raw.html` salvos em output/ para reajustar.
 */
const COLUMN_MAP = [
  'forma', // 0: V/D/E (vitória/derrota/empate)
  'data', // 1
  'competicao_sigla', // 2: sigla da competição/edição (ex: "UCL", "D1")
  'rodada', // 3
  'equipe', // 4: time do jogador nesse jogo (não é sempre o "mandante")
  'mando', // 5: (C) casa / (F) fora
  'adversario', // 6
  'placar', // 7
  'minutos', // 8
  'evento', // 9: substituição/cartão combinado (ícone + minuto)
  'cartao_amarelo', // 10
  'cartao_vermelho', // 11
  'gols', // 12
  'publico', // 13
  'nota', // 14: nota/rating do jogador na partida
  'midia', // 15: links de fotos/vídeos/notícias (raramente útil)
];

function parseGames(html) {
  const $ = cheerio.load(html);

  // Na página /jogos existem 2 tabelas: um resumo por competição da
  // temporada (table.zztable.stats, SEM a classe "zz-table") e a lista
  // jogo a jogo de verdade (table.zztable.zz-table.stats). Selecionamos
  // especificamente a segunda — única com essa classe na página.
  const $table = $('table.zz-table').first();

  const games = [];
  $table.find('tbody tr').each((_, tr) => {
    const $row = $(tr);
    if ($row.find('td.totals').length) return; // pula eventual linha de totais

    const row = {};
    $row.find('td').each((i, td) => {
      const key = COLUMN_MAP[i] || `col${i}`;
      row[key] = normalize($(td).text());
    });

    if (row.data) games.push(row); // linha válida tem pelo menos uma data
  });

  return {
    games,
    seasonOptions: extractSeasonOptions($),
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * O ogol não pagina "/jogos" por número de página — pagina por TEMPORADA
 * via `?epoca_id=N` (a URL sem esse parâmetro mostra só a temporada
 * atual). Extrai as opções do <select id="epoca_id"> para permitir buscar
 * temporadas anteriores de verdade.
 */
function extractSeasonOptions($) {
  const seen = new Set();
  const seasons = [];
  $('select#epoca_id option, select[name="epoca_id"] option').each((_, opt) => {
    const value = $(opt).attr('value');
    const label = normalize($(opt).text());
    if (!value || seen.has(value)) return;
    seen.add(value);
    seasons.push({ value, label });
  });
  return seasons;
}

module.exports = { parseGames, extractSeasonOptions };
