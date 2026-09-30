'use strict';

const { randomUUID } = require('crypto');
const { scrapePlayer } = require('./src/scrapePlayer');
const { scrapePlayerList } = require('./src/scrapePlayerList');
const { refreshAllPlayers } = require('./src/refreshAllPlayers');
const { sanitizeSlug, sanitizeId } = require('./src/playerInput');

// jobId -> job
const jobs = new Map();
// chave de dedupe (ex: "player::neymar::54814") -> jobId em execução
const activeKeys = new Map();

function runJob({ type, key, meta }, asyncFn) {
  if (key && activeKeys.has(key)) {
    const runningJobId = activeKeys.get(key);
    const running = jobs.get(runningJobId);
    if (running && running.status === 'running') return running;
  }

  const jobId = randomUUID();
  const job = {
    jobId,
    type,
    ...meta,
    status: 'running', // running | done | error
    progress: { step: 'queued', message: 'Na fila...', pct: 0 },
    result: null,
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(jobId, job);
  if (key) activeKeys.set(key, jobId);

  (async () => {
    try {
      const result = await asyncFn((p) => {
        job.progress = p;
      });
      job.status = 'done';
      job.result = result;
      job.finishedAt = Date.now();
    } catch (err) {
      job.status = 'error';
      job.error = err.message || String(err);
      job.finishedAt = Date.now();
    } finally {
      if (key && activeKeys.get(key) === jobId) activeKeys.delete(key);
    }
  })();

  return job;
}

function createJob(slug, id, opts) {
  slug = sanitizeSlug(slug);
  id = sanitizeId(id);
  if (!slug || !id) throw new Error('slug/id inválidos após sanitização.');

  return runJob(
    { type: 'player', key: `player::${slug}::${id}`, meta: { slug, id } },
    (onProgress) => scrapePlayer(slug, id, { ...opts, onProgress })
  );
}

function createListJob(listUrl, opts) {
  if (!listUrl || typeof listUrl !== 'string') throw new Error('listUrl inválida.');

  return runJob(
    { type: 'list', key: null, meta: { listUrl } },
    (onProgress) => scrapePlayerList(listUrl, { ...opts, onProgress })
  );
}

// key fixo garante que só roda uma atualização em massa por vez —
// clicar de novo enquanto já está rodando devolve o job em andamento.
function createRefreshAllJob(opts) {
  return runJob(
    { type: 'refresh-all', key: 'refresh-all', meta: {} },
    (onProgress) => refreshAllPlayers({ ...opts, onProgress })
  );
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function listJobs() {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

module.exports = { createJob, createListJob, createRefreshAllJob, getJob, listJobs };
