'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/index');

test('נתיבי health ו-ping מחזירים 200 וה-webhook מחובר', async () => {
  const config = { port: 0, webhookSecret: 'secret', rateLimitPerPhoneHour: 10, rateLimitGlobalPerHour: 100, publishPath: '1', publishOrderMode: 'highest_first', previewPath: '0/0/6/preview', archivePath: '0/0/6/archive', aiRetryCount: 0, aiRetryDelayMs: 0, maxRecordingSeconds: 120, maxWaitSeconds: 1 };
  const { app } = createApp({ config, yemot: {}, gemini: {}, tts: {}, logger() {} });
  for (const routeName of ['/ping', '/health']) {
    const layer = app._router.stack.find(item => item.route?.path === routeName); assert.ok(layer, `${routeName} must exist`);
    const res = { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    layer.route.stack[0].handle({}, res); assert.equal(res.statusCode, 200); assert.equal(res.body.ok, true);
  }
  assert.ok(app._router.stack.some(item => item.name === 'router'), 'YemotRouter must be mounted');
});
