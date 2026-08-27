const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SKIP_APP_ENV_VALIDATION = 'true';
process.env.KNOWLEDGE_SOURCE_PROVIDER = 'spreadsheet';

const {
  cosineSimilarity,
  extractLessonNumber,
  meaningfulTokens,
  splitTextIntoChunks
} = require('../services/knowledge-retrieval');
const { knowledgeBaseService } = require('../services/knowledge-base');

function searchChunk({ source, content, embedding, chunkIndex = 0 }) {
  return {
    sourceId: source,
    source,
    title: source,
    url: `https://example.com/${encodeURIComponent(source)}`,
    classification: 'レッスン',
    category: 'VTuberの基本',
    type: 'Google Docs',
    goodBadExample: '',
    remarks: '',
    metadata: { classification: 'レッスン' },
    chunkIndex,
    content,
    embedding
  };
}

test('lesson number extraction distinguishes lesson 1 from 10, 11 and 23', () => {
  assert.equal(extractLessonNumber('レッスン1の準備'), 1);
  assert.equal(extractLessonNumber('レッスン１０の準備'), 10);
  assert.equal(extractLessonNumber('Lesson 01 guide'), 1);
  assert.notEqual(extractLessonNumber('レッスン23の準備'), 1);
});

test('tokenizer excludes one-character katakana and a standalone lesson number', () => {
  const tokens = meaningfulTokens('レッスン1が始まるまでにしておいた方がいい準備はありますか？');
  assert.deepEqual(tokens.includes('レ'), false);
  assert.deepEqual(tokens.includes('1'), false);
  assert.deepEqual(tokens.includes('レッスン'), true);
  assert.deepEqual(tokens.includes('準備'), true);
});

test('chunking covers the full source instead of only its beginning', () => {
  const content = `${'A'.repeat(900)}。\n\n${'B'.repeat(900)}。\n\n${'C'.repeat(900)}。`;
  const chunks = splitTextIntoChunks(content, { maxSize: 1000, overlap: 100 });
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.some((chunk) => chunk.includes('C'.repeat(100))));
  assert.ok(chunks.every((chunk) => chunk.length <= 1000));
});

test('cosine similarity returns a normalized semantic score', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('lesson query strictly returns only the same lesson source', async () => {
  knowledgeBaseService.reset();
  knowledgeBaseService.isInitialized = true;
  knowledgeBaseService.documents = [{ source: 'レッスン1' }, { source: 'レッスン10' }, { source: 'レッスン23' }];
  knowledgeBaseService.searchChunks = [
    searchChunk({ source: 'レッスン1', content: '開始前にプロフィールと配信環境を準備します。', embedding: [1, 0] }),
    searchChunk({ source: 'レッスン10', content: '配信準備について説明します。', embedding: [1, 0] }),
    searchChunk({ source: 'レッスン23', content: 'ファンクラブの準備と1クリック登録。', embedding: [1, 0] })
  ];
  knowledgeBaseService.embeddingService = {
    isInitialized: true,
    initialize: () => true,
    createEmbeddings: async () => [[1, 0]]
  };

  const results = await knowledgeBaseService.searchKnowledge(
    'レッスン1が始まるまでにしておいた方がいい準備はありますか？'
  );

  assert.deepEqual(results.map((result) => result.source), ['レッスン1']);
  assert.equal(results[0].metadata.lessonNumber, 1);
});

test('lesson query does not fall back to another lesson when the exact source is absent', async () => {
  knowledgeBaseService.reset();
  knowledgeBaseService.isInitialized = true;
  knowledgeBaseService.documents = [{ source: 'レッスン23' }];
  knowledgeBaseService.searchChunks = [
    searchChunk({ source: 'レッスン23', content: 'ファンクラブの準備。', embedding: [1, 0] })
  ];

  const results = await knowledgeBaseService.searchKnowledge('レッスン1の準備を教えて');
  assert.deepEqual(results, []);
});

test('semantic search selects relevant body content even when the title has no keyword match', async () => {
  knowledgeBaseService.reset();
  knowledgeBaseService.isInitialized = true;
  knowledgeBaseService.documents = [{ source: '資料A' }, { source: '資料B' }];
  knowledgeBaseService.searchChunks = [
    searchChunk({ source: '資料A', content: '音声と映像を事前確認します。', embedding: [1, 0] }),
    searchChunk({ source: '資料B', content: '契約更新の説明です。', embedding: [0, 1] })
  ];
  knowledgeBaseService.embeddingService = {
    isInitialized: true,
    initialize: () => true,
    createEmbeddings: async () => [[1, 0]]
  };

  const results = await knowledgeBaseService.searchKnowledge('初配信前には何を確認すればいい？', {
    minScore: 0.3
  });

  assert.equal(results[0].source, '資料A');
  assert.equal(results[0].score, 1);
});

test('semantic search can retrieve a relevant passage from the end of a source', async () => {
  knowledgeBaseService.reset();
  knowledgeBaseService.isInitialized = true;
  knowledgeBaseService.documents = [{ source: '配信ガイド全文' }];
  knowledgeBaseService.searchChunks = [
    searchChunk({
      source: '配信ガイド全文',
      chunkIndex: 0,
      content: '冒頭ではスクールの概要を説明します。',
      embedding: [0, 1]
    }),
    searchChunk({
      source: '配信ガイド全文',
      chunkIndex: 8,
      content: '後半では初配信前の音声テストと映像確認を説明します。',
      embedding: [1, 0]
    })
  ];
  knowledgeBaseService.embeddingService = {
    isInitialized: true,
    initialize: () => true,
    createEmbeddings: async () => [[1, 0]]
  };

  const results = await knowledgeBaseService.searchKnowledge('初配信前の確認事項は？', {
    minScore: 0.3
  });

  assert.match(results[0].answer, /後半では初配信前/);
  assert.doesNotMatch(results[0].answer, /スクールの概要/);
  assert.deepEqual(results[0].metadata.chunkIndexes, [8]);
});
