'use strict';
const path = require('node:path');
const { log } = require('../logger');

const PROMPT_FILES = { rewrite: 'rewrite.txt', listeners: 'listeners.txt' };

function createCallFlow({ yemot, processor, publisher, rateLimiter, config, logger = log }) {
  async function run(call, io, overrides = {}) {
    const callId = String(call.callId || call.id || ''); const phone = call.phone || 'unknown';
    const q = { ...(call.req?.query || {}), ...(overrides || {}) };
    const publishDir = String(q.publish || config.publishPath || '').replace(/^\/+|\/+$/g, '') || config.publishPath;
    const archiveDir = String(q.archive || config.archivePath || '').replace(/^\/+|\/+$/g, '') || config.archivePath;
    const previewDir = String(q.preview || config.previewPath || '').replace(/^\/+|\/+$/g, '') || config.previewPath;
    const promptKey = String(q.prompt || '').trim();
    const promptPath = PROMPT_FILES[promptKey] && config.promptsDir ? path.join(config.promptsDir, PROMPT_FILES[promptKey]) : null;
    const voice = q.voice ? String(q.voice).trim() : null;
    const procOpts = { previewDir, promptPath, voice };
    const tzintukList = q.tzintukList ? String(q.tzintukList).trim() : '';
    const tzintukCallerId = q.tzintukCallerId ? String(q.tzintukCallerId).trim() : '';
    const triggerTzintuk = () => {
      if (tzintukList && typeof yemot.runTzintuk === 'function') {
        yemot.runTzintuk(tzintukList, tzintukCallerId).catch(err => logger('error', 'tzintuk', err, callId));
      }
    };
    let originalPath = null; let archivePath = null; let revision = 0;
    if (!callId) throw new Error('ApiCallId חסר');
    if (!rateLimiter.allow(phone)) { await io.rateLimited(); return { state: 'rate_limited' }; }
    try {
      while (true) {
        originalPath = await io.record(config.maxRecordingSeconds);
        if (!originalPath) { await io.noRecording(); continue; }
        revision++;
        const safeId = callId.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 100) || 'call';
        archivePath = `${archiveDir}/${safeId}_${revision}.wav`;
        const ext = String(call.ApiExtension || call.values?.ApiExtension || '').replace(/^\/+|\/+$/g, '');
        const sourcePath = originalPath.includes('/') || !ext ? originalPath : `${ext}/${originalPath}`;
        await yemot.copyFile(sourcePath, archivePath);

        let job = processor.start(callId, archivePath, procOpts);
        while (true) {
          if (job.status === 'processing') {
            const started = Date.now();
            while (job.status === 'processing' && Date.now() - started < config.maxWaitSeconds * 1000) await io.waiting();
            if (job.status === 'processing' && await io.waitMore() !== '1') { processor.forget?.(callId); return { state: 'disconnected', archivePath }; }
            if (job.status === 'processing') continue;
          }
          if (job.status === 'unprocessable') { await io.unprocessable(); await processor.discard(callId); break; }
          if (job.status === 'failed') {
            const choice = await io.aiFailure();
            if (choice === '1') {
              const published = await publisher.publish(archivePath, callId, publishDir, { phone, text: '', archiveDir, archivePath }); triggerTzintuk(); await io.published(published); return { state: 'published_original', published, archivePath };
            }
            if (choice === '2') { job = processor.start(callId, archivePath, procOpts); continue; }
            return { state: 'disconnected', archivePath };
          }
          if (job.status === 'ready') {
            const choice = await io.preview(job.previewPath, job.result.text);
            if (choice === '1') {
              const published = await publisher.publish(job.previewPath, callId, publishDir, { phone, text: job.result?.text || '', archiveDir, archivePath });
              triggerTzintuk();
              await io.published(published); await processor.removePreview(callId);
              return { state: 'published', published, archivePath };
            }
            if (choice === '2') { await processor.discard(callId); job = processor.start(callId, archivePath, procOpts); continue; }
            if (choice === '3') { await processor.discard(callId); break; }
            if (choice === '4') continue;
          }
        }
      }
    } catch (error) {
      logger('error', 'call_flow', error, callId);
      processor.forget?.(callId);
      try { await io.error(); } catch {}
      return { state: 'failed', archivePath, error };
    }
  }
  return { run };
}

function sanitizeForTTS(text) {
  return String(text || '').replace(/[.\-'"&|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toYemotFilePath(filePath) {
  const clean = String(filePath || '').replace(/^\/+/, '').replace(/\.wav$/i, '').replace(/-/g, '_');
  return `/${clean}`;
}

function createYemotIo(call, processor, config) {
  const tap = (text, digits = ['1']) => call.read([{ type: 'text', data: sanitizeForTTS(text) }], 'tap', { min_digits: 1, max_digits: 1, digits_allowed: digits });
  return {
    record: maxLength => call.read([{ type: 'text', data: sanitizeForTTS('הקליטו את הודעתכם לאחר הצליל, לסיום הקישו סולמית') }], 'record', { max_length: maxLength, min_length: 1, no_confirm_menu: true, save_on_hangup: false }),
    waiting: async () => {
      await processor.wait(call.callId, 1500);
      if (processor.jobs.get(call.callId)?.status !== 'processing') return '1';
      return call.read([{ type: 'text', data: sanitizeForTTS('ההודעה בעיבוד, נא להמתין') }], 'tap', { max_digits: 1, sec_wait: 1, allow_empty: true, empty_val: '0', digits_allowed: ['1'] });
    },
    waitMore: () => tap('העיבוד עדיין נמשך, להמשך המתנה הקישו 1, לניתוק הקישו 2', ['1', '2']),
    preview: async (previewPath) => call.read([{ type: 'file', data: toYemotFilePath(previewPath) }, { type: 'text', data: sanitizeForTTS('לאישור ופרסום הקישו 1, לניסוח חדש הקישו 2, להקלטה חדשה הקישו 3, להשמעה חוזרת הקישו 4') }], 'tap', { min_digits: 1, max_digits: 1, digits_allowed: ['1', '2', '3', '4'] }),
    aiFailure: () => tap('המערכת החכמה אינה זמינה כרגע, לפרסום ההקלטה המקורית הקישו 1, לניסיון נוסף הקישו 2', ['1', '2']),
    unprocessable: () => call.read([{ type: 'text', data: sanitizeForTTS('ההקלטה לא הייתה ברורה, אנא הקליטו מחדש') }], 'tap', { max_digits: 1, sec_wait: 1, allow_empty: true, empty_val: '0' }),
    noRecording: () => call.read([{ type: 'text', data: sanitizeForTTS('לא התקבלה הקלטה, אנא נסו שוב') }], 'tap', { max_digits: 1, sec_wait: 1, allow_empty: true, empty_val: '0' }),
    rateLimited: () => call.id_list_message([{ type: 'text', data: sanitizeForTTS('בוצעו יותר מדי ניסיונות, אנא נסו שוב מאוחר יותר') }]),
    published: () => call.id_list_message([{ type: 'text', data: sanitizeForTTS('ההודעה פורסמה בהצלחה') }]),
    error: () => call.id_list_message([{ type: 'text', data: sanitizeForTTS('אירעה תקלה זמנית, ההקלטה נשמרה בארכיון, אנא נסו שוב מאוחר יותר') }])
  };
}

module.exports = { createCallFlow, createYemotIo, sanitizeForTTS, toYemotFilePath };
