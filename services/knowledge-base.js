// services/knowledge-base.js - 知識ベース構築サービス v2.7.0（クリーン版）

const { createHash } = require('crypto');
const { detectUrlType, loadGoogleSlides, loadGoogleDocs, loadTextFile, convertGoogleDriveUrl } = require('./google-apis');
const { knowledgeSourceProvider } = require('./knowledge-source-provider');
const { openAIService } = require('./openai-service');
const { OPENAI_MODELS, RAG_CONFIG } = require('../config/constants');
const {
  aggregateRankedChunks,
  cosineSimilarity,
  createDocumentChunks,
  extractLessonNumber,
  extractSourceLessonNumber,
  lexicalSimilarity,
  meaningfulTokens
} = require('./knowledge-retrieval');
const { loadNotionContent, loadWebsiteContent, loadImageUrlInfo } = require('../utils/content-loaders');
const logger = require('../utils/logger');

class KnowledgeBaseService {
  constructor() {
    this.documentImages = [];
    this.documents = [];
    this.searchChunks = [];
    this.lastBuildTime = null;
    this.isInitialized = false;
    this.embeddingService = openAIService;
    this.embeddingCache = new Map();
    this.indexVersion = 'semantic-v1';
  }

  async initialize() {
    try {
      console.log('📚 知識ベースサービス初期化開始...');
      
      const result = await this.buildKnowledgeBase();
      
      if (result) {
        this.isInitialized = true;
        logger.info('✅ 知識ベースサービス初期化完了');
        logger.info(`📊 初期化後の文書数: ${this.documents.length}`);
        
        return result;
      } else {
        console.log('⚠️ 知識ベース構築に失敗しましたが、サービスは初期化されました');
        this.isInitialized = true;
        return null;
      }
    } catch (error) {
      console.error('❌ 知識ベースサービス初期化エラー:', error.message);
      this.isInitialized = false;
      throw error;
    }
  }

  async buildKnowledgeBase() {
    try {
      console.log('📚 知識ベース構築開始...');
      
      const urlList = await knowledgeSourceProvider.listActiveSources();
      if (urlList.length === 0) {
        console.log('⚠️ 有効なナレッジソースが登録されていません');
        this.documentImages = [];
        this.documents = [];
        this.searchChunks = [];
        this.lastBuildTime = new Date().toISOString();
        this.isInitialized = true;
        return [];
      }

      console.log(`📄 ${urlList.length}件のコンテンツを読み込み開始`);

      const documents = [];
      const documentImages = [];
      const searchChunks = [];
      let totalImages = 0;

      for (const urlInfo of urlList) {
        console.log(`📖 読み込み中: ${urlInfo.fileName}`);
        
        try {
          await knowledgeSourceProvider.markProcessing(urlInfo);
          const result = await this.loadContentFromUrl(urlInfo);

          if (!result || typeof result.content !== 'string' || !result.content.trim()) {
            throw new Error('ソース本文を取得できませんでした');
          }
          
          const doc = {
            id: urlInfo.id || null,
            source: urlInfo.fileName,
            url: urlInfo.url,
            classification: urlInfo.classification || '',
            type: urlInfo.type || '',
            category: urlInfo.category || '',
            goodBadExample: urlInfo.goodBadExample || '',
            remarks: urlInfo.remarks || '',
            content: result.content,
            images: result.images || [],
            metadata: {
              classification: urlInfo.classification || '',
              type: urlInfo.type || '',
              category: urlInfo.category || '',
              goodBadExample: urlInfo.goodBadExample || '',
              remarks: urlInfo.remarks || ''
            }
          };

          documents.push(doc);

          const indexedChunks = await this._indexDocument(doc);
          searchChunks.push(...indexedChunks);

          await knowledgeSourceProvider.markReady(urlInfo, result.content.length);

          if (result.images && result.images.length > 0) {
            documentImages.push(...result.images);
            totalImages += result.images.length;
          }
        } catch (error) {
          console.error(`❌ ${urlInfo.fileName} 読み込み失敗:`, error.message);
          await knowledgeSourceProvider.markError(urlInfo, error);
        }
        
        await this.sleep(200);
      }

      this.documents = documents;
      this.documentImages = documentImages;
      this.searchChunks = searchChunks;
      this.lastBuildTime = new Date().toISOString();
      this.isInitialized = true;

      console.log(`✅ 知識ベース構築完了`);
      console.log(`📄 文書数: ${documents.length}`);
      console.log(`🧩 意味検索チャンク数: ${searchChunks.length}`);
      console.log(`🖼️ 総画像数: ${totalImages}`);
      console.log(`📊 総文字数: ${documents.reduce((sum, doc) => sum + doc.content.length, 0)}`);

      const classificationCounts = documents.reduce((acc, doc) => {
        const cls = doc.classification || '未分類';
        acc[cls] = (acc[cls] || 0) + 1;
        return acc;
      }, {});
      console.log('📊 分類別集計:', classificationCounts);

      return documents;

    } catch (error) {
      console.error('❌ 知識ベース構築エラー:', error);
      return null;
    }
  }

  async _indexDocument(document) {
    const chunks = createDocumentChunks(document, {
      maxSize: RAG_CONFIG.MAX_CHUNK_SIZE,
      overlap: RAG_CONFIG.CHUNK_OVERLAP
    });
    if (!chunks.length) return [];

    const contentHash = createHash('sha256').update(document.content, 'utf8').digest('hex');
    const cacheKey = {
      contentHash,
      embeddingModel: OPENAI_MODELS.EMBEDDING,
      indexVersion: this.indexVersion
    };
    const memoryCacheKey = `${document.id || document.url}:${contentHash}:${OPENAI_MODELS.EMBEDDING}:${this.indexVersion}`;

    const memoryCached = this.embeddingCache.get(memoryCacheKey);
    if (memoryCached?.length === chunks.length) {
      return this._mergeIndexedChunks(chunks, memoryCached);
    }

    try {
      const persistedChunks = await knowledgeSourceProvider.loadCachedChunks(document, cacheKey);
      if (persistedChunks.length === chunks.length && persistedChunks.every((chunk) => chunk.embedding.length > 0)) {
        this.embeddingCache.set(memoryCacheKey, persistedChunks);
        logger.info(`♻️ 埋め込みキャッシュ利用: ${document.source} (${persistedChunks.length}チャンク)`);
        return this._mergeIndexedChunks(chunks, persistedChunks);
      }
    } catch (error) {
      logger.warn(`埋め込みキャッシュ読込失敗 (${document.source}): ${error.message}`);
    }

    try {
      const embeddings = await this._createEmbeddingsInBatches(chunks.map((chunk) =>
        this._embeddingInput(document, chunk.content)));
      const indexedChunks = chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index]
      }));

      const cacheChunks = indexedChunks.map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: chunk.embedding
      }));
      this.embeddingCache.set(memoryCacheKey, cacheChunks);

      try {
        await knowledgeSourceProvider.saveCachedChunks(document, cacheKey, cacheChunks);
      } catch (error) {
        logger.warn(`埋め込みキャッシュ保存失敗 (${document.source}): ${error.message}`);
      }

      logger.info(`🧩 意味検索インデックス作成: ${document.source} (${indexedChunks.length}チャンク)`);
      return indexedChunks;
    } catch (error) {
      logger.warn(`意味検索インデックス作成失敗 (${document.source})。本文検索へフォールバック: ${error.message}`);
      return chunks.map((chunk) => ({ ...chunk, embedding: null }));
    }
  }

  _mergeIndexedChunks(chunks, cachedChunks) {
    const cachedByIndex = new Map(cachedChunks.map((chunk) => [chunk.chunkIndex, chunk]));
    return chunks.map((chunk) => ({
      ...chunk,
      embedding: cachedByIndex.get(chunk.chunkIndex)?.embedding || null
    }));
  }

  _embeddingInput(document, content) {
    return [
      `タイトル: ${document.source}`,
      document.classification ? `分類: ${document.classification}` : '',
      document.category ? `カテゴリ: ${document.category}` : '',
      document.remarks ? `備考: ${document.remarks}` : '',
      `本文:\n${content}`
    ].filter(Boolean).join('\n');
  }

  async _createEmbeddingsInBatches(texts) {
    if (!this.embeddingService.isInitialized && !this.embeddingService.initialize()) {
      throw new Error('OpenAI埋め込みサービスを初期化できませんでした');
    }

    const batchSize = Math.max(1, Number(process.env.EMBEDDING_BATCH_SIZE || 32));
    const embeddings = [];
    for (let start = 0; start < texts.length; start += batchSize) {
      const batch = texts.slice(start, start + batchSize);
      embeddings.push(...await this.embeddingService.createEmbeddings(batch));
    }
    return embeddings;
  }

  _tokenizeQuery(query) {
    return meaningfulTokens(query);
  }

  async searchKnowledge(query, options = {}) {
    try {
      const {
        maxResults = 5,
        minScore = RAG_CONFIG.SIMILARITY_THRESHOLD,
        topK = RAG_CONFIG.TOP_K_CHUNKS,
        includeMetadata = true,
        filters = {},
        lessonNumber: requestedLessonNumber = null
      } = options;

      logger.info(`🔍 全文意味検索: "${query}"`);
      logger.info(`📊 検索前の状態: 初期化=${this.isInitialized}, 文書数=${this.documents.length}, チャンク数=${this.searchChunks.length}`);

      if (!this.isInitialized || this.searchChunks.length === 0) {
        logger.warn('⚠️ 知識ベースが初期化されていないか、検索チャンクが空です');
        return [];
      }

      const parsedLessonNumber = Number(requestedLessonNumber);
      const lessonNumber = requestedLessonNumber === null || requestedLessonNumber === undefined
        ? extractLessonNumber(query)
        : (Number.isSafeInteger(parsedLessonNumber) && parsedLessonNumber >= 0 ? parsedLessonNumber : null);
      let candidateChunks = this.searchChunks.filter((chunk) => {
        if (filters.classification && chunk.classification !== filters.classification) return false;
        if (filters.goodBadExample && chunk.goodBadExample !== filters.goodBadExample) return false;
        if (filters.category && chunk.category !== filters.category) return false;
        if (filters.remarksKeyword && !chunk.remarks?.includes(filters.remarksKeyword)) return false;
        return true;
      });

      if (lessonNumber !== null) {
        candidateChunks = candidateChunks.filter((chunk) =>
          extractSourceLessonNumber(chunk) === lessonNumber);
        logger.info(`📚 レッスン番号の厳密フィルタ: レッスン${lessonNumber} (${candidateChunks.length}チャンク)`);
        if (candidateChunks.length === 0) {
          logger.warn(`⚠️ レッスン${lessonNumber}に一致するソースが見つからないため、他レッスンへはフォールバックしません`);
          return [];
        }
      }

      if (candidateChunks.length === 0) return [];

      let rankedChunks;
      const hasCompleteSemanticIndex = candidateChunks.every((chunk) =>
        Array.isArray(chunk.embedding) && chunk.embedding.length > 0);

      if (hasCompleteSemanticIndex) {
        try {
          const [queryEmbedding] = await this._createEmbeddingsInBatches([query]);
          rankedChunks = candidateChunks.map((chunk) => ({
            ...chunk,
            score: Math.max(0, Math.min(1, cosineSimilarity(queryEmbedding, chunk.embedding))),
            searchMode: 'semantic'
          }));
        } catch (error) {
          logger.warn(`意味検索に失敗したため本文検索へフォールバック: ${error.message}`);
        }
      }

      if (!rankedChunks) {
        rankedChunks = candidateChunks.map((chunk) => ({
          ...chunk,
          score: lexicalSimilarity(`${chunk.source}\n${chunk.content}`, query),
          searchMode: 'lexical-fallback'
        }));
      }

      rankedChunks.sort((left, right) => right.score - left.score);
      const effectiveMinScore = lessonNumber !== null ? 0 : minScore;
      const selectedChunks = rankedChunks
        .filter((chunk) => chunk.score >= effectiveMinScore)
        .slice(0, Math.max(topK, maxResults));

      const results = aggregateRankedChunks(selectedChunks, {
        maxResults,
        maxChunksPerSource: 3,
        includeMetadata
      });

      logger.info(`✅ 全文検索完了: ${results.length}ソース (${selectedChunks.length}チャンク、方式=${rankedChunks[0]?.searchMode || 'none'})`);
      results.forEach((result, index) => {
        logger.info(`  ${index + 1}. ${result.source} - 関連度:${(result.score * 100).toFixed(1)}%`);
      });
      return results;
    } catch (error) {
      logger.error('❌ 知識ベース検索エラー:', error);
      return [];
    }
  }

  _extractRelevantContent(content, keywords) {
    const maxLength = 2000;
    const contentLower = content.toLowerCase();

    let firstMatchIndex = -1;
    for (const keyword of keywords) {
      const index = contentLower.indexOf(keyword.toLowerCase());
      if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
        firstMatchIndex = index;
      }
    }

    if (firstMatchIndex !== -1) {
      const start = Math.max(0, firstMatchIndex - 100);
      const end = Math.min(content.length, firstMatchIndex + maxLength - 100);
      const excerpt = content.substring(start, end);
      
      return (start > 0 ? '...' : '') + excerpt + (end < content.length ? '...' : '');
    }

    return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
  }

  async loadContentFromUrl(urlInfo) {
    const { url, fileName, category, type } = urlInfo;
    
    let detectedType = detectUrlType(url);
    
    console.log(`📖 コンテンツ読み込み開始: ${fileName}`);
    console.log(`🔍 登録された資料タイプ: "${type}" → 自動検出: "${detectedType}"`);
    
    // スプレッドシートのD列（type）が "テキスト" の場合、Google Driveをテキストファイルとして扱う
    if (detectedType === 'google_drive_file') {
      const typeLower = (type || '').toLowerCase();
      
      if (typeLower.includes('テキスト') || typeLower.includes('text') || typeLower.includes('txt')) {
        console.log(`📝 Google Driveファイルをテキストとして処理: ${fileName}`);
        detectedType = 'text_file';
        
        // Google Drive URLをダウンロードURLに変換
        const downloadUrl = convertGoogleDriveUrl(url);
        urlInfo.url = downloadUrl;
        
        console.log(`✅ ダウンロードURL変換完了`);
      } else {
        console.log(`⚠️ Google Driveファイルですが、種類が不明です`);
        console.log(`💡 ヒント: スプレッドシートのD列に "テキスト" を指定してください`);
      }
    }
    
    try {
      switch (detectedType) {
        case 'google_slides':
          console.log(`📊 Google Slides読み込み: ${fileName}`);
          return await loadGoogleSlides(url, fileName);
          
        case 'google_docs':
          console.log(`📄 Google Docs読み込み: ${fileName}`);
          return await loadGoogleDocs(url, fileName);
          
        case 'notion':
          console.log(`📝 Notion読み込み: ${fileName}`);
          const notionContent = await loadNotionContent(url, fileName);
          
          // 🔍 Notionコンテンツの詳細ログ（Q&Aなど重要なページ）
          if (fileName && (fileName.includes('Q&A') || fileName.includes('Q＆A'))) {
            console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`🔍 Notionページ詳細: ${fileName}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📏 コンテンツ文字数:', notionContent.length);
            console.log('📝 コンテンツの最初の1000文字:\n', notionContent.substring(0, 1000));
            console.log('...');
            if (notionContent.length > 1000) {
              console.log('📝 コンテンツの最後の500文字:\n', notionContent.substring(notionContent.length - 500));
            }
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          }
          
          return { content: notionContent, images: this.extractImagesFromNotionContent(notionContent, fileName) };
          
        case 'text_file':
          console.log(`📝 テキストファイル読み込み: ${fileName}`);
          const textResult = await loadTextFile(urlInfo.url, fileName);
          return textResult;
          
        case 'image':
          console.log(`🖼️ 画像読み込み: ${fileName}`);
          const imageContent = await loadImageUrlInfo(url, fileName);
          return { content: imageContent, images: this.extractDirectImageInfo(url, fileName) };
          
        case 'google_drive_file':
          console.log(`📁 Google Driveファイル読み込み（種類不明）: ${fileName}`);
          console.log(`⚠️ スプレッドシートのD列に "テキスト" などの種類を指定してください`);
          return { 
            content: `${fileName}: Google Driveファイルですが、種類が不明です。スプレッドシートのD列（種類）に "テキスト" を指定してください。`,
            images: [] 
          };
          
        case 'website':
          console.log(`🌐 ウェブサイト読み込み: ${fileName}`);
          const websiteContent = await loadWebsiteContent(url, fileName);
          return { content: websiteContent, images: this.extractImagesFromWebContent(websiteContent, fileName) };
          
        default:
          console.log(`❓ 未対応のURL形式: ${fileName}`);
          return { 
            content: `${fileName}: 未対応のURL形式 - ${url}`,
            images: [] 
          };
      }
    } catch (error) {
      console.error(`❌ コンテンツ読み込み失敗 ${fileName}:`, error.message);
      throw error;
    }
  }

  extractImagesFromNotionContent(content, fileName) {
    const images = [];
    const imageMatches = content.match(/\[🖼️ 画像: ([^\]]+)\]/g);
    
    if (imageMatches) {
      imageMatches.forEach((match, index) => {
        images.push({
          source: 'notion',
          fileName: fileName,
          position: index + 1,
          description: match.replace(/\[🖼️ 画像: ([^\]]+)\]/, '$1'),
          type: 'embedded_image'
        });
      });
    }
    
    return images;
  }

  extractDirectImageInfo(url, fileName) {
    return [{
      source: 'direct_url',
      fileName: fileName,
      url: url,
      description: `${fileName} - 直接画像URL`,
      type: 'direct_image'
    }];
  }

  extractImagesFromWebContent(content, fileName) {
    const images = [];
    const imageMatches = content.match(/\[🖼️ 画像: ([^\]]+)\]/g);
    
    if (imageMatches) {
      imageMatches.forEach((match, index) => {
        images.push({
          source: 'website',
          fileName: fileName,
          position: index + 1,
          description: match.replace(/\[🖼️ 画像: ([^\]]+)\]/, '$1'),
          type: 'embedded_image'
        });
      });
    }
    
    return images;
  }

  getDocumentImages() {
    return this.documentImages;
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      totalDocuments: this.documents.length,
      totalChunks: this.searchChunks.length,
      totalDocumentImages: this.documentImages.length,
      searchMode: 'semantic-full-text',
      sourceProvider: knowledgeSourceProvider.getName(),
      lastBuildTime: this.lastBuildTime,
      imagesBySource: this.documentImages.reduce((acc, img) => {
        acc[img.source] = (acc[img.source] || 0) + 1;
        return acc;
      }, {})
    };
  }

  getStats() {
    return {
      totalDocuments: this.documents.length,
      totalChunks: this.searchChunks.length,
      totalDocumentImages: this.documentImages.length,
      searchMode: 'semantic-full-text',
      sourceProvider: knowledgeSourceProvider.getName(),
      lastBuildTime: this.lastBuildTime,
      imagesBySource: this.documentImages.reduce((acc, img) => {
        acc[img.source] = (acc[img.source] || 0) + 1;
        return acc;
      }, {})
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  reset() {
    this.documents = [];
    this.documentImages = [];
    this.searchChunks = [];
    this.lastBuildTime = null;
    this.isInitialized = false;
    console.log('🔄 知識ベースサービスリセット完了');
  }
}

const knowledgeBaseService = new KnowledgeBaseService();

module.exports = {
  knowledgeBaseService,
  buildKnowledgeBase: () => knowledgeBaseService.buildKnowledgeBase(),
  initialize: () => knowledgeBaseService.initialize(),
  initializeKnowledgeBase: () => knowledgeBaseService.initialize(),
  searchKnowledge: (query, options) => knowledgeBaseService.searchKnowledge(query, options),
  getDocumentImages: () => knowledgeBaseService.getDocumentImages(),
  getStats: () => knowledgeBaseService.getStats(),
  getStatus: () => knowledgeBaseService.getStatus(),
  reset: () => knowledgeBaseService.reset(),
  default: knowledgeBaseService
};
