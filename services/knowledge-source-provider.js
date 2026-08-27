const { KNOWLEDGE_SPREADSHEET_ID } = require('../config/constants');
const { isDatabaseConfigured, checkDatabaseConnection } = require('../db/pool');
const { runMigrations } = require('../db/migrate');
const { knowledgeSourceRepository } = require('./knowledge-source-repository');
const { googleAPIsService } = require('./google-apis');
const logger = require('../utils/logger');

class KnowledgeSourceProvider {
  constructor() {
    this.initialized = false;
  }

  getName() {
    const configured = String(process.env.KNOWLEDGE_SOURCE_PROVIDER || '').toLowerCase();
    if (configured) return configured;
    return isDatabaseConfigured() ? 'database' : 'spreadsheet';
  }

  isDatabase() {
    return this.getName() === 'database';
  }

  async initialize() {
    if (this.initialized) return;

    if (!['database', 'spreadsheet'].includes(this.getName())) {
      throw new Error('KNOWLEDGE_SOURCE_PROVIDERはdatabaseまたはspreadsheetを指定してください');
    }

    if (this.isDatabase()) {
      if (!isDatabaseConfigured()) {
        throw new Error('KNOWLEDGE_SOURCE_PROVIDER=database ですが DATABASE_URL が未設定です');
      }
      await checkDatabaseConnection();
      await runMigrations();
      logger.info('✅ PostgreSQLナレッジソースを初期化しました');
    } else {
      logger.warn('⚠️ ナレッジソースはスプレッドシート互換モードです');
    }

    this.initialized = true;
  }

  async listActiveSources() {
    await this.initialize();

    if (this.isDatabase()) {
      return knowledgeSourceRepository.listActiveForKnowledgeBase();
    }

    const spreadsheetId = process.env.KNOWLEDGE_BASE_SPREADSHEET_ID ||
      process.env.KNOWLEDGE_SPREADSHEET_ID ||
      KNOWLEDGE_SPREADSHEET_ID;
    return googleAPIsService.loadUrlListFromSpreadsheet(spreadsheetId);
  }

  async markProcessing(source) {
    if (this.isDatabase() && source.id) {
      try {
        await knowledgeSourceRepository.markProcessing(source.id);
      } catch (error) {
        logger.warn(`ソース状態更新失敗 (${source.fileName}): ${error.message}`);
      }
    }
  }

  async markReady(source, contentCharCount) {
    if (this.isDatabase() && source.id) {
      try {
        await knowledgeSourceRepository.markReady(source.id, contentCharCount);
      } catch (error) {
        logger.warn(`ソース完了状態の保存失敗 (${source.fileName}): ${error.message}`);
      }
    }
  }

  async markError(source, error) {
    if (this.isDatabase() && source.id) {
      try {
        await knowledgeSourceRepository.markError(source.id, error?.message || error);
      } catch (statusError) {
        logger.warn(`ソースエラー状態の保存失敗 (${source.fileName}): ${statusError.message}`);
      }
    }
  }
}

const knowledgeSourceProvider = new KnowledgeSourceProvider();

module.exports = {
  KnowledgeSourceProvider,
  knowledgeSourceProvider
};
