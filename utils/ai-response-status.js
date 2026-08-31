const AI_RESPONSE_FAILURES = Object.freeze({
  KNOWLEDGE_UNAVAILABLE: '申し訳ございません。現在知識ベースにアクセスできません。しばらく待ってから再度お試しください。',
  MISSION_UNAVAILABLE: '申し訳ございません。現在ミッション評価システムにアクセスできません。しばらく待ってから再度お試しください。'
});

function isAIResponseFailure(response) {
  if (typeof response !== 'string') return true;
  const normalizedResponse = response.trim();
  if (!normalizedResponse) return true;
  return Object.values(AI_RESPONSE_FAILURES).some((marker) => normalizedResponse.includes(marker));
}

function getAIResponseStatus(response) {
  return isAIResponseFailure(response) ? '失敗' : '成功';
}

module.exports = {
  AI_RESPONSE_FAILURES,
  isAIResponseFailure,
  getAIResponseStatus
};
