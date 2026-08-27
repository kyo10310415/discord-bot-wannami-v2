const express = require('express');
const { runMigrations } = require('../db/migrate');
const { knowledgeSourceRepository } = require('../services/knowledge-source-repository');
const { importKnowledgeSourcesFromSpreadsheet } = require('../services/knowledge-source-importer');
const { requestKnowledgeRefresh, getRefreshState } = require('../services/knowledge-refresh-queue');
const ragService = require('../services/rag-system');
const { validateSourceInput, isUuid } = require('../utils/source-validation');
const logger = require('../utils/logger');

const router = express.Router();

function isValidationError(error) {
  return ['必須', 'URL', '文字以内', '真偽値'].some((message) => error.message?.includes(message));
}

router.use(async (req, res, next) => {
  try {
    await runMigrations();
    next();
  } catch (error) {
    logger.errorDetail('管理画面DB初期化エラー:', error);
    res.status(503).json({ error: 'データベースへ接続できません' });
  }
});

router.get('/', async (req, res, next) => {
  try {
    const sources = await knowledgeSourceRepository.list({
      query: String(req.query.q || '').slice(0, 200),
      status: String(req.query.status || 'all'),
      active: req.query.active ?? 'all'
    });
    res.json({ sources, refresh: getRefreshState() });
  } catch (error) {
    next(error);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    const stats = await knowledgeSourceRepository.getStats();
    res.json({ ...stats, refresh: getRefreshState() });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = validateSourceInput(req.body || {});
    const source = await knowledgeSourceRepository.create(input, req.user.username);
    requestKnowledgeRefresh();
    res.status(201).json({ source, refreshQueued: true });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'このURLはすでに登録されています' });
    }
    if (isValidationError(error)) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'ソースIDが不正です' });
  try {
    const input = validateSourceInput(req.body || {}, { partial: true });
    const source = await knowledgeSourceRepository.update(req.params.id, input, req.user.username);
    if (!source) return res.status(404).json({ error: 'ソースが見つかりません' });
    requestKnowledgeRefresh();
    res.json({ source, refreshQueued: true });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'このURLはすでに登録されています' });
    }
    if (isValidationError(error)) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'ソースIDが不正です' });
  try {
    const source = await knowledgeSourceRepository.remove(req.params.id);
    if (!source) return res.status(404).json({ error: 'ソースが見つかりません' });
    requestKnowledgeRefresh();
    res.json({ deleted: true, source, refreshQueued: true });
  } catch (error) {
    next(error);
  }
});

router.post('/actions/refresh', async (req, res, next) => {
  try {
    const documents = await requestKnowledgeRefresh();
    res.json({
      success: true,
      documentCount: Array.isArray(documents) ? documents.length : 0,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

router.post('/actions/import-spreadsheet', async (req, res, next) => {
  try {
    const summary = await importKnowledgeSourcesFromSpreadsheet({
      spreadsheetId: req.body?.spreadsheetId,
      actor: req.user.username
    });
    requestKnowledgeRefresh();
    res.json({ success: true, summary, refreshQueued: true });
  } catch (error) {
    next(error);
  }
});

router.post('/actions/test-search', async (req, res, next) => {
  try {
    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ error: '質問を入力してください' });
    if (query.length > 500) return res.status(400).json({ error: '質問は500文字以内で入力してください' });

    const preview = await ragService.generateKnowledgeOnlyResponsePreview(query);
    res.json({
      query,
      answer: preview.answer,
      results: preview.knowledgeResults.map((item) => ({
        title: item.title || item.source,
        url: item.url,
        score: item.score,
        preview: item.answer || String(item.content || '').slice(0, 500),
        classification: item.classification || '',
        category: item.category || '',
        lessonNumber: item.metadata?.lessonNumber ?? null
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.use((error, req, res, next) => {
  logger.errorDetail('ナレッジソース管理APIエラー:', error);
  res.status(500).json({ error: '管理APIでエラーが発生しました' });
});

module.exports = router;
