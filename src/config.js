'use strict';
const path = require('node:path');
require('dotenv').config();

function int(name, fallback, min = 0, env = process.env) {
  const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
  if (!Number.isInteger(value) || value < min) throw new Error(`${name} חייב להיות מספר שלם >= ${min}`);
  return value;
}
function loadConfig(env = process.env) {
  const get = (key, fallback) => env[key] === undefined || env[key] === '' ? fallback : env[key];
  const config = {
    port: int('PORT', 3000, 1, env), webhookSecret: get('WEBHOOK_SECRET', ''),
    yemotToken: get('YEMOT_TOKEN', ''), yemotUsername: get('YEMOT_USERNAME', ''), yemotPassword: get('YEMOT_PASSWORD', ''),
    yemotPathPrefix: get('YEMOT_PATH_PREFIX', 'ivr2:'),
    publishPath: get('YEMOT_PUBLISH_PATH', '1'), previewPath: get('YEMOT_PREVIEW_PATH', '0/0/6/preview'), archivePath: get('YEMOT_ARCHIVE_PATH', '0/0/6/archive'),
    publishOrderMode: get('PUBLISH_ORDER_MODE', 'highest_first'),
    groqApiKey: get('GROQ_API_KEY', ''), groqSttModel: get('GROQ_STT_MODEL', 'whisper-large-v3-turbo'), groqChatModel: get('GROQ_CHAT_MODEL', 'openai/gpt-oss-120b'),
    geminiApiKey: get('GEMINI_API_KEY', ''), geminiModel: get('GEMINI_MODEL', 'gemini-3.1-flash-lite'),
    ttsProvider: get('TTS_PROVIDER', 'gemini'), geminiTtsModel: get('GEMINI_TTS_MODEL', 'gemini-3.8-flash-lite-tts'), geminiTtsVoice: get('GEMINI_TTS_VOICE', 'Charon'),
    edgeTtsVoice: get('EDGE_TTS_VOICE', 'he-IL-AvriNeural'), azureSpeechKey: get('AZURE_SPEECH_KEY', ''), azureSpeechRegion: get('AZURE_SPEECH_REGION', ''), azureTtsVoice: get('AZURE_TTS_VOICE', 'he-IL-AvriNeural'),
    maxRecordingSeconds: int('MAX_RECORDING_SECONDS', 120, 1, env), maxWaitSeconds: int('MAX_WAIT_SECONDS', 40, 1, env), aiRetryCount: int('AI_RETRY_COUNT', 2, 0, env), aiRetryDelayMs: int('AI_RETRY_DELAY_MS', 3000, 0, env),
    yemotRetryCount: int('YEMOT_RETRY_COUNT', 3, 0, env), yemotRetryDelayMs: int('YEMOT_RETRY_DELAY_MS', 1000, 0, env), previewTtlHours: int('PREVIEW_TTL_HOURS', 24, 1, env), archiveRetentionDays: int('ARCHIVE_RETENTION_DAYS', 30, 1, env), rateLimitPerPhoneHour: int('RATE_LIMIT_PER_PHONE_HOUR', 10, 1, env), rateLimitGlobalPerHour: int('RATE_LIMIT_GLOBAL_PER_HOUR', 120, 1, env),
    promptPath: path.join(__dirname, '..', 'prompts', 'rewrite.txt'),
    promptsDir: path.join(__dirname, '..', 'prompts')
  };
  if (!['highest_first', 'shift_to_zero'].includes(config.publishOrderMode)) throw new Error('PUBLISH_ORDER_MODE לא תקין');
  if (!['gemini', 'edge', 'azure'].includes(config.ttsProvider)) throw new Error('TTS_PROVIDER חייב להיות gemini, edge או azure');
  if (!config.yemotToken && !(config.yemotUsername && config.yemotPassword)) throw new Error('יש להגדיר YEMOT_TOKEN או YEMOT_USERNAME ו-YEMOT_PASSWORD');
  if (!config.geminiApiKey) throw new Error('יש להגדיר GEMINI_API_KEY');
  if (config.ttsProvider === 'azure' && !(config.azureSpeechKey && config.azureSpeechRegion)) throw new Error('ספק Azure דורש AZURE_SPEECH_KEY ו-AZURE_SPEECH_REGION');
  return config;
}
module.exports = { loadConfig };
