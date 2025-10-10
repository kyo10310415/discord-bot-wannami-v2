// services/knowledge-base.js - 知識ベース構築サービス

const googleApisService = require('./google-apis');
const { KNOWLEDGE_SPREADSHEET_ID } = require('../config/constants');
const { loadNotionContent, loadWebsiteContent, loadImageUrlInfo } = require('../utils/content-loaders');
const logger = require('../utils/logger');

class KnowledgeBaseService {
  constructor() {
    this.documentImages = [];
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
      
      // スプレッドシートからURL一覧を取得
      const urlList = await googleApisService.loadUrlListFromSpreadsheet(KNOWLEDGE_SPREADSHEET_ID);
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

  // URL先のコンテンツを読み込む
  async loadContentFromUrl(urlInfo) {
    const { url, fileName, category, type } = urlInfo;
    
    try {
      // Google Slides
      if (url.includes('docs.google.com/presentation')) {
        return await googleApisService.loadGoogleSlides(url, fileName);
      } 
      // Google Docs
      else if (url.includes('docs.google.com/document')) {
        return await googleApisService.loadGoogleDocs(url, fileName);
      } 
      // Notion
      else if (url.includes('notion.so') || url.includes('notion.site')) {
        const content = await loadNotionContent(url, fileName);
        return { content, images: this.extractImagesFromNotionContent(content, fileName) };
      }
      // 画像URL
      else if (url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i) || 
               url.includes('cdn.discordapp.com') ||
               url.includes('drive.google.com/file')) {
        const content = await loadImageUrlInfo(url, fileName);
        return { content, images: this.extractDirectImageInfo(url, fileName) };
      }
      // 一般WEBサイト
      else if (url.startsWith('http://') || url.startsWith('https://')) {
        const content = await loadWebsiteContent(url, fileName);
        return { content, images: this.extractImagesFromWebContent(content, fileName) };
      }
      // 未対応形式
      else {
        console.log(`❓ 未知のURL形式: ${fileName}`);
        return { content: `${fileName}: 未対応のURL形式 - ${url}`, images: [] };
      }
    } catch (error) {
      console.error(`❌ コンテンツ読み込み失敗 ${fileName}:`, error.message);
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
  getDocumentImages: () => knowledgeBaseService.getDocumentImages(),
  getStats: () => knowledgeBaseService.getStats(),
  getStatus: () => knowledgeBaseService.getStatus(),
  reset: () => knowledgeBaseService.reset(),
  
  // 後方互換性のため
  default: knowledgeBaseService
};
