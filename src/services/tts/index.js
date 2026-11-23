'use strict';
const { EdgeTtsProvider } = require('./edgeTts');
const { AzureTtsProvider } = require('./azureTts');
function createTtsProvider(config) {
  if (config.ttsProvider === 'azure') return new AzureTtsProvider({ key: config.azureSpeechKey, region: config.azureSpeechRegion, voice: config.azureTtsVoice });
  return new EdgeTtsProvider({ voice: config.edgeTtsVoice });
}
module.exports = { createTtsProvider, EdgeTtsProvider, AzureTtsProvider };
