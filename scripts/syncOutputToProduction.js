'use strict';

// Envia toda a pasta output/ (base já raspada localmente) para a produção
// de uma vez, usando o mesmo endpoint /api/sync/upload que o scraper usa
// automaticamente após cada scrape novo.
//
// Uso:
//   npm run sync:upload
//
// Requer SYNC_URL e SYNC_TOKEN definidos no .env (raiz do projeto) ou
// já exportados no ambiente, com o mesmo SYNC_TOKEN configurado nas
// Variables do serviço no Railway.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { loadEnv } = require('../src/loadEnv');
const { OUTPUT_DIR } = require('../src/paths');

loadEnv();

const SYNC_URL = process.env.SYNC_URL || '';
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';

async function main() {
  if (!SYNC_URL || !SYNC_TOKEN) {
    console.error(
      '❌ SYNC_URL e/ou SYNC_TOKEN não definidos. Preencha o .env (veja .env.example) antes de rodar.'
    );
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error(`❌ Pasta ${OUTPUT_DIR} não existe — nada para enviar.`);
    process.exit(1);
  }

  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('Nenhum arquivo .json encontrado em output/. Nada para enviar.');
    return;
  }

  console.log(`Enviando ${files.length} arquivo(s) de ${OUTPUT_DIR} para ${SYNC_URL}...\n`);

  const uploadUrl = `${SYNC_URL.replace(/\/$/, '')}/api/sync/upload`;
  let ok = 0;
  let fail = 0;

  for (const filename of files) {
    const filePath = path.join(OUTPUT_DIR, filename);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      await axios.post(
        uploadUrl,
        { filename, data },
        {
          headers: { 'Content-Type': 'application/json', 'X-Sync-Token': SYNC_TOKEN },
          timeout: 20000,
        }
      );
      console.log(`  ✅ ${filename}`);
      ok += 1;
    } catch (err) {
      const detail = err.response?.data?.error || err.message;
      console.warn(`  ❌ ${filename}: ${detail}`);
      fail += 1;
    }
  }

  console.log(`\nConcluído: ${ok} enviado(s), ${fail} falharam.`);
  if (fail > 0) process.exitCode = 1;
}

main();
