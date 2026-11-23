'use strict';
function yemotDate(value) {
  const raw = String(value || '').trim(); const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return Date.parse(raw);
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0)).getTime();
}
function createCleanup({ yemot, config, logger = () => {} }) {
  let timer;
  async function run() {
    const dir = await yemot.getIVR2Dir(config.previewPath); const cutoff = Date.now() - config.previewTtlHours * 3600000;
    for (const file of dir.files || []) {
      const modified = yemotDate(file.mtime); if (!Number.isFinite(modified) || modified >= cutoff) continue;
      const target = file.what ? file.what.replace(/^ivr2:/, '') : `${config.previewPath}/${file.name}`;
      try { await yemot.deleteFile(target); } catch (error) { logger(error); }
    }
  }
  return { run, start() { timer = setInterval(() => run().catch(logger), 60 * 60 * 1000); timer.unref?.(); }, stop() { clearInterval(timer); } };
}
module.exports = { createCleanup, yemotDate };
