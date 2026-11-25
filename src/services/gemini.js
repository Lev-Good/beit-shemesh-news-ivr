'use strict';
const fs = require('node:fs/promises');
const { GoogleGenAI } = require('@google/genai');
function parseJson(text) { const clean = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''); return JSON.parse(clean); }
function createGemini({ apiKey, model = 'gemini-3.1-flash-lite', fallbackModels = ['gemini-3.8-flash', 'gemini-3.5-flash'], promptPath }) {
  const ai = new GoogleGenAI({ apiKey });
  const models = [...new Set([model, ...fallbackModels].filter(Boolean))];
  return { async rewrite(audio, mimeType = 'audio/wav', customPromptPath = null) {
    const prompt = await fs.readFile(customPromptPath || promptPath, 'utf8');
    let lastError;
    for (const currentModel of models) {
      try {
        const response = await ai.models.generateContent({ model: currentModel, contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: Buffer.from(audio).toString('base64') } }] }], config: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { status: { type: 'STRING', enum: ['ok', 'unprocessable'] }, text: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['status', 'text', 'reason'] } } });
        const result = parseJson(response.text || '');
        if (!['ok', 'unprocessable'].includes(result.status) || typeof result.text !== 'string' || typeof result.reason !== 'string') throw new Error('תשובת Gemini אינה במבנה הצפוי');
        if (result.status === 'ok' && !result.text.trim()) return { status: 'unprocessable', text: '', reason: 'התקבלה תשובה ריקה' };
        return result;
      } catch (error) {
        lastError = error;
        if (!/503|500|429|UNAVAILABLE|overloaded|NOT_FOUND/i.test(String(error?.message || error))) throw error;
      }
    }
    throw lastError;
  } };
}
module.exports = { createGemini };
