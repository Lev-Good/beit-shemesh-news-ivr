'use strict';
const express = require('express');
const { YemotRouter } = require('yemot-router2');
const { loadConfig } = require('./config');
const { log } = require('./logger');
const { YemotClient } = require('./yemot/client');
const { createPublisher } = require('./yemot/publisher');
const { createCallFlow, createYemotIo } = require('./yemot/callFlow');
const { createProcessor } = require('./services/processor');
const { createGemini } = require('./services/gemini');
const { createGroqRewriter } = require('./services/groq');
const { createTtsProvider } = require('./services/tts');
const { RateLimiter } = require('./utils/rateLimiter');
const { createCleanup } = require('./utils/cleanup');

function createApp({ config = loadConfig(), yemot, gemini, tts, logger = log } = {}) {
  yemot ||= new YemotClient(config);
  const geminiFallback = gemini || createGemini({ apiKey: config.geminiApiKey, model: config.geminiModel, promptPath: config.promptPath });
  gemini ||= config.groqApiKey
    ? createGroqRewriter({ apiKey: config.groqApiKey, sttModel: config.groqSttModel, chatModel: config.groqChatModel, promptPath: config.promptPath, fallback: geminiFallback })
    : geminiFallback;
  tts ||= createTtsProvider(config);
  const processor = createProcessor({ yemot, gemini, tts, config });
  const publisher = createPublisher({ yemot, config });
  const rateLimiter = new RateLimiter({ perPhone: config.rateLimitPerPhoneHour, global: config.rateLimitGlobalPerHour });
  const flow = createCallFlow({ yemot, processor, publisher, rateLimiter, config, logger });
  const cleanup = createCleanup({ yemot, config, logger: error => logger('error', 'cleanup', error) });
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.get('/ping', (req, res) => res.status(200).json({ ok: true, service: 'beit-shemesh-news-ivr' }));
  app.get('/health', (req, res) => res.status(200).json({ ok: true }));
  const yemotGuard = (req, res, next) => {
    if (config.webhookSecret && req.query.secret !== config.webhookSecret && req.body?.secret !== config.webhookSecret) return res.status(403).json({ message: 'forbidden' });
    const values = req.method === 'POST' ? req.body : req.query;
    if (!values?.ApiCallId) return res.status(400).json({ message: 'ApiCallId חסר' });
    next();
  };
  const errorHandler = async (error, call) => {
    logger('error', 'yemot_router', error, call?.callId);
    return call.id_list_message([{ type: 'text', data: 'אירעה תקלה זמנית, אנא נסו שוב מאוחר יותר' }]);
  };
  const router = YemotRouter({ printLog: false, uncaughtErrorHandler: errorHandler });
  router.get('/', async call => flow.run(call, createYemotIo(call, processor, config)));
  app.use('/yemot', yemotGuard, router);

  const listenersOverrides = {
    publish: '2/1', archive: '2/2/archive', preview: '2/2/preview',
    prompt: 'listeners', voice: 'Puck', tzintukList: '50', tzintukCallerId: '0775316147'
  };
  const listenersRouter = YemotRouter({ printLog: false, uncaughtErrorHandler: errorHandler });
  listenersRouter.get('/', async call => flow.run(call, createYemotIo(call, processor, config), listenersOverrides));
  app.use('/yemot-listeners', yemotGuard, listenersRouter);
  app.use((error, req, res, next) => { logger('error', 'http', error); if (!res.headersSent) res.status(500).json({ message: 'אירעה תקלה זמנית' }); });
  return { app, cleanup, processor, publisher, flow };
}

if (require.main === module) {
  const config = loadConfig(); const { app, cleanup } = createApp({ config });
  const server = app.listen(config.port, () => log('info', 'startup', `שרת חדשות בית שמש פעיל בפורט ${config.port}`));
  cleanup.start();
  const shutdown = () => { cleanup.stop(); server.close(() => process.exit(0)); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
module.exports = { createApp };
