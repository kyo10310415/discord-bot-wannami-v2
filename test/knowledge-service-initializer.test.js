const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SKIP_APP_ENV_VALIDATION = 'true';

const { KnowledgeServiceInitializer } = require('../services/knowledge-service-initializer');

test('knowledge services initialize once without waiting for Discord and tolerate optional Google failure', async () => {
  const calls = { provider: 0, google: 0, knowledge: 0, rag: 0 };
  const initializer = new KnowledgeServiceInitializer({
    sourceProvider: {
      initialize: async () => { calls.provider += 1; }
    },
    initializeGoogle: async () => {
      calls.google += 1;
      throw new Error('credentials unavailable');
    },
    initializeKnowledgeBase: async () => {
      calls.knowledge += 1;
      await new Promise((resolve) => setImmediate(resolve));
    },
    initializeRag: async () => { calls.rag += 1; },
    serviceLogger: { info() {}, warn() {}, success() {} }
  });

  const [first, second] = await Promise.all([initializer.initialize(), initializer.initialize()]);

  assert.deepEqual(calls, { provider: 1, google: 1, knowledge: 1, rag: 1 });
  assert.deepEqual(first, second);
  assert.equal(first.initialized, true);
  assert.equal(first.googleReady, false);
});
