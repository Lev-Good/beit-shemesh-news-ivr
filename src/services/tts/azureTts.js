'use strict';
class AzureTtsProvider {
  constructor({ key, region, voice = 'he-IL-AvriNeural', fetchImpl = fetch }) { this.key = key; this.region = region; this.voice = voice; this.fetch = fetchImpl; }
  async synthesize(text) {
    const ssml = `<speak version="1.0" xml:lang="he-IL"><voice name="${this.voice}">${String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])}</voice></speak>`;
    const response = await this.fetch(`https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': this.key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm' }, body: ssml });
    if (!response.ok) throw new Error(`Azure TTS נכשל: HTTP ${response.status}`); const audio = Buffer.from(await response.arrayBuffer()); if (!audio.length) throw new Error('Azure TTS החזיר קובץ ריק'); return audio;
  }
}
module.exports = { AzureTtsProvider };
