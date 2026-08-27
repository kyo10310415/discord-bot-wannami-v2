const knowledgeBase = require('./knowledge-base');
const logger = require('../utils/logger');

let refreshPromise = null;
let refreshRequested = false;

function requestKnowledgeRefresh() {
  refreshRequested = true;
  if (refreshPromise) return refreshPromise;

  refreshPromise = new Promise((resolve) => setImmediate(resolve))
    .then(async () => {
      let result = null;
      while (refreshRequested) {
        refreshRequested = false;
        result = await knowledgeBase.buildKnowledgeBase();
      }
      return result;
    })
    .catch((error) => {
      logger.errorDetail('知識ベース非同期更新エラー:', error);
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  refreshPromise.catch(() => {});
  return refreshPromise;
}

function getRefreshState() {
  return {
    running: Boolean(refreshPromise),
    queued: refreshRequested
  };
}

module.exports = { requestKnowledgeRefresh, getRefreshState };
