'use strict';
const { GoogleGenAI } = require('@google/genai');

function pcmToWav(pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

class GeminiTtsProvider {
  constructor({ apiKey, model = 'gemini-3.8-flash-lite-tts', fallbackModels = ['gemini-3.8-flash-tts'], voice = 'Orus' } = {}) {
    this.ai = new GoogleGenAI({ apiKey });
    this.models = [...new Set([model, ...fallbackModels].filter(Boolean))];
    this.voice = voice;
  }

  async synthesize(text) {
    let lastError;
    for (const model of this.models) {
      try {
        const response = await this.ai.models.generateContent({
          model,
          contents: `קריין בקול רדיו חדשותי ברור, נעים ומכובד בעברית את הטקסט הבא בדיוק כפי שהוא כתוב, ללא תוספות:\n${text}`,
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voice } } }
          }
        });
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData;
        if (!part?.data) throw new Error('Gemini TTS לא החזיר אודיו');
        const raw = Buffer.from(part.data, 'base64');
        if (!raw.length) throw new Error('Gemini TTS החזיר אודיו ריק');
        const mime = String(part.mimeType || '').toLowerCase();
        if (mime.includes('wav') || raw.subarray(0, 4).toString('ascii') === 'RIFF') return raw;
        const rateMatch = mime.match(/rate=(\d+)/);
        return pcmToWav(raw, rateMatch ? Number(rateMatch[1]) : 24000);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}

module.exports = { GeminiTtsProvider, pcmToWav };
