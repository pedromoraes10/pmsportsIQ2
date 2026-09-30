'use strict';

const { DELAYS } = require('./config');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween([min, max]) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Espera um tempo aleatório dentro da faixa nomeada ("short" | "reading" | "long").
 * Loga o tempo escolhido para facilitar acompanhar o ritmo do scraper.
 */
async function humanPause(kind = 'short', label = '') {
  const range = DELAYS[kind] || DELAYS.short;
  const ms = randomBetween(range);
  const secs = (ms / 1000).toFixed(1);
  console.log(`  ⏳ pausa (${kind})${label ? ' - ' + label : ''}: ${secs}s`);
  await sleep(ms);
}

/**
 * "Jitter" pequeno e imprevisível, útil antes de cada request para não ter
 * um intervalo perfeitamente regular entre chamadas.
 */
async function jitter() {
  await sleep(randomBetween([150, 600]));
}

module.exports = { sleep, randomBetween, humanPause, jitter };
