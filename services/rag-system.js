// services/rag-system.js - RAGシステム（知識ベース限定回答対応版）

const openaiService = require('./openai-service');
const { RAG_CONFIG } = require('../config/constants');
const promptTemplates = require('../ai/prompt-templates');

class RAGSystem {
  constructor() {
    this.knowledgeBase = [];
    this.embeddings = [];
    this.isInitialized = false;
    this.lastUpdateTime = null;
  }

  // 🆕 追加: 初期化メソッド（index.jsとの互換性のため）
  async initialize() {
    try {
      console.log('🤖 RAGシステム初期化開始...');
      
      // 基本的な初期化処理
      this.isInitialized = true;
      this.lastUpdateTime = new Date();
      
      console.log('✅ RAGシステム初期化完了');
      console.log('ℹ️ 知識ベースの構築は initializeKnowledgeBase() で別途実行してください');
      
      return true;
    } catch (error) {
      console.error('❌ RAGシステム初期化エラー:', error.message);
      this.isInitialized = false;
      throw error;
    }
  }

  // 知識ベースの初期化
  async initializeKnowledgeBase(documents) {
    try {
      console.log('📚 RAG知識ベース初期化開始...');
      
      // 1. 文書をチャンクに分割
      this.knowledgeBase = this.chunkDocuments(documents);
      console.log(`📄 ${this.knowledgeBase.length}個のチャンクを作成`);

      // 2. 全チャンクをベクトル化（バッチ処理）
      await this.vectorizeChunks();
      
      this.isInitialized = true;
      this.lastUpdateTime = new Date();
      
      const stats = this.getStats();
      console.log('✅ RAG知識ベース初期化完了');
      console.log(`📊 統計: ${stats.totalChunks}チャンク, 平均${stats.avgChunkLength}文字`);
      
      return true;
    } catch (error) {
      console.error('❌ RAG知識ベース初期化エラー:', error.message);
      this.isInitialized = false;
      return false;
    }
  }

  // 文書をチャンクに分割
  chunkDocuments(documents) {
    const chunks = [];
    const { MAX_CHUNK_SIZE, CHUNK_OVERLAP } = RAG_CONFIG;

    documents.forEach((doc, docIndex) => {
      const text = doc.content || '';
      const images = doc.images || [];
      
      // 短い文書はそのまま1チャンクとして扱う
      if (text.length <= MAX_CHUNK_SIZE) {
        chunks.push({
          text: text,
          source: doc.source || `document_${docIndex}`,
          type: doc.type || 'unknown',
          images: images,
          chunkIndex: chunks.length,
          originalLength: text.length
        });
        return;
      }

      // 長い文書を重複ありで分割
      for (let i = 0; i < text.length; i += MAX_CHUNK_SIZE - CHUNK_OVERLAP) {
        const chunkText = text.slice(i, i + MAX_CHUNK_SIZE);
        
        if (chunkText.trim().length > 50) { // 短すぎるチャンクは除外
          chunks.push({
            text: chunkText,
            source: doc.source || `document_${docIndex}`,
            type: doc.type || 'unknown',
            images: images, // 関連画像も保持
            chunkIndex: chunks.length,
            position: i,
            originalLength: text.length
          });
        }
      }
    });

    return chunks;
  }

  // チャンクのベクトル化
  async vectorizeChunks() {
    const batchSize = 100;
    this.embeddings = [];
    
    for (let i = 0; i < this.knowledgeBase.length; i += batchSize) {
      const batch = this.knowledgeBase.slice(i, i + batchSize);
      const texts = batch.map(chunk => chunk.text);
      
      try {
        const batchEmbeddings = await openaiService.createEmbeddings(texts);
        this.embeddings.push(...batchEmbeddings);
        
        const progress = Math.min(i + batchSize, this.knowledgeBase.length);
        console.log(`🔄 ベクトル化進捗: ${progress}/${this.knowledgeBase.length}`);
        
        // API制限対策：少し待機
        await this.sleep(100);
      } catch (error) {
        console.error(`❌ バッチ ${i}-${i + batchSize} ベクトル化失敗:`, error.message);
        throw error;
      }
    }
  }

  // 質問に関連するチャンクを検索
  async searchRelevantChunks(question, topK = null) {
    if (!this.isInitialized) {
      throw new Error('RAGシステムが初期化されていません');
    }

    const searchTopK = topK || RAG_CONFIG.TOP_K_CHUNKS;

    try {
      // 1. 質問をベクトル化
      const questionEmbeddings = await openaiService.createEmbeddings([question]);
      const questionEmbedding = questionEmbeddings[0];

      // 2. 類似度計算
      const similarities = this.embeddings.map((embedding, index) => ({
        chunk: this.knowledgeBase[index],
        similarity: this.cosineSimilarity(questionEmbedding, embedding)
      }));

      // 3. 類似度でフィルタリング・ソート
      const relevantChunks = similarities
        .filter(item => item.similarity >= RAG_CONFIG.SIMILARITY_THRESHOLD)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, searchTopK);

      console.log(`🔍 関連チャンク検索結果: ${relevantChunks.length}件 (閾値: ${RAG_CONFIG.SIMILARITY_THRESHOLD})`);
      
      return relevantChunks;
    } catch (error) {
      console.error('❌ チャンク検索エラー:', error.message);
      throw error;
    }
  }

  // コサイン類似度計算
  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  // RAG回答生成
  async generateAnswer(question, relevantChunks, options = {}) {
    const maxContextLength = options.maxContextLength || RAG_CONFIG.MAX_CONTEXT_LENGTH;
    const maxImages = options.maxImages || RAG_CONFIG.MAX_IMAGES;

    // 1. コンテキスト構築
    let contextLength = 0;
    const selectedChunks = [];
    const selectedImages = [];

    for (const item of relevantChunks) {
      const chunk = item.chunk;
      const chunkLength = chunk.text.length;
      
      if (contextLength + chunkLength <= maxContextLength) {
        selectedChunks.push({
          text: chunk.text,
          source: chunk.source,
          type: chunk.type,
          similarity: item.similarity.toFixed(3)
        });
        contextLength += chunkLength;
        
        // 関連画像も追加（制限内で）
        if (chunk.images && selectedImages.length < maxImages) {
          const remainingImageSlots = maxImages - selectedImages.length;
          const imagesToAdd = chunk.images
            .filter(img => img.url && img.url.startsWith('http'))
            .slice(0, remainingImageSlots);
          selectedImages.push(...imagesToAdd);
        }
      }
    }

    // 2. プロンプト構築
    const context = selectedChunks.map((chunk, index) => 
      `[参考資料${index + 1}] (${chunk.source}, 関連度: ${chunk.similarity})\n${chunk.text}`
    ).join('\n\n');

    console.log(`📚 使用コンテキスト: ${selectedChunks.length}チャンク, ${contextLength}文字, ${selectedImages.length}画像`);

    return {
      context,
      selectedChunks,
      selectedImages,
      contextLength,
      metadata: {
        chunksUsed: selectedChunks.length,
        imagesUsed: selectedImages.length,
        totalContextLength: contextLength,
        averageSimilarity: selectedChunks.length > 0 
          ? (selectedChunks.reduce((sum, chunk) => sum + parseFloat(chunk.similarity), 0) / selectedChunks.length).toFixed(3)
          : 0
      }
    };
  }

  // 🆕 新規追加: 知識ベース限定検索と回答生成
  async searchKnowledgeBaseOnly(query, userInfo = {}) {
    try {
      if (!this.isInitialized) {
        console.log('❌ RAGシステムが初期化されていません');
        return {
          response: promptTemplates.getErrorResponse('initialization'),
          sources: [],
          tokensUsed: { embedding: 0, completion: 0 },
          canAnswer: false,
          confidence: 0
        };
      }

      console.log(`🔍 知識ベース限定検索開始: "${query}"`);
      
      // 1. 関連チャンクを検索
      const relevantChunks = await this.searchRelevantChunks(query, 5);
      const embeddingTokens = this.estimateTokens(query) || 10;

      // 検索結果を統一フォーマットに変換
      const searchResults = relevantChunks.map(item => ({
        content: item.chunk.text,
        score: item.similarity,
        source: item.chunk.source
      }));

      console.log(`🔍 ${searchResults.length}件の関連情報を発見`);
      
      // 2. 回答可能性を事前判定
      const answerability = promptTemplates.assessAnswerability(searchResults, query);
      
      if (!answerability.canAnswer) {
        console.log(`❌ 回答不能: ${answerability.reason}`);
        return {
          response: promptTemplates.generateUnableToAnswerResponse(query, answerability.reason),
          sources: [],
          tokensUsed: { embedding: embeddingTokens, completion: 0 },
          canAnswer: false,
          confidence: answerability.confidence
        };
      }

      // 3. 知識ベース限定プロンプト生成
      const messages = [{
        role: 'user',
        content: promptTemplates.generateKnowledgeBaseOnlyPrompt(query, searchResults, userInfo)
      }];

      // 4. OpenAI API呼び出し
      const aiResponse = await openaiService.chat(messages, {
        max_tokens: 1000,
        temperature: 0.3
      });

      const { content, usage } = aiResponse;
      const completionTokens = usage?.completion_tokens || 0;

      console.log(`✅ 知識ベース限定回答生成完了 (${completionTokens}トークン使用)`);

      return {
        response: content,
        sources: searchResults.map(r => ({ 
          content: r.content.substring(0, 200) + '...', 
          score: r.score,
          source: r.source 
        })),
        tokensUsed: { embedding: embeddingTokens, completion: completionTokens },
        canAnswer: true,
        confidence: answerability.confidence,
        relevantCount: answerability.relevantCount
      };

    } catch (error) {
      console.error('❌ 知識ベース限定検索エラー:', error.message);
      return {
        response: promptTemplates.getErrorResponse('ai_processing', error.message),
        sources: [],
        tokensUsed: { embedding: 0, completion: 0 },
        canAnswer: false,
        confidence: 0
      };
    }
  }

  // 🆕 新規追加: 従来のsearch関数（互換性維持）
  async search(query, userInfo = {}) {
    return await this.searchKnowledgeBaseOnly(query, userInfo);
  }

  // 🆕 新規追加: トークン数推定ユーティリティ
  estimateTokens(text) {
    // 簡単な推定：1トークン≒4文字（日本語）
    return Math.ceil(text.length / 4);
  }

  // 🆕 追加: 状態取得メソッド
  getStatus() {
    return {
      initialized: this.isInitialized,
      totalChunks: this.knowledgeBase.length,
      lastUpdateTime: this.lastUpdateTime,
      avgChunkLength: this.knowledgeBase.length > 0 
        ? Math.round(this.knowledgeBase.reduce((sum, chunk) => sum + chunk.text.length, 0) / this.knowledgeBase.length)
        : 0,
      totalImages: this.knowledgeBase.reduce((sum, chunk) => sum + (chunk.images ? chunk.images.length : 0), 0)
    };
  }

  // 統計情報
  getStats() {
    return {
      totalChunks: this.knowledgeBase.length,
      initialized: this.isInitialized,
      lastUpdateTime: this.lastUpdateTime,
      avgChunkLength: this.knowledgeBase.length > 0 
        ? Math.round(this.knowledgeBase.reduce((sum, chunk) => sum + chunk.text.length, 0) / this.knowledgeBase.length)
        : 0,
      totalImages: this.knowledgeBase.reduce((sum, chunk) => sum + (chunk.images ? chunk.images.length : 0), 0)
    };
  }

  // ユーティリティ: 待機
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // RAGシステムリセット
  reset() {
    this.knowledgeBase = [];
    this.embeddings = [];
    this.isInitialized = false;
    this.lastUpdateTime = null;
    console.log('🔄 RAGシステムリセット完了');
  }
}

// 🆕 修正: シングルトンインスタンス作成
const ragSystem = new RAGSystem();

// 🆕 修正: 複数の形式でexport（index.jsとの互換性確保）
module.exports = {
  // サービスインスタンス
  ragSystem,
  
  // 直接メソッド呼び出し用
  initialize: () => ragSystem.initialize(),
  initializeRAG: () => ragSystem.initialize(),
  initializeKnowledgeBase: (documents) => ragSystem.initializeKnowledgeBase(documents),
  searchKnowledgeBaseOnly: (query, userInfo) => ragSystem.searchKnowledgeBaseOnly(query, userInfo),
  search: (query, userInfo) => ragSystem.search(query, userInfo),
  generateAnswer: (question, relevantChunks, options) => ragSystem.generateAnswer(question, relevantChunks, options),
  getStats: () => ragSystem.getStats(),
  getStatus: () => ragSystem.getStatus(),
  reset: () => ragSystem.reset(),
  
  // 後方互換性のため
  default: ragSystem
};
