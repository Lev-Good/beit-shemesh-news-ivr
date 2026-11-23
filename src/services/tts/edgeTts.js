'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
class EdgeTtsProvider {
  constructor({ voice = 'he-IL-AvriNeural' } = {}) { this.voice = voice; }
  async synthesize(text) {
    const { EdgeTTS } = require('node-edge-tts'); const file = path.join(os.tmpdir(), `news-tts-${randomUUID()}.mp3`);
    try { const tts = new EdgeTTS({ voice: this.voice, lang: 'he-IL', outputFormat: 'audio-24khz-96kbitrate-mono-mp3' }); await tts.ttsPromise(text, file); return await fs.readFile(file); }
    finally { await fs.rm(file, { force: true }).catch(() => {}); }
  }
}
module.exports = { EdgeTtsProvider };
