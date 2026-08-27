const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

process.env.SKIP_APP_ENV_VALIDATION = 'true';
process.env.KNOWLEDGE_SOURCE_PROVIDER = 'spreadsheet';

const migration = require('../db/migrate');
migration.runMigrations = async () => ({ applied: 0 });

const ragService = require('../services/rag-system');
const knowledgeInitializer = require('../services/knowledge-service-initializer');
knowledgeInitializer.initializeKnowledgeServices = async () => ({ initialized: true });
const { knowledgeSourceRepository } = require('../services/knowledge-source-repository');
knowledgeSourceRepository.list = async () => [{
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: '配信ガイド',
  url: 'https://example.com/guide',
  syncStatus: 'ready'
}];
knowledgeSourceRepository.getStats = async () => ({
  total: 1,
  active: 1,
  ready: 1,
  processing: 0,
  error: 0,
  addedThisMonth: 1
});

const router = require('../routes/admin-knowledge-sources');
const { answerPreviewErrorMessage } = router;

test('admin source API returns list and stats from the repository', async (t) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { username: 'tester', role: 'admin' };
    next();
  });
  app.use('/api/admin/knowledge-sources', router);

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const base = `http://127.0.0.1:${address.port}/api/admin/knowledge-sources`;
  const [sourcesResponse, statsResponse] = await Promise.all([
    fetch(`${base}/`),
    fetch(`${base}/stats`)
  ]);

  assert.equal(sourcesResponse.status, 200);
  assert.equal(statsResponse.status, 200);

  const sources = await sourcesResponse.json();
  const stats = await statsResponse.json();
  assert.equal(sources.sources[0].name, '配信ガイド');
  assert.equal(stats.total, 1);
  assert.equal(stats.addedThisMonth, 1);
});

test('admin answer preview returns the generated answer and its semantic sources', async (t) => {
  const originalPreview = ragService.generateKnowledgeOnlyResponsePreview;
  ragService.generateKnowledgeOnlyResponsePreview = async () => ({
    answer: '配信前に、必要な機材と提出物をご準備ください。',
    knowledgeResults: [{
      title: 'レッスン1',
      url: 'https://example.com/lesson-1',
      score: 0.82,
      answer: 'レッスン1開始前の準備です。',
      classification: 'レッスン',
      category: 'VTuberの基本',
      metadata: { lessonNumber: 1 }
    }]
  });
  t.after(() => {
    ragService.generateKnowledgeOnlyResponsePreview = originalPreview;
  });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { username: 'tester', role: 'admin' };
    next();
  });
  app.use('/api/admin/knowledge-sources', router);

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/knowledge-sources/actions/test-search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'レッスン1の準備は？' })
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.answer, '配信前に、必要な機材と提出物をご準備ください。');
  assert.equal(body.results[0].title, 'レッスン1');
  assert.equal(body.results[0].lessonNumber, 1);
  assert.equal(body.results[0].score, 0.82);
});

test('answer preview errors provide safe and actionable OpenAI guidance', () => {
  assert.equal(
    answerPreviewErrorMessage({ status: 401, message: 'Incorrect API key' }),
    'OpenAI APIの認証に失敗しました。RenderのOPENAI_API_KEYを確認してください。'
  );
  assert.equal(
    answerPreviewErrorMessage({ status: 429, message: 'quota exceeded' }),
    'OpenAI APIの利用上限に達しています。OpenAIの利用枠と請求設定を確認してください。'
  );
});
