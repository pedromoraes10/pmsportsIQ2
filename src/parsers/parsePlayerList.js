'use strict';

const cheerio = require('cheerio');
const { normalize } = require('../extract');

/**
 * Confirmado em HTML real (ex: /jogadores/brasil/ativo): cada jogador é um
 * `div.zz-search-item.player` com `data-id` (o ID do jogador!) contendo:
 *
 *   <div class="zz-search-item player status-0" data-id="54814">
 *     <a class="title" href="/jogador/neymar/54814?search=1"><span>10</span>Neymar</a>
 *     <div class="subtitle">Neymar da Silva Santos Júnior</div>
 *     <div class="stamps"><span class="stamp" title="Idade">34</span>
 *          <span class="stamp position">ATA</span></div>
 *     <div class="details"><div class="local">...Brasil, 1992-02-05</div>
 *          <div class="local"></div>
 *          <div class="local"><a href="/equipe/santos">Santos</a></div></div>
 *   </div>
 *
 * O clube é o último `.local` com um link dentro (o do meio costuma vir
 * vazio; o primeiro é nacionalidade/data de nascimento).
 */
function parsePlayerList(html) {
  const $ = cheerio.load(html);
  const players = [];

  $('.zz-search-item.player').each((_, el) => {
    const $el = $(el);
    const id = $el.attr('data-id');
    const href = $el.find('a.title').first().attr('href') || '';
    const slugMatch = href.match(/\/jogador\/([^/?#]+)/i);
    const slug = slugMatch ? slugMatch[1] : null;

    if (!id || !slug) return; // item sem link de jogador (anúncio, etc.) — ignora

    const $nameLink = $el.find('a.title').first().clone();
    $nameLink.find('span').remove(); // remove o número da camisa
    const name = normalize($nameLink.text());

    const fullName = normalize($el.find('.subtitle').first().text()) || null;
    const position = normalize($el.find('.stamp.position').first().text()) || null;
    const age = normalize($el.find('.stamp[title="Idade"]').first().text()) || null;
    const nationality = normalize($el.find('.local').first().find('a').first().attr('title')) || null;

    const $locals = $el.find('.local');
    let club = null;
    $locals.each((_, loc) => {
      const $link = $(loc).find('a').last();
      const txt = normalize($link.text());
      // pula o link de nacionalidade (mesmo texto do atributo title do país)
      if (txt && txt !== nationality) club = txt;
    });

    players.push({
      slug,
      id,
      name: name || slug,
      fullName,
      club,
      position,
      age,
      profileUrl: `https://www.ogol.com.br/jogador/${slug}/${id}`,
    });
  });

  return { players, pagination: detectPagination($) };
}

function detectPagination($) {
  const pages = new Set();
  let hasNext = false;

  $('a[href*="page="]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const m = href.match(/page=(\d+)/);
    if (m) pages.add(parseInt(m[1], 10));
  });

  if ($('.zz-pagination a.next-link').length) hasNext = true;

  return { knownPages: [...pages].sort((a, b) => a - b), hasNext };
}

module.exports = { parsePlayerList };
