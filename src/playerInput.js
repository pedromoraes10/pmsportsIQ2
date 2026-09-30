'use strict';

/**
 * Aceita tanto um slug puro ("neymar") quanto uma URL colada inteira
 * (ex: "https://www.ogol.com.br/jogador/neymar/54814" ou
 * ".../jogador/neymar/54814/competicoes") e devolve { slug, id } limpos.
 *
 * Se `rawId` já vier preenchido e `rawSlug` não parecer uma URL, usa os
 * dois como estão (apenas sanitizados).
 */
function parsePlayerInput(rawSlug, rawId) {
  const slugStr = String(rawSlug || '').trim();
  const idStr = String(rawId || '').trim();

  const urlMatch = slugStr.match(/jogador\/([^/?#]+)\/(\d+)/i) ||
    idStr.match(/jogador\/([^/?#]+)\/(\d+)/i);

  let slug, id;
  if (urlMatch) {
    slug = urlMatch[1];
    id = urlMatch[2];
  } else {
    slug = slugStr;
    id = idStr;
  }

  return { slug: sanitizeSlug(slug), id: sanitizeId(id) };
}

/** Só letras, números, hífen e underscore — nada de "/", ":", espaços, etc. */
function sanitizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

/** Só dígitos. */
function sanitizeId(value) {
  return String(value || '').trim().replace(/[^0-9]/g, '');
}

module.exports = { parsePlayerInput, sanitizeSlug, sanitizeId };
