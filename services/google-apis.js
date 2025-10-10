// services/google-apis.js - Google APIs連携サービス

const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');
const logger = require('../utils/logger');
const env = require('../config/environment');

class GoogleAPIsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.drive = null;
    this.initialized = false;
  }

  // サービス初期化
  async initialize() {
    try {
      if (this.initialized) {
        logger.debug('Google APIs already initialized');
        return;
      }

      logger.info('Google APIs初期化開始...');

      // 認証情報の設定
      const credentials = env.GOOGLE_CREDENTIALS;
      
      // デバッグ用ログ
      console.log('🔐 Google認証情報チェック:');
      console.log('- project_id:', !!credentials?.project_id);
      console.log('- private_key:', !!credentials?.private_key);
      console.log('- client_email:', !!credentials?.client_email);
      console.log('- private_key length:', credentials?.private_key?.length || 0);
      
      if (!credentials || !credentials.private_key) {
        console.error('❌ 認証情報詳細:', {
          credentials_exists: !!credentials,
          project_id: credentials?.project_id,
          client_email: credentials?.client_email,
          private_key_exists: !!credentials?.private_key,
          private_key_preview: credentials?.private_key?.substring(0, 50) + '...'
        });
        throw new Error('Google認証情報が不完全です');
      }

      // GoogleAuth設定
      this.auth = new GoogleAuth({
        credentials: credentials,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets.readonly',
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/presentations.readonly',
          'https://www.googleapis.com/auth/documents.readonly'
        ]
      });

      // Google Sheets API初期化
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      
      // Google Drive API初期化
      this.drive = google.drive({ version: 'v3', auth: this.auth });

      this.initialized = true;
      logger.info('✅ Google APIs初期化完了');

    } catch (error) {
      logger.error('Google APIs初期化エラー:', error);
      throw error;
    }
  }

  // スプレッドシート読み込み
  async readSpreadsheet(spreadsheetId, range = 'A:G') {
    try {
      await this.ensureInitialized();

      logger.info(`スプレッドシート読み込み開始: ${spreadsheetId}`);

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: range,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });

      const values = response.data.values || [];
      logger.info(`✅ スプレッドシート読み込み完了: ${values.length}行`);

      return values;

    } catch (error) {
      logger.error(`スプレッドシート読み込みエラー (${spreadsheetId}):`, error);
      throw error;
    }
  }

  // 🆕 追加: URL一覧をスプレッドシートから読み込み（knowledge-base.jsとの互換性のため）
  async loadUrlListFromSpreadsheet(spreadsheetId, range = 'A:D') {
    try {
      await this.ensureInitialized();
      
      console.log(`📋 URL一覧読み込み開始: ${spreadsheetId}`);
      
      const values = await this.readSpreadsheet(spreadsheetId, range);
      
      if (values.length === 0) {
        console.log('❌ スプレッドシートにデータが見つかりません');
        return [];
      }

      // ヘッダー行をスキップして処理
      const dataRows = values.slice(1);
      
      const urlList = dataRows
        .filter(row => row[1] && row[1].trim() && row[1] !== 'URLリンク' && row[1].startsWith('http')) // B列（URL）が必須、ヘッダー除外、HTTP/HTTPSのみ
        .map((row, index) => ({
          url: row[1] ? row[1].trim() : '',
          fileName: row[0] ? row[0].trim() : `文書${index + 1}`,
          category: row[2] ? row[2].trim() : 'general',
          type: row[3] ? row[3].trim() : this.detectUrlType(row[1]),
          rowIndex: index + 2
        }))
        .filter(item => item.url && item.url.startsWith('http')); // URLが空でなく、HTTPで始まるもののみ

      console.log(`✅ URL一覧読み込み完了: ${urlList.length}件`);
      
      // 読み込んだURLを表示（デバッグ用）
      urlList.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.fileName} (${item.type}) - ${item.url.substring(0, 50)}...`);
      });
      
      return urlList;

    } catch (error) {
      console.error('❌ URL一覧読み込みエラー:', error.message);
      throw error;
    }
  }

  // 🆕 追加: URLタイプの自動検出（強化版）
  detectUrlType(url) {
    if (!url || typeof url !== 'string') {
      console.log(`❓ URL形式不明: ${url}`);
      return 'unknown';
    }
    
    const urlLower = url.toLowerCase().trim();
    
    // Google Slides検出（より正確なパターン）
    if (urlLower.includes('docs.google.com/presentation') || urlLower.includes('/presentation/d/')) {
      console.log(`📊 Google Slides検出: ${url.substring(0, 50)}...`);
      return 'google_slides';
    }
    
    // Google Docs検出（より正確なパターン）
    if (urlLower.includes('docs.google.com/document') || urlLower.includes('/document/d/')) {
      console.log(`📄 Google Docs検出: ${url.substring(0, 50)}...`);
      return 'google_docs';
    }
    
    // Notion検出
    if (urlLower.includes('notion.so') || urlLower.includes('notion.site')) {
      console.log(`📝 Notion検出: ${url.substring(0, 50)}...`);
      return 'notion';
    }
    
    // 画像ファイル検出
    if (urlLower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i) || 
        urlLower.includes('cdn.discordapp.com') ||
        urlLower.includes('drive.google.com/file')) {
      console.log(`🖼️ 画像ファイル検出: ${url.substring(0, 50)}...`);
      return 'image';
    }
    
    // 一般ウェブサイト
    if (urlLower.startsWith('http://') || urlLower.startsWith('https://')) {
      console.log(`🌐 ウェブサイト検出: ${url.substring(0, 50)}...`);
      return 'website';
    }
    
    console.log(`❓ 未知のURL形式: ${url}`);
    return 'unknown';
  }

  // 🆕 追加: Google Slides読み込み（knowledge-base.jsとの互換性のため）
  async loadGoogleSlides(url, fileName) {
    try {
      console.log(`📄 Google Slides読み込み: ${fileName}`);
      
      // URLからプレゼンテーションIDを抽出
      const presentationId = this.extractPresentationId(url);
      if (!presentationId) {
        throw new Error('プレゼンテーションIDの抽出に失敗しました');
      }

      await this.ensureInitialized();
      
      // Google Slides APIを使用してスライド内容を取得
      const slides = google.slides({ version: 'v1', auth: this.auth });
      const response = await slides.presentations.get({
        presentationId: presentationId
      });

      const presentation = response.data;
      let content = `${fileName}\n\n`;
      
      // スライドの内容を抽出
      if (presentation.slides) {
        presentation.slides.forEach((slide, index) => {
          content += `--- スライド ${index + 1} ---\n`;
          
          if (slide.pageElements) {
            slide.pageElements.forEach(element => {
              if (element.shape && element.shape.text && element.shape.text.textElements) {
                element.shape.text.textElements.forEach(textElement => {
                  if (textElement.textRun && textElement.textRun.content) {
                    content += textElement.textRun.content;
                  }
                });
              }
            });
          }
          content += '\n\n';
        });
      }

      console.log(`✅ Google Slides読み込み完了: ${fileName} (${content.length}文字)`);
      return { content, images: [] };

    } catch (error) {
      console.error(`❌ Google Slides読み込みエラー ${fileName}:`, error.message);
      
      // より詳細なエラー情報
      if (error.message.includes('permission') || error.message.includes('forbidden')) {
        console.log(`🔒 権限エラー: ${fileName} - Botアカウントに共有権限が必要です`);
        return { 
          content: `${fileName}: Google Slides読み込みエラー - 共有権限が必要です。リンクを知っている全員に共有するか、discord-bot-wannami@wanamisan-474114.iam.gserviceaccount.com に編集権限を付与してください。`,
          images: []
        };
      }
      
      return { 
        content: `${fileName}: Google Slides読み込みエラー - ${error.message}`,
        images: []
      };
    }
  }

  // 🆕 追加: Google Docs読み込み（knowledge-base.jsとの互換性のため）
  async loadGoogleDocs(url, fileName) {
    try {
      console.log(`📄 Google Docs読み込み: ${fileName}`);
      
      // URLから文書IDを抽出
      const documentId = this.extractDocumentId(url);
      if (!documentId) {
        throw new Error('文書IDの抽出に失敗しました');
      }

      await this.ensureInitialized();
      
      // Google Docs APIを使用して文書内容を取得
      const docs = google.docs({ version: 'v1', auth: this.auth });
      const response = await docs.documents.get({
        documentId: documentId
      });

      const document = response.data;
      let content = `${fileName}\n\n`;
      
      // 文書の内容を抽出
      if (document.body && document.body.content) {
        document.body.content.forEach(element => {
          if (element.paragraph && element.paragraph.elements) {
            element.paragraph.elements.forEach(paragraphElement => {
              if (paragraphElement.textRun && paragraphElement.textRun.content) {
                content += paragraphElement.textRun.content;
              }
            });
          }
        });
      }

      console.log(`✅ Google Docs読み込み完了: ${fileName} (${content.length}文字)`);
      return { content, images: [] };

    } catch (error) {
      console.error(`❌ Google Docs読み込みエラー ${fileName}:`, error.message);
      
      // より詳細なエラー情報
      if (error.message.includes('permission') || error.message.includes('forbidden')) {
        console.log(`🔒 権限エラー: ${fileName} - Botアカウントに共有権限が必要です`);
        return { 
          content: `${fileName}: Google Docs読み込みエラー - 共有権限が必要です。リンクを知っている全員に共有するか、discord-bot-wannami@wanamisan-474114.iam.gserviceaccount.com に編集権限を付与してください。`,
          images: []
        };
      }
      
      return { 
        content: `${fileName}: Google Docs読み込みエラー - ${error.message}`,
        images: []
      };
    }
  }

  // 🆕 追加: プレゼンテーションID抽出
  extractPresentationId(url) {
    const match = url.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  // 🆕 追加: 文書ID抽出
  extractDocumentId(url) {
    const match = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  // 知識ベーススプレッドシート専用読み込み
  async readKnowledgeBase(spreadsheetId) {
    try {
      const values = await this.readSpreadsheet(spreadsheetId, 'A:G');
      
      if (values.length === 0) {
        logger.warn('知識ベーススプレッドシートが空です');
        return [];
      }

      // ヘッダー行をスキップ（1行目）
      const dataRows = values.slice(1);
      
      const knowledgeItems = dataRows
        .filter(row => row[0] && row[1]) // A列とB列が必須
        .map((row, index) => ({
          id: index + 1,
          question: row[0] || '',
          answer: row[1] || '',
          category: row[2] || 'general',
          priority: parseInt(row[3]) || 1,
          updated: row[4] || '',
          note: row[5] || '',
          extended: row[6] || '', // G列の拡張情報
          rowIndex: index + 2 // スプレッドシートの実際の行番号
        }));

      logger.info(`✅ 知識ベース読み込み完了: ${knowledgeItems.length}件`);
      return knowledgeItems;

    } catch (error) {
      logger.error('知識ベース読み込みエラー:', error);
      throw error;
    }
  }

  // Google Driveファイル情報取得
  async getFileInfo(fileId) {
    try {
      await this.ensureInitialized();

      const response = await this.drive.files.get({
        fileId: fileId,
        fields: 'id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink'
      });

      return response.data;

    } catch (error) {
      logger.error(`Google Driveファイル情報取得エラー (${fileId}):`, error);
      throw error;
    }
  }

  // Google Driveファイル内容取得（テキストファイル用）
  async getFileContent(fileId) {
    try {
      await this.ensureInitialized();

      const response = await this.drive.files.get({
        fileId: fileId,
        alt: 'media'
      });

      return response.data;

    } catch (error) {
      logger.error(`Google Driveファイル内容取得エラー (${fileId}):`, error);
      throw error;
    }
  }

  // スプレッドシートのメタデータ取得
  async getSpreadsheetMetadata(spreadsheetId) {
    try {
      await this.ensureInitialized();

      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
        fields: 'properties,sheets.properties'
      });

      const metadata = {
        title: response.data.properties.title,
        locale: response.data.properties.locale,
        timeZone: response.data.properties.timeZone,
        sheets: response.data.sheets.map(sheet => ({
          title: sheet.properties.title,
          sheetId: sheet.properties.sheetId,
          index: sheet.properties.index,
          sheetType: sheet.properties.sheetType,
          gridProperties: sheet.properties.gridProperties
        }))
      };

      logger.info(`スプレッドシートメタデータ取得: ${metadata.title}`);
      return metadata;

    } catch (error) {
      logger.error(`スプレッドシートメタデータ取得エラー (${spreadsheetId}):`, error);
      throw error;
    }
  }

  // 初期化確認
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // 接続テスト
  async testConnection() {
    try {
      await this.ensureInitialized();
      
      // 簡単なAPIコールでテスト
      const auth = await this.auth.getClient();
      const accessToken = await auth.getAccessToken();
      
      if (!accessToken.token) {
        throw new Error('アクセストークンの取得に失敗');
      }

      logger.info('✅ Google APIs接続テスト成功');
      return true;

    } catch (error) {
      logger.error('Google APIs接続テストエラー:', error);
      return false;
    }
  }

  // サービス状態の取得
  getStatus() {
    return {
      initialized: this.initialized,
      hasAuth: !!this.auth,
      hasSheets: !!this.sheets,
      hasDrive: !!this.drive
    };
  }
}

// シングルトンインスタンス
const googleAPIsService = new GoogleAPIsService();

// 初期化関数（エクスポート用）
async function initializeServices() {
  await googleAPIsService.initialize();
}

module.exports = {
  googleAPIsService,
  initializeServices,
  readKnowledgeBase: (spreadsheetId) => googleAPIsService.readKnowledgeBase(spreadsheetId),
  testConnection: () => googleAPIsService.testConnection(),
  // 🆕 追加: knowledge-base.jsとの互換性のため
  loadUrlListFromSpreadsheet: (spreadsheetId, range) => googleAPIsService.loadUrlListFromSpreadsheet(spreadsheetId, range),
  loadGoogleSlides: (url, fileName) => googleAPIsService.loadGoogleSlides(url, fileName),
  loadGoogleDocs: (url, fileName) => googleAPIsService.loadGoogleDocs(url, fileName)
};
