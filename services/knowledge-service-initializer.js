const { initializeServices } = require('./google-apis');
const { knowledgeSourceProvider } = require('./knowledge-source-provider');
const knowledgeBase = require('./knowledge-base');
const { initializeRAG } = require('./rag-system');
const logger = require('../utils/logger');

class KnowledgeServiceInitializer {
  constructor({
    sourceProvider = knowledgeSourceProvider,
    initializeGoogle = initializeServices,
    initializeKnowledgeBase = knowledgeBase.initialize,
    initializeRag = initializeRAG,
    serviceLogger = logger
  } = {}) {
    this.sourceProvider = sourceProvider;
    this.initializeGoogle = initializeGoogle;
    this.initializeKnowledgeBase = initializeKnowledgeBase;
    this.initializeRag = initializeRag;
    this.logger = serviceLogger;
    this.initialized = false;
    this.initializationPromise = null;
    this.googleReady = false;
  }

  async initialize() {
    if (this.initialized) return this.getStatus();
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this._initialize().catch((error) => {
      this.initializationPromise = null;
      throw error;
    });
    return this.initializationPromise;
  }

  async _initialize() {
    this.logger.info('📚 Web/Discord共通知識サービス初期化開始...');
    await this.sourceProvider.initialize();

    try {
      await this.initializeGoogle();
      this.googleReady = true;
    } catch (error) {
      this.googleReady = false;
      this.logger.warn(`Google APIs初期化失敗。取得可能なソースだけで続行します: ${error.message}`);
    }

    await this.initializeKnowledgeBase();
    await this.initializeRag();
    this.initialized = true;
    this.logger.success('📚 Web/Discord共通知識サービス初期化完了');
    return this.getStatus();
  }

  getStatus() {
    return {
      initialized: this.initialized,
      initializing: Boolean(this.initializationPromise) && !this.initialized,
      googleReady: this.googleReady
    };
  }
}

const knowledgeServiceInitializer = new KnowledgeServiceInitializer();

module.exports = {
  KnowledgeServiceInitializer,
  knowledgeServiceInitializer,
  initializeKnowledgeServices: () => knowledgeServiceInitializer.initialize()
};
