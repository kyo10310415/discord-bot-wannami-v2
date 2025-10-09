// services/google-apis.js - Google APIs サービス

const { google } = require('googleapis');
const { GOOGLE_SCOPES } = require('../config/constants');
const environment = require('../config/environment');

class GoogleApisService {
  constructor() {
    this.auth = null;
    this.drive = null;
    this.sheets = null;
    this.docs = null;
    this.slides = null;
    this.isInitialized = false;
  }

  // Google APIs初期化
  initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      console.log('🔐 Google認証初期化開始...');
      
      // 統一認証オブジェクト作成
      this.auth = new google.auth.GoogleAuth({
        credentials: environment.GOOGLE_CREDENTIALS,
        scopes: GOOGLE_SCOPES
      });

      // API初期化
      this.drive = google.drive({ version: 'v3', auth: this.auth });
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      this.docs = google.docs({ version: 'v1', auth: this.auth });
      this.slides = google.slides({ version: 'v1', auth: this.auth });
      
      this.isInitialized = true;
      
      console.log('✅ Google APIs初期化成功');
      console.log('📊 Sheets API: Ready');
      console.log('💾 Drive API: Ready');
      console.log('📄 Docs API: Ready');
      console.log('📽️ Slides API: Ready');
      
      return true;
      
    } catch (error) {
      console.error('❌ Google APIs初期化失敗:', error.message);
      this.isInitialized = false;
      return false;
    }
  }

  // スプレッドシートからURL一覧を読み込む
  async loadUrlListFromSpreadsheet(spreadsheetId) {
    try {
      if (!this.sheets) {
        console.log('❌ Google Sheets not initialized');
        return [];
      }

      console.log('📊 スプレッドシートからURL一覧読み込み開始...');
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'A2:E50', // ヘッダー除く、データ行のみ
      });

      const rows = response.data.values || [];
      const urlList = rows
        .filter(row => row[0] && row[1]) // ファイル名とURLがある行のみ
        .map(row => ({
          fileName: row[0],
          url: row[1],
          category: row[2] || 'その他',
          type: row[3] || 'unknown',
          range: row[4] || ''
        }));

      console.log(`✅ スプレッドシートから${urlList.length}個のURL発見`);
      return urlList;

    } catch (error) {
      console.error('❌ スプレッドシート読み込みエラー:', error.message);
      return [];
    }
  }

  // Google Slides読み込み
  async loadGoogleSlides(url, fileName) {
    try {
      if (!this.slides) {
        console.log('❌ Google Slides API not initialized');
        return `${fileName}: Google Slides API初期化エラー`;
      }

      console.log(`📽️ Google Slides読み込み開始: ${fileName}`);
      
      const match = url.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) {
        throw new Error('Invalid Google Slides URL format');
      }
      
      const presentationId = match[1];
      const presentation = await this.slides.presentations.get({
        presentationId: presentationId,
      });

      let content = `${fileName}\n${'='.repeat(50)}\n`;
      let extractedImages = [];
      
      // スライド処理
      if (presentation.data.slides) {
        presentation.data.slides.forEach((slide, index) => {
          content += `\n--- スライド ${index + 1} ---\n`;
          
          if (slide.pageElements) {
            slide.pageElements.forEach(element => {
              // テキスト処理
              if (element.shape && element.shape.text && element.shape.text.textElements) {
                element.shape.text.textElements.forEach(textElement => {
                  if (textElement.textRun && textElement.textRun.content) {
                    content += textElement.textRun.content;
                  }
                });
              }
              
              // 画像処理
              if (element.image) {
                let imageUrl = element.image.contentUrl || element.image.sourceUrl;
                
                if (imageUrl) {
                  const imageInfo = {
                    source: 'google_slides',
                    fileName: fileName,
                    slide: index + 1,
                    url: imageUrl,
                    description: `${fileName} - スライド${index + 1}の画像`,
                    type: 'embedded_image'
                  };
                  
                  extractedImages.push(imageInfo);
                  content += `\n[🖼️ 画像: ${imageInfo.description}]\n`;
                }
              }
            });
          }
          content += '\n';
        });
      }
      
      // 画像情報追記
      if (extractedImages.length > 0) {
        content += `\n\n--- 含まれる画像一覧 (${extractedImages.length}枚) ---\n`;
        extractedImages.forEach((img, index) => {
          content += `${index + 1}. ${img.description}\n   URL: ${img.url}\n`;
        });
      }

      console.log(`✅ Google Slides読み込み成功: ${fileName} (${content.length}文字, ${extractedImages.length}枚の画像)`);
      return { content, images: extractedImages };

    } catch (error) {
      console.error(`❌ Google Slides読み込み失敗 ${fileName}:`, error.message);
      return { content: `${fileName}: 読み込みエラー - ${error.message}`, images: [] };
    }
  }

  // Google Docs読み込み
  async loadGoogleDocs(url, fileName) {
    try {
      if (!this.docs) {
        console.log('❌ Google Docs API not initialized');
        return { content: `${fileName}: Google Docs API初期化エラー`, images: [] };
      }

      console.log(`📄 Google Docs読み込み開始: ${fileName}`);
      
      const match = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) {
        throw new Error('Invalid Google Docs URL format');
      }
      
      const documentId = match[1];
      const document = await this.docs.documents.get({
        documentId: documentId,
      });

      let content = `${fileName}\n${'='.repeat(50)}\n`;
      let extractedImages = [];
      
      // ドキュメント処理
      if (document.data.body && document.data.body.content) {
        document.data.body.content.forEach((element, elementIndex) => {
          if (element.paragraph && element.paragraph.elements) {
            element.paragraph.elements.forEach(paragraphElement => {
              // テキスト処理
              if (paragraphElement.textRun && paragraphElement.textRun.content) {
                content += paragraphElement.textRun.content;
              }
              
              // 画像処理
              if (paragraphElement.inlineObjectElement) {
                const objectId = paragraphElement.inlineObjectElement.inlineObjectId;
                if (document.data.inlineObjects && document.data.inlineObjects[objectId]) {
                  const inlineObject = document.data.inlineObjects[objectId];
                  if (inlineObject.embeddedObject && inlineObject.embeddedObject.imageProperties) {
                    const imageUrl = inlineObject.embeddedObject.imageProperties.contentUri;
                    
                    if (imageUrl) {
                      const imageInfo = {
                        source: 'google_docs',
                        fileName: fileName,
                        position: elementIndex + 1,
                        url: imageUrl,
                        description: `${fileName} - ドキュメント内画像${extractedImages.length + 1}`,
                        type: 'embedded_image'
                      };
                      
                      extractedImages.push(imageInfo);
                      content += `\n[🖼️ 画像: ${imageInfo.description}]\n`;
                    }
                  }
                }
              }
            });
          }
        });
      }
      
      // 画像情報追記
      if (extractedImages.length > 0) {
        content += `\n\n--- 含まれる画像一覧 (${extractedImages.length}枚) ---\n`;
        extractedImages.forEach((img, index) => {
          content += `${index + 1}. ${img.description}\n   URL: ${img.url}\n`;
        });
      }

      console.log(`✅ Google Docs読み込み成功: ${fileName} (${content.length}文字, ${extractedImages.length}枚の画像)`);
      return { content, images: extractedImages };

    } catch (error) {
      console.error(`❌ Google Docs読み込み失敗 ${fileName}:`, error.message);
      return { content: `${fileName}: 読み込みエラー - ${error.message}`, images: [] };
    }
  }

  // 初期化状態確認
  getStatus() {
    return {
      initialized: this.isInitialized,
      auth_ready: !!this.auth,
      sheets_ready: !!this.sheets,
      drive_ready: !!this.drive,
      docs_ready: !!this.docs,
      slides_ready: !!this.slides
    };
  }
}

module.exports = new GoogleApisService();
