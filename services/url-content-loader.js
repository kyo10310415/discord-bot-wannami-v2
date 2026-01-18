// services/url-content-loader.js - URL内容読み込みサービス v1.0.0
// Version: 1.0.0
// 作成日: 2025-11-21
// 説明: ミッション提出時のURL内容を自動取得するサービス

const axios = require('axios');
const logger = require('../utils/logger');

// crawler tool用のAPI設定（環境変数から取得）
const CRAWLER_API_ENDPOINT = process.env.CRAWLER_API_ENDPOINT || 'https://api.genspark.ai/v1/tools/crawler';
const GENSPARK_API_KEY = process.env.GENSPARK_API_KEY;

class UrlContentLoader {
  constructor() {
    this.maxContentLength = 8000; // 最大取得文字数
    this.timeout = 30000; // 30秒タイムアウト
    this.axiosTimeout = 35000; // axios自体のタイムアウト
  }

  /**
   * テキストからURLを検出する
   * 画像URLは除外される
   * 
   * @param {string} text - 検索対象のテキスト
   * @returns {Array<string>} - 検出されたドキュメントURLの配列
   */
  detectUrls(text) {
    if (!text) {
      return [];
    }

    // http/https URLを検出
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const allUrls = text.match(urlRegex) || [];
    
    // 画像URLを除外（.jpg, .png, .gif等）
    const documentUrls = allUrls.filter(url => {
      const lowerUrl = url.toLowerCase();
      return !lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i);
    });
    
    // 重複を除去
    const uniqueUrls = [...new Set(documentUrls)];
    
    if (uniqueUrls.length > 0) {
      logger.info(`🔗 URL検出: ${uniqueUrls.length}個のドキュメントURL`);
      uniqueUrls.forEach((url, index) => {
        logger.info(`  ${index + 1}. ${url}`);
      });
    }
    
    return uniqueUrls;
  }

  /**
   * 単一のURLからコンテンツを取得
   * 
   * @param {string} url - 取得対象のURL
   * @returns {Promise<Object>} - { url, text, success, error? }
   */
  async fetchUrlContent(url) {
    try {
      logger.info(`📥 URLコンテンツ取得開始: ${url}`);
      
      // API KEY未設定チェック
      if (!GENSPARK_API_KEY) {
        logger.warn('⚠️ GENSPARK_API_KEYが設定されていません');
        return {
          url: url,
          text: '',
          success: false,
          error: 'API KEY未設定'
        };
      }

      // crawler toolでコンテンツ取得
      const response = await axios.post(
        CRAWLER_API_ENDPOINT,
        {
          url: url,
          timeout: this.timeout
        },
        {
          headers: {
            'Authorization': `Bearer ${GENSPARK_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: this.axiosTimeout
        }
      );

      // レスポンスの検証
      if (response.data && response.data.content) {
        const content = response.data.content;
        const textLength = content.length;
        
        // 最大文字数に制限
        const trimmedContent = content.substring(0, this.maxContentLength);
        
        logger.info(`✅ URLコンテンツ取得成功: ${textLength}文字 (${trimmedContent.length}文字使用)`);
        
        return {
          url: url,
          text: trimmedContent,
          originalLength: textLength,
          trimmedLength: trimmedContent.length,
          success: true
        };
      } else {
        logger.warn(`⚠️ URLコンテンツが空: ${url}`);
        return {
          url: url,
          text: '',
          success: false,
          error: 'コンテンツが空です'
        };
      }
    } catch (error) {
      const errorMessage = error.message || 'Unknown error';
      logger.error(`❌ URLコンテンツ取得失敗: ${url}`, errorMessage);
      
      return {
        url: url,
        text: '',
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 複数のURLからコンテンツを並行取得
   * 
   * @param {Array<string>} urls - 取得対象のURL配列
   * @returns {Promise<Array<Object>>} - URL内容オブジェクトの配列
   */
  async fetchMultipleUrls(urls) {
    if (!urls || urls.length === 0) {
      return [];
    }

    logger.info(`📥 ${urls.length}個のURLから並行取得開始...`);
    
    const fetchPromises = urls.map(url => this.fetchUrlContent(url));
    const results = await Promise.all(fetchPromises);
    
    const successCount = results.filter(r => r.success).length;
    logger.info(`✅ URL取得完了: ${successCount}/${urls.length}件成功`);
    
    return results;
  }

  /**
   * テキストからURLを検出して内容を取得
   * detectUrls() と fetchMultipleUrls() の統合版
   * 
   * @param {string} text - 検索対象のテキスト
   * @returns {Promise<Array<Object>>} - URL内容オブジェクトの配列
   */
  async extractAndFetchUrls(text) {
    const urls = this.detectUrls(text);
    
    if (urls.length === 0) {
      logger.info('🔗 検出されたURLなし');
      return [];
    }
    
    return await this.fetchMultipleUrls(urls);
  }

  /**
   * URL内容を評価コンテキスト用の文字列にフォーマット
   * 
   * @param {Array<Object>} urlContents - fetchMultipleUrls()の結果
   * @returns {string} - フォーマット済みの文字列
   */
  formatUrlContentsForContext(urlContents) {
    if (!urlContents || urlContents.length === 0) {
      return '';
    }

    let formatted = '\n## 📄 提出されたURL資料\n\n';
    
    urlContents.forEach((content, index) => {
      formatted += `### 【資料${index + 1}】 ${content.url}\n`;
      
      if (content.success && content.text) {
        formatted += `${content.text}\n\n`;
        
        // 文字数が制限されている場合は注記
        if (content.originalLength && content.originalLength > content.trimmedLength) {
          formatted += `*(元の文字数: ${content.originalLength}文字、表示: ${content.trimmedLength}文字)*\n\n`;
        }
      } else {
        formatted += `⚠️ 取得失敗: ${content.error}\n\n`;
      }
    });
    
    return formatted;
  }

  /**
   * 取得統計情報を取得
   * 
   * @param {Array<Object>} urlContents - fetchMultipleUrls()の結果
   * @returns {Object} - 統計情報
   */
  getStats(urlContents) {
    if (!urlContents || urlContents.length === 0) {
      return {
        total: 0,
        success: 0,
        failed: 0,
        totalChars: 0
      };
    }

    const successContents = urlContents.filter(c => c.success);
    const totalChars = successContents.reduce((sum, c) => sum + (c.text?.length || 0), 0);

    return {
      total: urlContents.length,
      success: successContents.length,
      failed: urlContents.length - successContents.length,
      totalChars: totalChars
    };
  }

  /**
   * サービスの設定を取得
   */
  getConfig() {
    return {
      maxContentLength: this.maxContentLength,
      timeout: this.timeout,
      axiosTimeout: this.axiosTimeout,
      apiKeyConfigured: !!GENSPARK_API_KEY,
      endpoint: CRAWLER_API_ENDPOINT
    };
  }

  /**
   * サービスの状態を取得
   */
  getStatus() {
    return {
      service: 'URL Content Loader',
      version: '1.0.0',
      apiKeyConfigured: !!GENSPARK_API_KEY,
      endpoint: CRAWLER_API_ENDPOINT,
      config: {
        maxContentLength: this.maxContentLength,
        timeout: `${this.timeout}ms`,
        axiosTimeout: `${this.axiosTimeout}ms`
      }
    };
  }
}

// シングルトンインスタンス
const urlContentLoader = new UrlContentLoader();

module.exports = {
  urlContentLoader,
  UrlContentLoader,
  // 便利な関数エクスポート
  detectUrls: (text) => urlContentLoader.detectUrls(text),
  fetchUrlContent: (url) => urlContentLoader.fetchUrlContent(url),
  fetchMultipleUrls: (urls) => urlContentLoader.fetchMultipleUrls(urls),
  extractAndFetchUrls: (text) => urlContentLoader.extractAndFetchUrls(text),
  formatUrlContentsForContext: (urlContents) => urlContentLoader.formatUrlContentsForContext(urlContents),
  getStats: (urlContents) => urlContentLoader.getStats(urlContents)
};
