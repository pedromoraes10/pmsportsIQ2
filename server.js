'use strict';

require('./src/loadEnv').loadEnv();

const fs = require('fs');
const path = require('path');
const express = require('express');
const compression = require('compression');
const { createJob, createListJob, createRefreshAllJob, getJob, listJobs } = require('./jobQueue');
const { parsePlayerInput } = require('./src/playerInput');
const { listSavedLists, getSavedList } = require('./src/scrapePlayerList');
const { buildDatabaseRecord } = require('./src/buildDatabaseRecord');
const { OUTPUT_DIR: CACHE_DIR, cachePath } = require('./src/paths');
const {
  searchTransfermarkt,
  scrapeTransfermarktProfile,
  listCachedTransfermarktPlayers,
  getCachedTransfermarktPlayer,
  listDebugRawFiles: listTmDebugRawFiles,
  getDebugRawFile: getTmDebugRawFile,
} = require('./src/scrapeTransfermarkt');

const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SYNC_TOKEN = process.env.SYNC_TOKEN || '';

const app = express();
app.use(compression());
app.use(express.json());

// Dashboard servido pela mesma origem da API — sem CORS, sem "Backend URL" pra digitar.
app.use(express.static(PUBLIC_DIR));

// --- Saúde da API -----------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'pm-sports-iq', time: new Date().toISOString() });
});

// --- Inicia um scrape de jogador único (assíncrono, retorna jobId) -----
app.post('/api/ogol/scrape', (req, res) => {
try {
  const { slug: rawSlug, id: rawId, maxGamePages, force } = req.body || {};

  if (!rawSlug || !rawId) {
    return res.status(400).json({ error: 'Informe "slug" e "id" do jogador.' });
  }

  const { slug, id } = parsePlayerInput(rawSlug, rawId);

  if (!slug || !id) {
    return res.status(400).json({
      error:
        'Não consegui extrair um slug/id válidos. Cole a URL completa do jogador ' +
        '(ex: https://www.ogol.com.br/jogador/neymar/54814) ou preencha slug e id separadamente.',
    });
  }

  if (!force && fs.existsSync(cachePath(slug, id))) {
    const cached = JSON.parse(fs.readFileSync(cachePath(slug, id), 'utf-8'));
    return res.json({ cached: true, result: cached });
  }

  const job = createJob(slug, id, { maxGamePages: maxGamePages ?? 5 });
  res.status(202).json({ cached: false, jobId: job.jobId, slug, id, status: job.status });
} catch (err) {
  return res.status(500).json({ error: 'Erro ao criar job: ' + err.message });
}
});

// --- Inicia um scrape de LISTA de jogadores -----------------------------
app.post('/api/ogol/scrape-list', (req, res) => {
try {
  const { listUrl, maxPlayers, maxListPages, maxGamePages, force } = req.body || {};

  if (!listUrl || !/^https?:\/\/(www\.)?ogol\.com\.br\//i.test(listUrl)) {
    return res.status(400).json({ error: 'Informe uma "listUrl" válida do ogol.com.br.' });
  }

  const job = createListJob(listUrl, {
    maxPlayers: maxPlayers ?? 20,
    maxListPages: maxListPages ?? 5,
    maxGamePages: maxGamePages ?? 3,
    force: force ?? false,
  });

  res.status(202).json({ jobId: job.jobId, status: job.status });
} catch (err) {
  return res.status(500).json({ error: 'Erro ao criar job de lista: ' + err.message });
}
});

// --- Listas de jogadores já processadas ---------------------------------
app.get('/api/ogol/lists', (_req, res) => {
  res.json(listSavedLists());
});

app.get('/api/ogol/lists/:file', (req, res) => {
  const data = getSavedList(req.params.file);
  if (!data) return res.status(404).json({ error: 'Lista não encontrada.' });
  res.json(data);
});

// --- Atualiza (re-scrape) TODOS os jogadores já existentes na base ------
app.post('/api/ogol/refresh-all', (req, res) => {
try {
  const { maxGamePages } = req.body || {};
  const job = createRefreshAllJob({ maxGamePages: maxGamePages ?? 5 });
  res.status(202).json({ jobId: job.jobId, status: job.status });
} catch (err) {
  return res.status(500).json({ error: 'Erro ao iniciar atualização: ' + err.message });
}
});

// --- Consulta o status/progresso/resultado de um job -------------------
app.get('/api/ogol/jobs/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job não encontrado.' });
  res.json(job);
});

app.get('/api/ogol/jobs', (_req, res) => {
  res.json(listJobs());
});

// --- Lista jogadores já em cache -----------------------------------
app.get('/api/ogol/players', (_req, res) => {
  if (!fs.existsSync(CACHE_DIR)) return res.json([]);
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  const players = files.map((f) => {
    const full = path.join(CACHE_DIR, f);
    const stat = fs.statSync(full);
    let nome = null;
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
      nome = data?.perfil?.dadosPessoais?.NOME || null;
    } catch (_) {}
    return { file: f, slug: f.replace(/_[^_]+\.json$/, ''), nome, scrapedAt: stat.mtime };
  });
  res.json(players);
});

app.get('/api/ogol/players/:slug/:id', (req, res) => {
  const { slug, id } = parsePlayerInput(req.params.slug, req.params.id);
  const file = cachePath(slug, id);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Não encontrado no cache.' });
  res.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
});

// --- Backoffice: base de jogadores achatada para filtrar/ordenar ---------
app.get('/api/ogol/database', (_req, res) => {
  if (!fs.existsSync(CACHE_DIR)) return res.json([]);
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  const records = files
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf-8'));
        return buildDatabaseRecord(data);
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean);
  res.json(records);
});

// --- Debug: baixa o HTML bruto salvo de uma tentativa de scrape ----------
// Útil pra diagnosticar em produção sem precisar de acesso a terminal/CLI:
// abra no navegador GET /api/ogol/debug/raw/perfil.raw.html (por exemplo).
app.get('/api/ogol/debug/raw/:name', (req, res) => {
  const safeName = path.basename(req.params.name); // evita path traversal
  const file = path.join(CACHE_DIR, safeName);
  if (!fs.existsSync(file)) return res.status(404).send('Arquivo não encontrado: ' + safeName);
  res.type('text/plain').send(fs.readFileSync(file, 'utf-8'));
});

// --- Debug: lista quais arquivos .raw.html existem no momento -----------
app.get('/api/ogol/debug/raw', (_req, res) => {
  if (!fs.existsSync(CACHE_DIR)) return res.json([]);
  const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.raw.html'));
  res.json(files);
});

// --- Sync: recebe dados de scrape vindos da máquina local -----------------
// O scraper local (IP residencial) envia o resultado após salvar localmente.
// Protegido por token para que apenas a sua máquina possa fazer upload.
app.post('/api/sync/upload', (req, res) => {
  try {
    const token = req.headers['x-sync-token'] || '';
    if (!SYNC_TOKEN || token !== SYNC_TOKEN) {
      return res.status(401).json({ error: 'Token inválido.' });
    }

    const { filename, data } = req.body || {};
    if (!filename || !data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Informe "filename" e "data".' });
    }

    // Valida nome do arquivo para evitar path traversal
    const safeName = path.basename(filename).replace(/[^a-z0-9_.-]/gi, '_');
    if (!safeName.endsWith('.json')) {
      return res.status(400).json({ error: 'Apenas arquivos .json são aceitos.' });
    }

    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, safeName), JSON.stringify(data, null, 2), 'utf-8');
    console.log(`  ☁️  Recebido via sync: ${safeName}`);
    res.json({ ok: true, saved: safeName });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar: ' + err.message });
  }
});

// --- Transfermarkt: busca por nome ---------------------------------------
app.get('/api/transfermarkt/search', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    if (!query) return res.status(400).json({ error: 'Informe "query" (nome do jogador).' });
    const results = await searchTransfermarkt(query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar no Transfermarkt: ' + err.message });
  }
});

// --- Transfermarkt: scrape de um jogador (síncrono — a página já traz tudo) ---
app.post('/api/transfermarkt/scrape', async (req, res) => {
  try {
    const { slug, id, force } = req.body || {};
    if (!slug || !id) return res.status(400).json({ error: 'Informe "slug" e "id" do jogador.' });
    const { cached, result } = await scrapeTransfermarktProfile(slug, id, { force: !!force });
    res.json({ cached, result });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao raspar Transfermarkt: ' + err.message });
  }
});

app.get('/api/transfermarkt/players', (_req, res) => {
  res.json(listCachedTransfermarktPlayers());
});

app.get('/api/transfermarkt/players/:slug/:id', (req, res) => {
  const data = getCachedTransfermarktPlayer(req.params.slug, req.params.id);
  if (!data) return res.status(404).json({ error: 'Não encontrado no cache.' });
  res.json(data);
});

// --- Debug: baixa o HTML bruto salvo de uma tentativa de busca/scrape no
// Transfermarkt — mesmo padrão do debug do ogol, útil pra ver exatamente o
// que o Playwright recebeu (ex: página de bloqueio anti-bot em vez do
// resultado real) sem precisar de acesso a terminal/CLI em produção.
app.get('/api/transfermarkt/debug/raw', (_req, res) => {
  res.json(listTmDebugRawFiles());
});

app.get('/api/transfermarkt/debug/raw/:name', (req, res) => {
  const html = getTmDebugRawFile(req.params.name);
  if (html == null) return res.status(404).send('Arquivo não encontrado: ' + req.params.name);
  res.type('text/plain').send(html);
});

app.listen(PORT, () => {
  console.log(`\n🟢 PM Sports IQ rodando em http://localhost:${PORT}`);
  console.log(`   Abra essa URL no navegador — dashboard e API estão no mesmo servidor.\n`);
});
