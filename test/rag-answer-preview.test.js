const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SKIP_APP_ENV_VALIDATION = 'true';

const { ragSystem } = require('../services/rag-system');
const { openAIService } = require('../services/openai-service');

test('answer preview adds retrieval details without changing the normal response contract', async () => {
  const normalResponse = await ragSystem.generateKnowledgeOnlyResponse('こんにちは');
  const previewResponse = await ragSystem.generateKnowledgeOnlyResponsePreview('こんにちは');

  assert.equal(typeof normalResponse, 'string');
  assert.equal(previewResponse.answer, normalResponse);
  assert.deepEqual(previewResponse.knowledgeResults, []);
});

test('answer preview returns the exact sources passed to answer generation', async (t) => {
  const originalSearch = ragSystem._searchKnowledge;
  const originalGenerate = openAIService.generateAIResponse;
  const knowledgeResults = [{
    title: 'レッスン1',
    url: 'https://example.com/lesson-1',
    score: 0.91,
    answer: '開始前に必要な準備を済ませます。'
  }];

  ragSystem._searchKnowledge = async () => knowledgeResults;
  openAIService.generateAIResponse = async () => 'レッスン1の開始前に、必要な準備を済ませてください。';
  t.after(() => {
    ragSystem._searchKnowledge = originalSearch;
    openAIService.generateAIResponse = originalGenerate;
  });

  const previewResponse = await ragSystem.generateKnowledgeOnlyResponsePreview('レッスン1の準備は？');

  assert.equal(previewResponse.answer, 'レッスン1の開始前に、必要な準備を済ませてください。');
  assert.equal(previewResponse.knowledgeResults, knowledgeResults);
});

test('answer preview surfaces generation errors while Discord keeps its fallback response', async (t) => {
  const originalSearch = ragSystem._searchKnowledge;
  ragSystem._searchKnowledge = async () => {
    throw Object.assign(new Error('quota exceeded'), { status: 429 });
  };
  t.after(() => {
    ragSystem._searchKnowledge = originalSearch;
  });

  await assert.rejects(
    ragSystem.generateKnowledgeOnlyResponsePreview('配信準備は？'),
    (error) => error.status === 429
  );
  assert.equal(
    await ragSystem.generateKnowledgeOnlyResponse('配信準備は？'),
    '申し訳ございません。現在知識ベースにアクセスできません。しばらく待ってから再度お試しください。'
  );
});
