'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCallFlow, sanitizeForTTS, toYemotFilePath } = require('../src/yemot/callFlow');

function setup({ jobs = [], recordings = ['recording.wav'], choices = [] } = {}) {
  const state = { archived: [], published: [], removed: [], processed: [], records: 0, previewCalls: 0 };
  const yemot = { async copyFile(from, to) { state.archived.push([from, to]); }, async deleteFile(path) { state.removed.push(path); } };
  const processor = { start(id, path) { state.processed.push(path); const next = jobs.shift() || { status: 'ready', previewPath: `preview/${id}.wav`, result: { text: 'ערוך' } }; return { ...next }; }, async discard() {}, async removePreview(path) { state.removed.push(`preview:${path}`); } };
  const publisher = { async publish(path, id) { state.published.push([path, id]); return { number: 5 }; } };
  const rateLimiter = { allow() { return true; } };
  const config = { archivePath: 'archive', maxRecordingSeconds: 120, maxWaitSeconds: 0.01 };
  const flow = createCallFlow({ yemot, processor, publisher, rateLimiter, config, logger() {} });
  const io = {
    async record() { state.records++; return recordings.shift() || 'new-recording.wav'; }, async waiting() { return '0'; }, async waitMore() { return '1'; },
    async preview() { state.previewCalls++; return choices.shift() || '1'; }, async aiFailure() { return choices.shift() || '2'; }, async unprocessable() {}, async noRecording() {}, async rateLimited() {}, async published() {}, async error() {}
  };
  return { flow, io, state };
}

test('זרימה מלאה: ארכיון, preview, אישור מפורש, פרסום ומחיקת preview', async () => {
  const { flow, io, state } = setup(); const result = await flow.run({ callId: 'abc', phone: '050' }, io);
  assert.equal(result.state, 'published'); assert.equal(state.archived.length, 1); assert.deepEqual(state.published, [['preview/abc.wav', 'abc']]); assert.equal(state.removed[0], 'preview:abc');
});

test('בחירה 2 שולחת את אותה הקלטה המקורית לעיבוד מחדש', async () => {
  const { flow, io, state } = setup({ choices: ['2', '1'] }); await flow.run({ callId: 'reword', phone: '1' }, io);
  assert.equal(state.processed.length, 2); assert.equal(state.processed[0], state.processed[1]); assert.equal(state.records, 1);
});

test('בחירה 3 מבקשת הקלטה נוספת ושומרת גם אותה בארכיון', async () => {
  const { flow, io, state } = setup({ choices: ['3', '1'], recordings: ['one.wav', 'two.wav'] }); await flow.run({ callId: 'newtake', phone: '1' }, io);
  assert.equal(state.records, 2); assert.equal(state.archived.length, 2);
});

test('ניתוק לפני אישור לא מפרסם והמקור נשאר בארכיון', async () => {
  const { flow, io, state } = setup({ jobs: [{ status: 'processing' }] });
  const result = await flow.run({ callId: 'hangup', phone: '1' }, { ...io, waitMore: async () => '2', waiting: async () => new Promise(resolve => setTimeout(() => resolve('0'), 2)) });
  assert.equal(result.state, 'disconnected'); assert.equal(state.published.length, 0); assert.equal(state.archived.length, 1);
});

test('כשל AI מאפשר לפרסם הקלטה מקורית או לבצע ניסיון חוזר', async () => {
  const { flow, io, state } = setup({ jobs: [{ status: 'failed', error: new Error('AI') }, { status: 'ready', previewPath: 'p/new.wav', result: { text: 'נוסח חדש' } }], choices: ['2', '1'] });
  const result = await flow.run({ callId: 'retry', phone: '1' }, io); assert.equal(result.state, 'published'); assert.equal(state.processed.length, 2);
  const direct = setup({ jobs: [{ status: 'failed' }], choices: ['1'] }); const fallback = await direct.flow.run({ callId: 'raw', phone: '2' }, direct.io);
  assert.equal(fallback.state, 'published_original'); assert.deepEqual(direct.state.published, [['archive/raw_1.wav', 'raw']]);
});

test('הקלטה לא ברורה חוזרת לשלב ההקלטה בלי פרסום', async () => {
  const { flow, io, state } = setup({ jobs: [{ status: 'unprocessable' }, { status: 'ready', previewPath: 'p/ok.wav', result: { text: 'טקסט' } }], choices: ['1'], recordings: ['quiet.wav', 'clear.wav'] });
  const result = await flow.run({ callId: 'quiet', phone: '3' }, io); assert.equal(result.state, 'published'); assert.equal(state.records, 2); assert.equal(state.published.length, 1);
});

test('סניטציה ל-yemot-router2 מסירה תווים אסורים ב-TTS ובנתיבי קבצים', () => {
  assert.equal(sanitizeForTTS('שלום. "חדשות" בית-שמש & עוד|דבר'), 'שלום חדשות בית שמש עוד דבר');
  assert.equal(toYemotFilePath('0/0/6/preview/call-123.wav'), '/0/0/6/preview/call_123');
});
