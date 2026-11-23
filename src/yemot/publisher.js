'use strict';
const { Mutex } = require('../utils/mutex');
const publishMutex = new Mutex();
function numericWavs(files = []) { return files.map(file => ({ file, match: String(file.name || file.what || '').match(/(?:^|\/)(\d+)\.wav$/i) })).filter(x => x.match).map(x => ({ ...x, number: Number(x.match[1]) })); }
function pad(n) { return String(n).padStart(3, '0'); }
function createPublisher({ yemot, config, mutex = publishMutex }) {
  return { publish: (source, callId) => mutex.runExclusive(async () => {
    const dir = await yemot.getIVR2Dir(config.publishPath); const files = numericWavs(dir.files);
    if (config.publishOrderMode === 'shift_to_zero') {
      for (const { number, file } of files.sort((a, b) => b.number - a.number)) {
        const from = file.what ? file.what.replace(/^ivr2:/, '') : `${config.publishPath}/${file.name}`;
        await yemot.moveFile(from, `${config.publishPath}/${pad(number + 1)}.wav`);
      }
      const name = `${config.publishPath}/000.wav`; await yemot.copyFile(source, name); return { path: name, number: 0, callId };
    }
    const number = files.reduce((max, x) => Math.max(max, x.number), -1) + 1;
    const name = `${config.publishPath}/${pad(number)}.wav`; await yemot.copyFile(source, name); return { path: name, number, callId };
  }) };
}
module.exports = { createPublisher, numericWavs };
