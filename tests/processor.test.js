'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProcessor } = require('../src/services/processor');
const config = { previewPath: '0/0/6/preview', aiRetryCount: 0, aiRetryDelayMs: 0 };

test('מעבד Gemini, יוצר TTS ומעלה תצוגה מקדימה', async () => {
  const uploaded = []; const yemot = { async downloadFile() { return Buffer.from('audio'); }, async uploadFile(path, audio, filename) { uploaded.push({ path, audio, filename }); return { duration: 4 }; }, async deleteFile() {} };
  const processor = createProcessor({ yemot, gemini: { async rewrite() { return { status: 'ok', text: 'שלום', reason: '' }; } }, tts: { async synthesize(text) { return Buffer.from(text); } }, config });
  const job = processor.start('call-1', 'archive.wav'); await job.promise;
  assert.equal(job.status, 'ready'); assert.equal(job.previewPath, '0/0/6/preview/call_1.wav'); assert.equal(job.duration, 4); assert.equal(uploaded[0].audio.toString(), 'שלום'); assert.equal(uploaded[0].filename, 'call_1.mp3');
});

test('הקלטה שקטה חוזרת כ-unprocessable ללא יצירת TTS', async () => {
  let ttsCalls = 0; const yemot = { async downloadFile() { return Buffer.from('silence'); }, async uploadFile() { throw new Error('לא אמור לקרות'); } };
  const processor = createProcessor({ yemot, gemini: { async rewrite() { return { status: 'unprocessable', text: '', reason: 'שקט' }; } }, tts: { async synthesize() { ttsCalls++; } }, config });
  const job = processor.start('silent', 'archive.wav'); await job.promise;
  assert.equal(job.status, 'unprocessable'); assert.equal(ttsCalls, 0);
});

test('כשל AI ו-TTS מסומן failed אחרי מספר הניסיונות', async () => {
  let calls = 0; const yemot = { async downloadFile() { return Buffer.from('audio'); } };
  const processor = createProcessor({ yemot, gemini: { async rewrite() { calls++; return { status: 'ok', text: 'הודעה', reason: '' }; } }, tts: { async synthesize() { throw new Error('TTS offline'); } }, config: { ...config, aiRetryCount: 1 } });
  const job = processor.start('failure', 'archive.wav'); await job.promise;
  assert.equal(job.status, 'failed'); assert.equal(calls, 2);
});
