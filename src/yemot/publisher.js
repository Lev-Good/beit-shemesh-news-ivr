'use strict';
const { Mutex } = require('../utils/mutex');
const publishMutex = new Mutex();
function numericWavs(files = []) { return files.map(file => ({ file, match: String(file.name || file.what || '').match(/(?:^|\/)(\d+)\.wav$/i) })).filter(x => x.match).map(x => ({ ...x, number: Number(x.match[1]) })); }
function pad(n) { return String(n).padStart(3, '0'); }
function formatIsraelTime(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date).replace(/,\s*/, ' ');
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}

async function recordPublishAudit({ yemot, targetDir, number, meta = {} }) {
  const fileName = `${pad(number)}.wav`;
  const phoneRaw = String(meta.phone || 'unknown').trim();
  const safePhone = phoneRaw.replace(/[^0-9A-Za-z]/g, '') || 'unknown';
  const cleanText = meta.text ? String(meta.text).replace(/[\r\n]+/g, ' ').trim() : '(הקלטה מקורית)';

  if (typeof yemot.uploadTextFile === 'function') {
    try {
      const logPath = `${targetDir}/publish_log.txt`;
      const existing = typeof yemot.downloadTextFile === 'function' ? await yemot.downloadTextFile(logPath) : '';
      const line = `${formatIsraelTime()} | קובץ: ${fileName} | טלפון: ${phoneRaw} | טקסט: "${cleanText}"`;
      const lines = [line, ...String(existing || '').split(/\r?\n/).filter(Boolean)].slice(0, 500);
      await yemot.uploadTextFile(logPath, `${lines.join('\r\n')}\r\n`);
    } catch {}
  }

  if (meta.archivePath && meta.archiveDir && typeof yemot.moveFile === 'function') {
    try {
      const namedArchive = `${meta.archiveDir}/${pad(number)}_${safePhone}.wav`;
      if (meta.archivePath !== namedArchive) await yemot.moveFile(meta.archivePath, namedArchive);
    } catch {}
  }
}

function createPublisher({ yemot, config, mutex = publishMutex }) {
  return { publish: (source, callId, publishPath = config.publishPath, meta = null) => mutex.runExclusive(async () => {
    const targetDir = publishPath || config.publishPath;
    const dir = await yemot.getIVR2Dir(targetDir); const files = numericWavs(dir.files);
    let published;
    if (config.publishOrderMode === 'shift_to_zero') {
      for (const { number, file } of files.sort((a, b) => b.number - a.number)) {
        const from = file.what ? file.what.replace(/^ivr2:/, '') : `${targetDir}/${file.name}`;
        await yemot.moveFile(from, `${targetDir}/${pad(number + 1)}.wav`);
      }
      const name = `${targetDir}/000.wav`; await yemot.copyFile(source, name); published = { path: name, number: 0, callId };
    } else {
      const number = files.reduce((max, x) => Math.max(max, x.number), -1) + 1;
      const name = `${targetDir}/${pad(number)}.wav`; await yemot.copyFile(source, name); published = { path: name, number, callId };
    }
    if (meta) await recordPublishAudit({ yemot, targetDir, number: published.number, meta });
    return published;
  }) };
}
module.exports = { createPublisher, numericWavs };
