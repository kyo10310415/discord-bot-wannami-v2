const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SKIP_APP_ENV_VALIDATION = 'true';

const {
  KnowledgeChunkRepository,
  parseEmbedding
} = require('../services/knowledge-chunk-repository');

test('parseEmbedding supports PostgreSQL JSON values', () => {
  assert.deepEqual(parseEmbedding([0.1, 0.2]), [0.1, 0.2]);
  assert.deepEqual(parseEmbedding('[0.3,0.4]'), [0.3, 0.4]);
  assert.deepEqual(parseEmbedding('invalid'), []);
});

test('listCached maps persisted chunks in document order', async () => {
  const calls = [];
  const repository = new KnowledgeChunkRepository({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return {
        rows: [{ chunk_index: 0, content: '本文', embedding: [1, 0] }]
      };
    }
  });

  const chunks = await repository.listCached({
    sourceId: 'source-1',
    contentHash: 'a'.repeat(64),
    embeddingModel: 'embedding-model',
    indexVersion: 'semantic-v1'
  });

  assert.deepEqual(chunks, [{ chunkIndex: 0, content: '本文', embedding: [1, 0] }]);
  assert.deepEqual(calls[0].params, [
    'source-1',
    'a'.repeat(64),
    'embedding-model',
    'semantic-v1'
  ]);
});

test('replaceForSource clears stale chunks and writes the new semantic index', async () => {
  const queries = [];
  const repository = new KnowledgeChunkRepository({
    withTransaction: async (callback) => callback({
      query: async (sql, params) => {
        queries.push({ sql, params });
        return { rows: [] };
      }
    })
  });

  await repository.replaceForSource({
    sourceId: 'source-1',
    contentHash: 'b'.repeat(64),
    embeddingModel: 'embedding-model',
    indexVersion: 'semantic-v1',
    chunks: [{ chunkIndex: 0, content: '全文の一部', embedding: [0.5, 0.5] }]
  });

  assert.match(queries[0].sql, /DELETE FROM knowledge_source_chunks/);
  assert.match(queries[1].sql, /INSERT INTO knowledge_source_chunks/);
  assert.equal(queries[1].params[1], 'source-1');
  assert.equal(queries[1].params[7], '[0.5,0.5]');
});
