'use strict';

const fs = require('fs');
const path = require('path');

// Loader de .env sem dependência externa — o projeto não tinha nenhum
// mecanismo carregando o .env, então SYNC_URL/SYNC_TOKEN preenchidos lá
// nunca chegavam a process.env (sync falhava silenciosamente).
function loadEnv(envPath = path.join(__dirname, '..', '.env')) {
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

module.exports = { loadEnv };
