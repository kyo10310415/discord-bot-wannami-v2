// services/knowledge-base.js - 知識ベース構築サービス

const { googleAPIsService, detectUrlType, loadGoogleSlides, loadGoogleDocs } = require('./google-apis');
const { KNOWLEDGE_SPREADSHEET_ID } = require('../config/constants');
const { loadNotionContent, loadWebsiteContent, loadImageUrlInfo } = require('../utils/content-loaders');
const logger = require('../utils/logger');

class KnowledgeBaseService {
  constructor() {
    this.documentImages = [];
    this.documents = []; // 🆕 追加: 構築した文書を保存
    this.lastBuildTime = null;
    this.isInitialized = false;
  }

  // 🆕 追加: 初期化メソッド（index.jsとの互換性のため）
  async initialize() {
    try {
      console.log('📚 知識ベースサービス初期化開始...');
      
      // 知識ベース構築を実行
      const result = await this.buildKnowledgeBase();
      
      if (result) {
        this.isInitialized = true;
        logger.info('✅ 知識ベースサービス初期化完了');
        logger.info(`📊 初期化後の文書数: ${this.documents.length}`); // 🆕 デバッグ情報
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

  // 統合知識ベース構築
  async buildKnowledgeBase() {
    try {
      console.log('📚 知識ベース構築開始...');
      
      // 前回の文書内画像をクリア
      this.documentImages = [];
      this.documents = []; // 🆕 追加: 文書配列もクリア
      
      // スプレッドシートからURL一覧を取得
      const urlList = await googleAPIsService.loadUrlListFromSpreadsheet(KNOWLEDGE_SPREADSHEET_ID);
      if (urlList.length === 0) {
        console.log('❌ スプレッドシートにURLが見つかりません');
        return null;
      }

      console.log(`📄 ${urlList.length}件のコンテンツを読み込み開始`);

      const documents = [];
      let totalImages = 0;

      // 各URLの内容を読み込み
      for (const urlInfo of urlList) {
        console.log(`📖 読み込み中: ${urlInfo.fileName}`);
        
        try {
          const result = await this.loadContentFromUrl(urlInfo);
          
          if (result) {
            documents.push({
              source: urlInfo.fileName,
              type: urlInfo.type,
              category: urlInfo.category,
              url: urlInfo.url,
              content: result.content,
              images: result.images || []
            });

            // 文書内画像を統合
            if (result.images && result.images.length > 0) {
              this.documentImages.push(...result.images);
              totalImages += result.images.length;
            }
          }
        } catch (error) {
          console.error(`❌ ${urlInfo.fileName} 読み込み失敗:`, error.message);
          // エラーがあっても他のドキュメントの処理を続行
          documents.push({
            source: urlInfo.fileName,
            type: 'error',
            category: urlInfo.category,
            url: urlInfo.url,
            content: `${urlInfo.fileName}: 読み込みエラー - ${error.message}`,
            images: []
          });
        }
        
        // APIレート制限対策で少し待機
        await this.sleep(200);
      }

      // 🆕 追加: 構築した文書を保存
      this.documents = documents;
      this.lastBuildTime = new Date().toISOString();

      console.log(`✅ 知識ベース構築完了`);
      console.log(`📄 文書数: ${documents.length}`);
      console.log(`🖼️ 総画像数: ${totalImages}`);
      console.log(`📊 総文字数: ${documents.reduce((sum, doc) => sum + doc.content.length, 0)}`);

      return documents;

    } catch (error) {
      console.error('❌ 知識ベース構築エラー:', error);
      return null;
    }
  }

  // 🆕 追加: 知識ベース検索機能
  searchKnowledge(query, options = {}) {
    try {
      const {
        maxResults = 5,
        minScore = 0.1,
        topK = 5,
        includeMetadata = true
      } = options;

      logger.info(`🔍 知識ベース検索: "${query}"`);
      
      // 🆕 デバッグ情報追加
      logger.info(`📊 検索前の状態: 初期化=${this.isInitialized}, 文書数=${this.documents.length}`);

      // 知識ベースが初期化されていない場合
      if (!this.isInitialized || this.documents.length === 0) {
        logger.warn('⚠️ 知識ベースが初期化されていないか、文書が空です');
        logger.warn(`詳細: isInitialized=${this.isInitialized}, documents.length=${this.documents.length}`);
        return [];
      }

      // 🆕 文書の内容サンプルをログ出力（最初の3件）
      if (this.documents.length > 0) {
        logger.info('📄 文書サンプル（最初の3件）:');
        this.documents.slice(0, 3).forEach((doc, i) => {
          logger.info(`  [${i + 1}] ${doc.source} (${doc.category}) - 文字数: ${doc.content.length}`);
        });
      }

      // クエリを小文字化して検索準備
      const queryLower = query.toLowerCase();
      const queryKeywords = queryLower.split(/\s+/).filter(k => k.length > 1);
      
      logger.info(`🔑 検索キーワード: ${queryKeywords.join(', ')}`);

      // 各文書とのスコアリング
      const scoredDocuments = this.documents.map(doc => {
        const contentLower = doc.content.toLowerCase();
        let score = 0;
        let matchDetails = []; // 🆕 マッチ詳細

        // キーワードマッチングスコア
        queryKeywords.forEach(keyword => {
          const matches = (contentLower.match(new RegExp(keyword, 'g')) || []).length;
          if (matches > 0) {
            score += matches * 0.1; // キーワード出現回数に応じてスコア加算
            matchDetails.push(`"${keyword}":${matches}回`);
          }
        });

        // 完全一致ボーナス
        if (contentLower.includes(queryLower)) {
          score += 0.5;
          matchDetails.push('完全一致+0.5');
        }

        // カテゴリ一致ボーナス
        if (doc.category && queryLower.includes(doc.category.toLowerCase())) {
          score += 0.3;
          matchDetails.push('カテゴリ一致+0.3');
        }

        // スコアを0-1の範囲に正規化
        const normalizedScore = Math.min(score, 1.0);

        return {
          ...doc,
          score: normalizedScore,
          similarity: normalizedScore, // rag-system.js互換性のため
          title: doc.source, // rag-system.js互換性のため
          answer: this._extractRelevantContent(doc.content, queryKeywords), // 関連部分を抽出
          matchDetails: matchDetails, // 🆕 デバッグ用
          metadata: includeMetadata ? {
            source: doc.source,
            category: doc.category,
            type: doc.type,
            url: doc.url
          } : undefined
        };
      });

      // スコアでソート
      scoredDocuments.sort((a, b) => b.score - a.score);

      // 🆕 スコアの分布をログ出力
      logger.info('📊 スコア分布（上位10件）:');
      scoredDocuments.slice(0, 10).forEach((doc, i) => {
        logger.info(`  [${i + 1}] ${doc.source}: ${doc.score.toFixed(3)} - ${doc.matchDetails.join(', ') || 'マッチなし'}`);
      });

      // 最小スコアでフィルタリング & 上位結果のみ返す
      const results = scoredDocuments
        .filter(doc => doc.score >= minScore)
        .slice(0, Math.max(maxResults, topK));

      logger.info(`✅ 検索完了: ${results.length}件ヒット (最高スコア: ${results[0]?.score.toFixed(2) || 0})`);
      
      // 🆕 フィルタリング情報
      if (results.length === 0 && scoredDocuments.length > 0) {
        logger.warn(`⚠️ minScore=${minScore}でフィルタリングされました。最高スコア: ${scoredDocuments[0].score.toFixed(3)}`);
      }

      return results;

    } catch (error) {
      logger.error('❌ 知識ベース検索エラー:', error);
      return [];
    }
  }

  // 🆕 追加: 関連コンテンツ抽出（長い文書から関連部分を抜粋）
  _extractRelevantContent(content, keywords) {
    const maxLength = 500; // 最大文字数
    const contentLower = content.toLowerCase();

    // キーワードが最初に出現する位置を探す
    let firstMatchIndex = -1;
    for (const keyword of keywords) {
      const index = contentLower.indexOf(keyword);
      if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
        firstMatchIndex = index;
      }
    }

    // キーワードが見つかった場合、その周辺を抽出
    if (firstMatchIndex !== -1) {
      const start = Math.max(0, firstMatchIndex - 100);
      const end = Math.min(content.length, firstMatchIndex + maxLength - 100);
      const excerpt = content.substring(start, end);
      
      return (start > 0 ? '...' : '') + excerpt + (end < content.length ? '...' : '');
    }

    // キーワードが見つからない場合、先頭から抽出
    return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
  }

  // URL先のコンテンツを読み込む（URL自動検出ベースに変更）
  async loadContentFromUrl(urlInfo) {
    const { url, fileName, category, type } = urlInfo;
    
    // URLから自動で形式を検出
    const detectedType = detectUrlType(url);
    
    console.log(`📖 コンテンツ読み込み開始: ${fileName}`);
    console.log(`🔍 スプレッドシートのタイプ: "${type}" → 自動検出: "${detectedType}"`);
    
    try {
      // 自動検出されたタイプベースでのコンテンツ読み込み
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
          return { content: notionContent, images: this.extractImagesFromNotionContent(notionContent, fileName) };
          
        case 'image':
          console.log(`🖼️ 画像読み込み: ${fileName}`);
          const imageContent = await loadImageUrlInfo(url, fileName);
          return { content: imageContent, images: this.extractDirectImageInfo(url, fileName) };
          
        case 'website':
          console.log(`🌐 ウェブサイト読み込み: ${fileName}`);
          const websiteContent = await loadWebsiteContent(url, fileName);
          return { content: websiteContent, images: this.extractImagesFromWebContent(websiteContent, fileName) };
          
        default:
          console.log(`❓ 未対応のURL形式: ${fileName} (自動検出: ${detectedType}, スプレッドシート: ${type})`);
          return { 
            content: `${fileName}: 未対応のURL形式 (検出結果: ${detectedType}) - ${url}`,
            images: [] 
          };
      }
    } catch (error) {
      console.error(`❌ コンテンツ読み込み失敗 ${fileName} (検出結果: ${detectedType}):`, error.message);
      throw error;
    }
  }

  // Notionコンテンツから画像情報を抽出
  extractImagesFromNotionContent(content, fileName) {
    const images = [];
    // Notionの画像参照パターンをマッチング
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

  // 直接画像URLの情報を抽出
  extractDirectImageInfo(url, fileName) {
    return [{
      source: 'direct_url',
      fileName: fileName,
      url: url,
      description: `${fileName} - 直接画像URL`,
      type: 'direct_image'
    }];
  }

  // WEBコンテンツから画像情報を抽出
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

  // 文書内画像の取得
  getDocumentImages() {
    return this.documentImages;
  }

  // 🆕 追加: 状態取得メソッド
  getStatus() {
    return {
      initialized: this.isInitialized,
      totalDocuments: this.documents.length,
      totalDocumentImages: this.documentImages.length,
      lastBuildTime: this.lastBuildTime,
      imagesBySource: this.documentImages.reduce((acc, img) => {
        acc[img.source] = (acc[img.source] || 0) + 1;
        return acc;
      }, {})
    };
  }

  // 統計情報
  getStats() {
    return {
      totalDocuments: this.documents.length,
      totalDocumentImages: this.documentImages.length,
      lastBuildTime: this.lastBuildTime,
      imagesBySource: this.documentImages.reduce((acc, img) => {
        acc[img.source] = (acc[img.source] || 0) + 1;
        return acc;
      }, {})
    };
  }

  // ユーティリティ: 待機
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // リセット
  reset() {
    this.documents = [];
    this.documentImages = [];
    this.lastBuildTime = null;
    this.isInitialized = false;
    console.log('🔄 知識ベースサービスリセット完了');
  }
}

// 🆕 修正: シングルトンインスタンス作成
const knowledgeBaseService = new KnowledgeBaseService();

// 🆕 修正: 複数の形式でexport（index.jsとの互換性確保）
module.exports = {
  // サービスインスタンス
  knowledgeBaseService,
  
  // 直接メソッド呼び出し用
  buildKnowledgeBase: () => knowledgeBaseService.buildKnowledgeBase(),
  initialize: () => knowledgeBaseService.initialize(),
  initializeKnowledgeBase: () => knowledgeBaseService.initialize(),
  searchKnowledge: (query, options) => knowledgeBaseService.searchKnowledge(query, options), // 🆕 追加
  getDocumentImages: () => knowledgeBaseService.getDocumentImages(),
  getStats: () => knowledgeBaseService.getStats(),
  getStatus: () => knowledgeBaseService.getStatus(),
  reset: () => knowledgeBaseService.reset(),
  
  // 後方互換性のため
  default: knowledgeBaseService
};
