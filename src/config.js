'use strict';

module.exports = {
  BASE_URL: 'https://www.ogol.com.br',

  // Monta as 3 URLs alvo a partir de slug + id do jogador
  urls(slug, id) {
    const base = `${this.BASE_URL}/jogador/${slug}/${id}`;
    return {
      perfil: base,
      competicoes: `${base}/competicoes`,
      jogos: `${base}/jogos`,
    };
  },

  // Pool de User-Agents "reais" para alternar entre requisições
  USER_AGENTS: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  ],

  // Faixas de espera (ms) para simular comportamento humano.
  // "curta" entre passos pequenos, "leitura" simulando tempo lendo a página,
  // "longa" ocasional para quebrar qualquer padrão fixo.
  DELAYS: {
    short: [1500, 2500],
    reading: [4000, 7000],
    long: [8000, 12000],
  },

  // A cada N requisições, força uma pausa longa extra
  LONG_PAUSE_EVERY: 3,

  // Tentativas em caso de erro/bloqueio (429/403) com backoff crescente
  RETRY: {
    maxAttempts: 5,
    baseBackoffMs: 15000,
  },
};
