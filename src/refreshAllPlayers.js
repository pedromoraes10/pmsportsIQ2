'use strict';

const fs = require('fs');
const { scrapePlayer } = require('./scrapePlayer');
const { humanPause } = require('./humanDelay');

const { OUTPUT_DIR } = require('./paths');

function listCachedPlayers() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  return fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const m = f.match(/^(.+)_([^_]+)\.json$/);
      return m ? { slug: m[1], id: m[2] } : null;
    })
    .filter(Boolean);
}

/**
 * Re-scrapeia (perfil + competições + jogos) de TODOS os jogadores já
 * presentes na base local, um por um, com pausa humana entre cada um —
 * usado pelo botão "🔄 Atualizar Tudo" do backoffice.
 *
 * @param {object} opts
 * @param {number} opts.maxGamePages - temporadas a buscar por jogador (padrão 5)
 * @param {function} opts.onProgress
 */
async function refreshAllPlayers(opts = {}) {
  const maxGamePages = opts.maxGamePages ?? 5;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

  const players = listCachedPlayers();
  if (!players.length) {
    throw new Error('Nenhum jogador na base para atualizar. Importe uma listagem primeiro.');
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < players.length; i++) {
    const pl = players[i];
    const basePct = Math.round((i / players.length) * 95);

    onProgress({
      step: 'player',
      message: `(${i + 1}/${players.length}) Atualizando ${pl.slug}...`,
      pct: basePct,
    });

    try {
      await scrapePlayer(pl.slug, pl.id, {
        maxGamePages,
        onProgress: (p) => {
          onProgress({
            step: 'player-detail',
            message: `(${i + 1}/${players.length}) ${pl.slug}: ${p.message}`,
            pct: basePct,
          });
        },
      });
      results.push({ slug: pl.slug, id: pl.id, ok: true });
    } catch (err) {
      console.warn(`  ⚠️ falhou ao atualizar ${pl.slug}/${pl.id}: ${err.message}`);
      errors.push({ slug: pl.slug, id: pl.id, error: err.message });
    }

    if (i < players.length - 1) {
      onProgress({
        step: 'pause',
        message: `Pausa entre jogadores (${i + 1}/${players.length} feitos)...`,
        pct: basePct,
      });
      await humanPause('long', 'pausa entre atualizações da base');
    }
  }

  onProgress({ step: 'done', message: 'Atualização concluída.', pct: 100 });

  // Mesmo formato de retorno de scrapePlayerList, para o front reusar a
  // mesma lógica de exibição/poll sem precisar diferenciar os dois casos.
  return {
    totalFound: players.length,
    totalScraped: results.length,
    totalErrors: errors.length,
    players,
    results,
    errors,
    scrapedAt: new Date().toISOString(),
  };
}

module.exports = { refreshAllPlayers, listCachedPlayers };
