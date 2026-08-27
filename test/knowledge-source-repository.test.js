const test = require('node:test');
const assert = require('node:assert/strict');
const { KnowledgeSourceRepository, mapRow } = require('../services/knowledge-source-repository');

function sampleRow(overrides = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: '配信ガイド',
    source_url: 'https://example.com/guide',
    classification: 'レッスン',
    document_type: 'Web',
    category: '配信',
    example_type: '',
    remarks: '初配信',
    is_active: true,
    sync_status: 'ready',
    content_char_count: 1200,
    ...overrides
  };
}

test('mapRow exposes database fields to the admin API shape', () => {
  const mapped = mapRow(sampleRow());
  assert.equal(mapped.name, '配信ガイド');
  assert.equal(mapped.url, 'https://example.com/guide');
  assert.equal(mapped.documentType, 'Web');
  assert.equal(mapped.syncStatus, 'ready');
});

test('listActiveForKnowledgeBase preserves the existing RAG source shape', async () => {
  const db = { query: async () => ({ rows: [sampleRow()] }) };
  const repository = new KnowledgeSourceRepository(db);
  const [source] = await repository.listActiveForKnowledgeBase();
  assert.deepEqual(source, {
    id: '550e8400-e29b-41d4-a716-446655440000',
    fileName: '配信ガイド',
    url: 'https://example.com/guide',
    classification: 'レッスン',
    type: 'Web',
    category: '配信',
    goodBadExample: '',
    remarks: '初配信'
  });
});

test('disabling a source stores the disabled sync state', async () => {
  let capturedSql = '';
  const db = {
    query: async (sql) => {
      capturedSql = sql;
      return { rows: [sampleRow({ is_active: false, sync_status: 'disabled' })] };
    }
  };
  const repository = new KnowledgeSourceRepository(db);
  const source = await repository.update(sampleRow().id, { isActive: false }, 'tester');
  assert.match(capturedSql, /sync_status = 'disabled'/);
  assert.equal(source.syncStatus, 'disabled');
});
