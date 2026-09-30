'use strict';

const path = require('path');

// Em produção (Railway/Render/etc.), aponte OGOL_DATA_DIR para o path do
// volume persistente montado (ex: "/data"), senão os dados coletados somem
// a cada novo deploy. Localmente, usa a pasta output/ do próprio projeto.
const OUTPUT_DIR = process.env.OGOL_DATA_DIR
  ? path.resolve(process.env.OGOL_DATA_DIR)
  : path.join(__dirname, '..', 'output');

/** Caminho do .json em cache para um jogador (slug/id já devem vir sanitizados). */
function cachePath(slug, id) {
  const safeSlug = String(slug || '').replace(/[^a-z0-9_-]/gi, '');
  const safeId = String(id || '').replace(/[^0-9]/g, '');
  return path.join(OUTPUT_DIR, `${safeSlug}_${safeId}.json`);
}

module.exports = { OUTPUT_DIR, cachePath };
