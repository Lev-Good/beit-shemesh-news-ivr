'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPublisher } = require('../src/yemot/publisher');

test('פרסום במקביל מקבל מספרים עוקבים תחת Mutex', async () => {
  const files = [{ name: '002.wav' }, { name: '004.wav' }, { name: 'welcome.wav' }]; const copied = [];
  const yemot = { async getIVR2Dir() { await new Promise(r => setTimeout(r, 5)); return { files: [...files] }; }, async copyFile(from, to) { await new Promise(r => setTimeout(r, 5)); copied.push(to); files.push({ name: to.split('/').at(-1) }); } };
  const publisher = createPublisher({ yemot, config: { publishPath: '1', publishOrderMode: 'highest_first' } });
  const results = await Promise.all([publisher.publish('p1.wav', 'c1'), publisher.publish('p2.wav', 'c2')]);
  assert.deepEqual(results.map(x => x.number), [5, 6]); assert.deepEqual(copied, ['1/005.wav', '1/006.wav']);
});

test('מצב shift_to_zero מפנה מקום ומפרסם כ-000.wav', async () => {
  const actions = []; const yemot = { async getIVR2Dir() { return { files: [{ name: '000.wav', what: 'ivr2:1/000.wav' }, { name: '001.wav', what: 'ivr2:1/001.wav' }] }; }, async moveFile(a, b) { actions.push(['move', a, b]); }, async copyFile(a, b) { actions.push(['copy', a, b]); } };
  const publisher = createPublisher({ yemot, config: { publishPath: '1', publishOrderMode: 'shift_to_zero' } });
  await publisher.publish('source.wav', 'call');
  assert.deepEqual(actions, [['move', '1/001.wav', '1/002.wav'], ['move', '1/000.wav', '1/001.wav'], ['copy', 'source.wav', '1/000.wav']]);
});

test('פרסום מתעד ב-publish_log.txt ומשנה את שם קובץ הארכיון למספר הקובץ והטלפון', async () => {
  const moved = []; const logs = {};
  const yemot = {
    async getIVR2Dir() { return { files: [{ name: '004.wav' }] }; },
    async copyFile() {},
    async moveFile(a, b) { moved.push([a, b]); },
    async downloadTextFile(p) { return logs[p] || 'שורה ישנה\r\n'; },
    async uploadTextFile(p, c) { logs[p] = c; }
  };
  const publisher = createPublisher({ yemot, config: { publishPath: '2/1', publishOrderMode: 'highest_first' } });
  const res = await publisher.publish('2/2/preview/abc.wav', 'abc', '2/1', { phone: '0521234567', text: 'הודעה לדוגמה', archiveDir: '2/2/archive', archivePath: '2/2/archive/abc_1.wav' });
  assert.equal(res.number, 5);
  assert.deepEqual(moved, [['2/2/archive/abc_1.wav', '2/2/archive/005_0521234567.wav']]);
  assert.match(logs['2/1/publish_log.txt'], /קובץ: 005\.wav \| טלפון: 0521234567 \| טקסט: "הודעה לדוגמה"\r\nשורה ישנה/);
});
