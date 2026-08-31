const test = require('node:test');
const assert = require('node:assert/strict');

const { getAIResponseStatus, isAIResponseFailure } = require('../utils/ai-response-status');

test('knowledge-base API fallback is logged as a failure', () => {
  const response = '申し訳ございません。現在知識ベースにアクセスできません。しばらく待ってから再度お試しください。';

  assert.equal(isAIResponseFailure(response), true);
  assert.equal(getAIResponseStatus(response), '失敗');
});

test('payment footer does not hide an AI generation failure', () => {
  const response = `申し訳ございません。現在知識ベースにアクセスできません。しばらく待ってから再度お試しください。

この回答で解決できなかった場合は下記フォームよりご相談ください。
https://example.com/form`;

  assert.equal(getAIResponseStatus(response), '失敗');
});

test('mission API fallback is logged as a failure', () => {
  const response = '申し訳ございません。現在ミッション評価システムにアクセスできません。しばらく待ってから再度お試しください。';

  assert.equal(getAIResponseStatus(response), '失敗');
});

test('valid and no-information answers remain successful', () => {
  assert.equal(getAIResponseStatus('レッスン1では配信活動の基礎を学びます。'), '成功');
  assert.equal(getAIResponseStatus('知識ベースに情報が見つかりませんでした。'), '成功');
});

test('empty or non-string responses are failures', () => {
  assert.equal(getAIResponseStatus(''), '失敗');
  assert.equal(getAIResponseStatus(null), '失敗');
});
