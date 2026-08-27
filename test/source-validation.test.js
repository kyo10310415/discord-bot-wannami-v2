const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSourceInput, validateSourceUrl, isUuid } = require('../utils/source-validation');

test('validateSourceInput normalizes a valid knowledge source', () => {
  const result = validateSourceInput({
    name: '  配信ガイド  ',
    url: 'https://example.com/guide#section',
    classification: ' レッスン ',
    isActive: true
  });

  assert.equal(result.name, '配信ガイド');
  assert.equal(result.url, 'https://example.com/guide');
  assert.equal(result.classification, 'レッスン');
  assert.equal(result.isActive, true);
});

test('validateSourceUrl rejects local and credential-bearing URLs', () => {
  assert.throws(() => validateSourceUrl('http://127.0.0.1/admin'), /ローカルネットワーク/);
  assert.throws(() => validateSourceUrl('http://[::1]/admin'), /ローカルネットワーク/);
  assert.throws(() => validateSourceUrl('https://user:pass@example.com/'), /認証情報/);
  assert.throws(() => validateSourceUrl('file:///etc/passwd'), /HTTP/);
});

test('validateSourceInput supports partial updates', () => {
  assert.deepEqual(validateSourceInput({ isActive: false }, { partial: true }), { isActive: false });
  assert.throws(
    () => validateSourceInput({ isActive: 'false' }, { partial: true }),
    /真偽値/
  );
});

test('isUuid accepts v4 ids and rejects invalid ids', () => {
  assert.equal(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isUuid('../sources'), false);
});
