'use strict';
const fs = require('node:fs/promises');

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

function parseJson(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

function createGroqRewriter({ apiKey, sttModel = 'whisper-large-v3-turbo', chatModel = 'openai/gpt-oss-120b', promptPath, fallback = null, fetchImpl = fetch }) {
  return {
    async rewrite(audio, mimeType = 'audio/wav') {
      try {
        const form = new FormData();
        form.append('file', new Blob([audio], { type: mimeType }), 'recording.wav');
        form.append('model', sttModel);
        form.append('language', 'he');
        form.append('response_format', 'json');
        form.append('temperature', '0');

        const sttRes = await fetchImpl(GROQ_STT_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(12000)
        });
        if (!sttRes.ok) throw new Error(`Groq STT HTTP ${sttRes.status}: ${(await sttRes.text()).slice(0, 200)}`);
        const sttData = await sttRes.json();
        const transcript = String(sttData?.text || '').trim();
        if (transcript.length < 2) {
          return { status: 'unprocessable', text: '', reason: 'לא זוהה דיבור ברור בהקלטה' };
        }

        const prompt = await fs.readFile(promptPath, 'utf8');
        const chatRes = await fetchImpl(GROQ_CHAT_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: chatModel,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: `תמלול ההקלטה:\n${transcript}` }
            ]
          }),
          signal: AbortSignal.timeout(12000)
        });
        if (!chatRes.ok) throw new Error(`Groq Chat HTTP ${chatRes.status}: ${(await chatRes.text()).slice(0, 200)}`);
        const chatData = await chatRes.json();
        const content = chatData?.choices?.[0]?.message?.content || '';
        const result = parseJson(content);
        if (!['ok', 'unprocessable'].includes(result.status) || typeof result.text !== 'string' || typeof result.reason !== 'string') {
          throw new Error('תשובת Groq אינה במבנה הצפוי');
        }
        if (result.status === 'ok' && !result.text.trim()) {
          return { status: 'unprocessable', text: '', reason: 'התקבלה תשובה ריקה' };
        }
        return result;
      } catch (error) {
        if (fallback) return fallback.rewrite(audio, mimeType);
        throw error;
      }
    }
  };
}

module.exports = { createGroqRewriter };
