'use strict';
const { EdgeTtsProvider } = require('./edgeTts');
const { AzureTtsProvider } = require('./azureTts');
const { GeminiTtsProvider } = require('./geminiTts');
function createTtsProvider(config) {
  if (config.ttsProvider === 'gemini') return new GeminiTtsProvider({ apiKey: config.geminiApiKey, model: config.geminiTtsModel, voice: config.geminiTtsVoice });
  if (config.ttsProvider === 'azure') return new AzureTtsProvider({ key: config.azureSpeechKey, region: config.azureSpeechRegion, voice: config.azureTtsVoice });
  return new EdgeTtsProvider({ voice: config.edgeTtsVoice });
}
module.exports = { createTtsProvider, GeminiTtsProvider, EdgeTtsProvider, AzureTtsProvider };
