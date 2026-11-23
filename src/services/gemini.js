'use strict';
const fs = require('node:fs/promises');
const { GoogleGenAI } = require('@google/genai');
function parseJson(text) { const clean = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''); return JSON.parse(clean); }
function createGemini({ apiKey, model = 'gemini-2.5-flash', promptPath }) {
  const ai = new GoogleGenAI({ apiKey });
  return { async rewrite(audio, mimeType = 'audio/wav') {
    const prompt = await fs.readFile(promptPath, 'utf8');
    const response = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: Buffer.from(audio).toString('base64') } }] }], config: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { status: { type: 'STRING', enum: ['ok', 'unprocessable'] }, text: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['status', 'text', 'reason'] } } });
    const result = parseJson(response.text || '');
    if (!['ok', 'unprocessable'].includes(result.status) || typeof result.text !== 'string' || typeof result.reason !== 'string') throw new Error('תשובת Gemini אינה במבנה הצפוי');
    if (result.status === 'ok' && !result.text.trim()) return { status: 'unprocessable', text: '', reason: 'התקבלה תשובה ריקה' };
    return result;
  } };
}
module.exports = { createGemini };
