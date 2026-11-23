'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { YemotClient, validDuration } = require('../src/yemot/client');

test('duration מספרי או בפורמט דקות:שניות מתקבל רק כשגדול מאפס', () => {
  assert.equal(validDuration(2), true); assert.equal(validDuration('00:05'), true); assert.equal(validDuration(0), false); assert.equal(validDuration('bad'), false);
});

test('נתיבים קיימים עם קידומת ivr2 מנורמלים ללא קידומת כפולה', () => {
  const client = new YemotClient({ yemotToken: 'token', yemotPathPrefix: 'ivr2:' }, async () => {});
  assert.equal(client.path('/1/005.wav'), 'ivr2:1/005.wav'); assert.equal(client.path('ivr2:/1/005.wav'), 'ivr2:1/005.wav');
});

test('UploadFile מנסה שוב כשל רשת ומאמת WAV ומשך חיובי', async () => {
  let attempts = 0;
  const config = { yemotToken: 'token', yemotPathPrefix: 'ivr2:', yemotRetryCount: 1, yemotRetryDelayMs: 0 };
  const yemot = new YemotClient(config, async () => { attempts++; if (attempts === 1) return { ok: false, status: 503 }; return { ok: true, json: async () => ({ responseStatus: 'OK', duration: '00:05' }) }; });
  const result = await yemot.uploadFile('0/0/6/preview/a.wav', Buffer.from('audio'));
  assert.equal(result.duration, '00:05'); assert.equal(attempts, 2);
  await assert.rejects(() => yemot.uploadFile('wrong.mp3', Buffer.from('audio')), /wav/);
});
