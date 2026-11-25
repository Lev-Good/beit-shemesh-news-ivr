'use strict';
const { log } = require('../logger');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function createProcessor({ yemot, gemini, tts, config }) {
  const jobs = new Map();
  function execute(callId, originalPath, opts = {}) {
    const { previewDir = config.previewPath, promptPath = null, voice = null } = typeof opts === 'string' ? { previewDir: opts } : (opts || {});
    const job = { callId, originalPath, status: 'processing', previewPath: null, result: null, error: null, attempts: 0, promise: null }; jobs.set(callId, job);
    job.promise = (async () => {
      for (let attempt = 0; attempt <= config.aiRetryCount; attempt++) {
        job.attempts = attempt + 1;
        try {
          const audio = await yemot.downloadFile(originalPath); const result = await gemini.rewrite(audio, 'audio/wav', promptPath);
          job.result = result;
          if (result.status === 'unprocessable') { job.status = 'unprocessable'; return job; }
          const spoken = await tts.synthesize(result.text, voice); const safeId = String(callId).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 100) || 'call'; const preview = `${previewDir || config.previewPath}/${safeId}.wav`;
          const uploadExt = config.ttsProvider === 'edge' ? 'mp3' : 'wav';
          const uploaded = await yemot.uploadFile(preview, spoken, `${safeId}.${uploadExt}`);
          job.previewPath = preview; job.duration = Number(uploaded.duration); job.status = 'ready'; return job;
        } catch (error) { job.error = error; if (attempt < config.aiRetryCount) await sleep(config.aiRetryDelayMs); }
      }
      job.status = 'failed'; log('error', 'processor', job.error, callId); return job;
    })();
    return job;
  }
  return {
    jobs, start: execute,
    async wait(callId, timeoutMs) {
      const job = jobs.get(callId); if (!job) throw new Error('משימת העיבוד לא נמצאה');
      if (job.status !== 'processing') return job;
      await Promise.race([job.promise, new Promise(resolve => setTimeout(resolve, timeoutMs))]); return job;
    },
    async removePreview(callId) { const job = jobs.get(callId); try { if (job?.previewPath) await yemot.deleteFile(job.previewPath); } finally { if (job) job.previewPath = null; jobs.delete(callId); } },
    async discard(callId) { await this.removePreview(callId).catch(() => {}); jobs.delete(callId); },
    forget(callId) { jobs.delete(callId); }
  };
}
module.exports = { createProcessor };
