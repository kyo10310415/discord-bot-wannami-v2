const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SKIP_APP_ENV_VALIDATION = 'true';
process.env.KNOWLEDGE_SOURCE_PROVIDER = 'spreadsheet';

const { knowledgeSourceProvider } = require('../services/knowledge-source-provider');
const { knowledgeBaseService } = require('../services/knowledge-base');

test('knowledge base accepts provider records and becomes searchable', async () => {
  knowledgeBaseService.reset();
  knowledgeBaseService.embeddingService = {
    isInitialized: true,
    initialize: () => true,
    createEmbeddings: async (texts) => texts.map(() => [1, 0])
  };
  knowledgeSourceProvider.listActiveSources = async () => [{
    id: 'source-1',
    fileName: '配信ガイド',
    url: 'https://example.com/guide',
    classification: 'レッスン',
    type: 'Web',
    category: '配信',
    goodBadExample: '',
    remarks: '初配信'
  }];
  knowledgeSourceProvider.markProcessing = async () => {};
  knowledgeSourceProvider.markReady = async () => {};
  knowledgeSourceProvider.markError = async () => {};
  knowledgeBaseService.loadContentFromUrl = async () => ({
    content: '初配信では、事前に音声と映像を確認します。',
    images: []
  });

  const documents = await knowledgeBaseService.buildKnowledgeBase();
  const status = knowledgeBaseService.getStatus();
  const results = await knowledgeBaseService.searchKnowledge('初配信');

  assert.equal(documents.length, 1);
  assert.equal(status.initialized, true);
  assert.equal(status.totalDocuments, 1);
  assert.equal(status.totalChunks, 1);
  assert.equal(results[0].title, '配信ガイド');
});

test('a provider outage keeps the last successful in-memory knowledge base', async () => {
  const previousDocuments = knowledgeBaseService.documents;
  const previousChunks = knowledgeBaseService.searchChunks;
  knowledgeSourceProvider.listActiveSources = async () => {
    throw new Error('database unavailable');
  };

  const result = await knowledgeBaseService.buildKnowledgeBase();
  assert.equal(result, null);
  assert.equal(knowledgeBaseService.documents, previousDocuments);
  assert.equal(knowledgeBaseService.searchChunks, previousChunks);
  assert.equal(knowledgeBaseService.documents.length, 1);
});
