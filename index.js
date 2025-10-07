const express = require('express');
const axios = require('axios');
const nacl = require('tweetnacl');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// 🆕 Bot User ID（Discord Developer Portalで確認）
const BOT_USER_ID = process.env.BOT_USER_ID || '1420328163497607199'; // Application IDと同じ場合が多い

// AI対象ボタンの定義
const AI_TARGET_BUTTONS = {
  lesson_question: true,      // ③レッスン質問
  sns_consultation: true,     // ④SNS運用相談
  mission_submission: true    // ⑤ミッション提出
};

// n8n Webhook URL
const N8N_WEBHOOK_URL = 'https://kyo10310405.app.n8n.cloud/webhook/053be54b-55c7-4c3e-8eb7-4f9b6c63656d';

// 🆕 新しいスプレッドシート設定
const KNOWLEDGE_SPREADSHEET_ID = '16BO2pz7Wi36MKwxFZFo5YyaANzVfajkPkXtw1xtSJbQ';

// 🆕 API Keys設定（環境変数使用）
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Google APIs設定
let drive = null;
let sheets = null;
let docs = null;
let slides = null;
let auth = null;
let openai = null;

// 🖼️ 文書内画像保存用グローバル変数
let documentImages = [];

// 🔧 修正：Google認証オブジェクトの統一初期化
function initializeServices() {
  if (!auth && process.env.GOOGLE_CLIENT_EMAIL) {
    try {
      console.log('🔐 Google認証初期化開始...');
      
      // 🆕 統一認証オブジェクト作成
      auth = new google.auth.GoogleAuth({
        credentials: {
          type: 'service_account',
          project_id: process.env.GOOGLE_PROJECT_ID,
          private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          client_id: process.env.GOOGLE_CLIENT_ID,
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.GOOGLE_CLIENT_EMAIL?.replace('@', '%40')}`
        },
        // 🔧 修正：全必要スコープを追加
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/spreadsheets.readonly',
          'https://www.googleapis.com/auth/presentations.readonly',
          'https://www.googleapis.com/auth/documents.readonly'
        ]
      });

      // 🔧 修正：統一認証オブジェクトを使用してAPI初期化
      drive = google.drive({ version: 'v3', auth });
      sheets = google.sheets({ version: 'v4', auth });
      docs = google.docs({ version: 'v1', auth });
      slides = google.slides({ version: 'v1', auth });
      
      console.log('✅ Google APIs初期化成功');
      console.log('📊 Sheets API: Ready');
      console.log('💾 Drive API: Ready');
      console.log('📄 Docs API: Ready');
      console.log('📽️ Slides API: Ready');
      
    } catch (error) {
      console.error('❌ Google APIs初期化失敗:', error.message);
      console.error('詳細:', error);
    }
  }

  if (!openai && OPENAI_API_KEY) {
    try {
      const OpenAI = require('openai');
      openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      console.log('🤖 OpenAI初期化成功');
    } catch (error) {
      console.error('❌ OpenAI初期化失敗:', error.message);
    }
  }
}

// Discord署名検証関数
function verifyDiscordSignature(signature, timestamp, body, publicKey) {
  try {
    const timestampBuffer = Buffer.from(timestamp, 'utf8');
    const bodyBuffer = Buffer.from(body);
    const message = Buffer.concat([timestampBuffer, bodyBuffer]);
    
    const signatureBuffer = Buffer.from(signature, 'hex');
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    
    return nacl.sign.detached.verify(message, signatureBuffer, publicKeyBuffer);
  } catch (error) {
    console.error('署名検証エラー:', error);
    return false;
  }
}

// 🆕 メンション検出関数
function isBotMentioned(content, mentions) {
  if (!content || !mentions) return false;
  
  // メンション配列からBot IDを検索
  const botMentioned = mentions.some(mention => mention.id === BOT_USER_ID);
  
  // コンテンツ内でのメンション文字列チェック（バックアップ）
  const mentionInContent = content.includes(`<@${BOT_USER_ID}>`) || content.includes(`<@!${BOT_USER_ID}>`);
  
  console.log(`🏷️ メンション検出: ${botMentioned || mentionInContent ? 'あり' : 'なし'}`);
  console.log(`📝 メッセージ内容: "${content}"`);
  
  return botMentioned || mentionInContent;
}

// 🆕 メンションからコンテンツを抽出する関数
function extractContentFromMention(content) {
  if (!content) return '';
  
  // @わなみさん部分を除去
  let cleanContent = content
    .replace(new RegExp(`<@!?${BOT_USER_ID}>`, 'g'), '')
    .trim();
  
  console.log(`📝 メンション除去後: "${cleanContent}"`);
  return cleanContent;
}

// 🖼️ 新機能：画像添付検出関数
function hasImageAttachments(attachments) {
  if (!attachments || !Array.isArray(attachments)) return false;
  
  return attachments.some(attachment => {
    const isImage = attachment.content_type && attachment.content_type.startsWith('image/');
    if (isImage) {
      console.log(`🖼️ 画像添付検出: ${attachment.filename} (${attachment.content_type})`);
    }
    return isImage;
  });
}

// 🖼️ 新機能：画像URL抽出関数
function extractImageUrls(attachments) {
  if (!attachments || !Array.isArray(attachments)) return [];
  
  const imageUrls = attachments
    .filter(attachment => attachment.content_type && attachment.content_type.startsWith('image/'))
    .map(attachment => ({
      url: attachment.url,
      filename: attachment.filename,
      content_type: attachment.content_type,
      size: attachment.size
    }));
    
  console.log(`🖼️ 抽出された画像URL数: ${imageUrls.length}`);
  return imageUrls;
}

// Raw body parser for Discord webhook
app.use('/discord', express.raw({ type: 'application/json' }));
app.use(express.json());

// 🆕 スプレッドシートからURL一覧を読み込む関数
async function loadUrlListFromSpreadsheet() {
  try {
    if (!sheets) {
      console.log('❌ Google Sheets not initialized');
      return [];
    }

    console.log('📊 スプレッドシートからURL一覧読み込み開始...');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: KNOWLEDGE_SPREADSHEET_ID,
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

// 🖼️ 修正：Google Slides画像対応版
async function loadGoogleSlides(url, fileName) {
  try {
    if (!slides) {
      console.log('❌ Google Slides API not initialized');
      return `${fileName}: Google Slides API初期化エラー`;
    }

    console.log(`📽️ Google Slides読み込み開始（画像対応）: ${fileName}`);
    
    // URLからプレゼンテーションIDを抽出
    const match = url.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Slides URL format');
    }
    
    const presentationId = match[1];
    console.log(`🔍 Presentation ID: ${presentationId}`);
    
    const presentation = await slides.presentations.get({
      presentationId: presentationId,
    });

    let content = `${fileName}\n${'='.repeat(50)}\n`;
    let extractedImages = [];
    
    // 各スライドのテキストと画像を抽出
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
            
            // 🖼️ 画像処理追加
            if (element.image) {
              let imageUrl = null;
              
              // 画像URLの取得（複数のプロパティを確認）
              if (element.image.contentUrl) {
                imageUrl = element.image.contentUrl;
              } else if (element.image.sourceUrl) {
                imageUrl = element.image.sourceUrl;
              }
              
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
                documentImages.push(imageInfo);
                content += `\n[🖼️ 画像: ${imageInfo.description}]\n`;
                console.log(`🖼️ 画像検出: ${imageInfo.description} - ${imageUrl}`);
              }
            }
          });
        }
        content += '\n';
      });
    }
    
    // 画像情報を追記
    if (extractedImages.length > 0) {
      content += `\n\n--- 含まれる画像一覧 (${extractedImages.length}枚) ---\n`;
      extractedImages.forEach((img, index) => {
        content += `${index + 1}. ${img.description}\n   URL: ${img.url}\n`;
      });
    }

    console.log(`✅ Google Slides読み込み成功: ${fileName} (${content.length}文字, ${extractedImages.length}枚の画像)`);
    return content;

  } catch (error) {
    console.error(`❌ Google Slides読み込み失敗 ${fileName}:`, error.message);
    console.error('詳細:', error);
    return `${fileName}: 読み込みエラー - ${error.message}`;
  }
}

// 🖼️ 修正：Google Docs画像対応版
async function loadGoogleDocs(url, fileName) {
  try {
    if (!docs) {
      console.log('❌ Google Docs API not initialized');
      return `${fileName}: Google Docs API初期化エラー`;
    }

    console.log(`📄 Google Docs読み込み開始（画像対応）: ${fileName}`);
    
    // URLからドキュメントIDを抽出
    const match = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Docs URL format');
    }
    
    const documentId = match[1];
    console.log(`🔍 Document ID: ${documentId}`);
    
    const document = await docs.documents.get({
      documentId: documentId,
    });

    let content = `${fileName}\n${'='.repeat(50)}\n`;
    let extractedImages = [];
    
    // ドキュメントの内容を抽出
    if (document.data.body && document.data.body.content) {
      document.data.body.content.forEach((element, elementIndex) => {
        if (element.paragraph && element.paragraph.elements) {
          element.paragraph.elements.forEach(paragraphElement => {
            // テキスト処理
            if (paragraphElement.textRun && paragraphElement.textRun.content) {
              content += paragraphElement.textRun.content;
            }
            
            // 🖼️ 画像処理追加
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
                    documentImages.push(imageInfo);
                    content += `\n[🖼️ 画像: ${imageInfo.description}]\n`;
                    console.log(`🖼️ 画像検出: ${imageInfo.description} - ${imageUrl}`);
                  }
                }
              }
            }
          });
        }
      });
    }
    
    // 画像情報を追記
    if (extractedImages.length > 0) {
      content += `\n\n--- 含まれる画像一覧 (${extractedImages.length}枚) ---\n`;
      extractedImages.forEach((img, index) => {
        content += `${index + 1}. ${img.description}\n   URL: ${img.url}\n`;
      });
    }

    console.log(`✅ Google Docs読み込み成功: ${fileName} (${content.length}文字, ${extractedImages.length}枚の画像)`);
    return content;

  } catch (error) {
    console.error(`❌ Google Docs読み込み失敗 ${fileName}:`, error.message);
    console.error('詳細:', error);
    return `${fileName}: 読み込みエラー - ${error.message}`;
  }
}

// 🖼️ 修正：Notion画像対応版
async function loadNotionContent(url, fileName) {
  try {
    console.log(`📝 Notion読み込み開始（画像対応）: ${fileName}`);
    
    // NotionのページIDを抽出
    const pageIdMatch = url.match(/([a-f0-9]{32}|[a-f0-9-]{36})/);
    if (!pageIdMatch) {
      throw new Error('Invalid Notion URL format - Page ID not found');
    }
    
    const pageId = pageIdMatch[0].replace(/-/g, '');
    console.log(`🔍 Notion Page ID: ${pageId}`);
    
    // Notion APIを使わずに公開ページをスクレイピング
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      }
    });
    
    const html = response.data;
    let extractedImages = [];
    
    // 🖼️ 画像URLを抽出
    const imgMatches = html.match(/<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi);
    if (imgMatches) {
      imgMatches.forEach((imgTag, index) => {
        const srcMatch = imgTag.match(/src=['"]([^'"]+)['"]/);
        if (srcMatch) {
          let imageUrl = srcMatch[1];
          
          // 相対URLを絶対URLに変換
          if (imageUrl.startsWith('/')) {
            imageUrl = new URL(imageUrl, url).href;
          }
          
          // Notionの画像URLを処理
          if (imageUrl.includes('notion') || imageUrl.includes('amazonaws.com')) {
            const imageInfo = {
              source: 'notion',
              fileName: fileName,
              position: index + 1,
              url: imageUrl,
              description: `${fileName} - Notion画像${index + 1}`,
              type: 'embedded_image'
            };
            
            extractedImages.push(imageInfo);
            documentImages.push(imageInfo);
            console.log(`🖼️ 画像検出: ${imageInfo.description} - ${imageUrl}`);
          }
        }
      });
    }
    
    // Notionページのタイトルを抽出
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(' | Notion', '').trim() : fileName;
    
    // Notionの特殊なHTML構造からテキストを抽出（画像参照付き）
    let textContent = html
      // スクリプトとスタイルを除去
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      // 画像タグを参照テキストに変換
      .replace(/<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi, (match, src) => {
        const imageIndex = extractedImages.findIndex(img => img.url === src || src.includes(img.url.split('?')[0]));
        if (imageIndex >= 0) {
          return `\n[🖼️ 画像: ${extractedImages[imageIndex].description}]\n`;
        }
        return '\n[🖼️ 画像]\n';
      })
      // Notionの特殊なクラスを持つ要素を重視
      .replace(/<div[^>]*class="[^"]*notion-page-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, '$1')
      .replace(/<div[^>]*class="[^"]*notion-text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi, '$1\n')
      .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n## $1\n')
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '• $1\n')
      .replace(/<br[^>]*>/gi, '\n')
      // HTMLタグを除去
      .replace(/<[^>]*>/g, ' ')
      // HTMLエンティティをデコード
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      // 余分な空白を整理
      .replace(/\s+/g, ' ')
      .trim();
    
    // 長すぎる場合は制限
    if (textContent.length > 8000) {
      textContent = textContent.substring(0, 8000) + '\n\n... (長いコンテンツのため一部省略)';
    }
    
    let content = `${fileName}\n${'='.repeat(50)}\n`;
    content += `タイトル: ${title}\n`;
    content += `Notion URL: ${url}\n`;
    content += `種類: Notionページ\n\n`;
    content += textContent;
    
    // 画像情報を追記
    if (extractedImages.length > 0) {
      content += `\n\n--- 含まれる画像一覧 (${extractedImages.length}枚) ---\n`;
      extractedImages.forEach((img, index) => {
        content += `${index + 1}. ${img.description}\n   URL: ${img.url}\n`;
      });
    }
    
    console.log(`✅ Notion読み込み成功: ${fileName} (${content.length}文字, ${extractedImages.length}枚の画像)`);
    return content;

  } catch (error) {
    console.error(`❌ Notion読み込み失敗 ${fileName}:`, error.message);
    
    // フォールバック: 基本的なWebサイト読み込みを試行
    console.log(`🔄 Notionフォールバック: 基本WEBサイト読み込みを試行`);
    try {
      return await loadWebsiteContent(url, fileName);
    } catch (fallbackError) {
      return `${fileName}: Notion読み込みエラー - ${error.message}（フォールバックも失敗: ${fallbackError.message}）`;
    }
  }
}

// 🖼️ 修正：汎用WEBサイト画像対応版
async function loadWebsiteContent(url, fileName) {
  try {
    console.log(`🌐 WEBサイト読み込み開始（画像対応）: ${fileName}`);
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // HTMLから主要なテキストコンテンツを抽出
    const html = response.data;
    let extractedImages = [];
    
    // 🖼️ 画像URLを抽出
    const imgMatches = html.match(/<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi);
    if (imgMatches) {
      imgMatches.forEach((imgTag, index) => {
        const srcMatch = imgTag.match(/src=['"]([^'"]+)['"]/);
        if (srcMatch) {
          let imageUrl = srcMatch[1];
          
          // 相対URLを絶対URLに変換
          if (imageUrl.startsWith('/')) {
            imageUrl = new URL(imageUrl, url).href;
          } else if (imageUrl.startsWith('./')) {
            imageUrl = new URL(imageUrl.substring(2), url).href;
          } else if (!imageUrl.startsWith('http')) {
            imageUrl = new URL(imageUrl, url).href;
          }
          
          // 有効な画像URLのみを追加
          if (imageUrl.startsWith('http') && imageUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i)) {
            const imageInfo = {
              source: 'website',
              fileName: fileName,
              position: index + 1,
              url: imageUrl,
              description: `${fileName} - WEB画像${index + 1}`,
              type: 'embedded_image'
            };
            
            extractedImages.push(imageInfo);
            documentImages.push(imageInfo);
            console.log(`🖼️ 画像検出: ${imageInfo.description} - ${imageUrl}`);
          }
        }
      });
    }
    
    // タイトル抽出
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : fileName;
    
    // metaディスクリプション抽出
    const descMatch = html.match(/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"']+)["\'][^>]*>/i);
    const description = descMatch ? descMatch[1].trim() : '';
    
    // 基本的なHTMLタグを除去してテキストを抽出（画像参照付き）
    let textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      // 画像タグを参照テキストに変換
      .replace(/<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi, (match, src) => {
        const imageIndex = extractedImages.findIndex(img => img.url === src);
        if (imageIndex >= 0) {
          return `\n[🖼️ 画像: ${extractedImages[imageIndex].description}]\n`;
        }
        return '\n[🖼️ 画像]\n';
      })
      .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n## $1\n')
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '• $1\n')
      .replace(/<br[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // 長すぎる場合は最初の部分のみ使用
    if (textContent.length > 5000) {
      textContent = textContent.substring(0, 5000) + '\n\n... (長いコンテンツのため一部省略)';
    }
    
    let content = `${fileName}\n${'='.repeat(50)}\n`;
    content += `タイトル: ${title}\n`;
    if (description) {
      content += `概要: ${description}\n`;
    }
    content += `URL: ${url}\n`;
    content += `種類: WEBサイト\n\n`;
    content += textContent;
    
    // 画像情報を追記
    if (extractedImages.length > 0) {
      content += `\n\n--- 含まれる画像一覧 (${extractedImages.length}枚) ---\n`;
      extractedImages.forEach((img, index) => {
        content += `${index + 1}. ${img.description}\n   URL: ${img.url}\n`;
      });
    }
    
    console.log(`✅ WEBサイト読み込み成功: ${fileName} (${content.length}文字, ${extractedImages.length}枚の画像)`);
    return content;

  } catch (error) {
    console.error(`❌ WEBサイト読み込み失敗 ${fileName}:`, error.message);
    return `${fileName}: WEBサイト読み込みエラー - ${error.message}`;
  }
}

// 🖼️ 画像URL情報取得関数
async function loadImageUrlInfo(url, fileName) {
  try {
    console.log(`🖼️ 画像URL情報取得: ${fileName}`);
    
    // 画像URLの場合はメタデータのみ取得
    const response = await axios.head(url, {
      timeout: 5000
    });
    
    const contentType = response.headers['content-type'] || 'unknown';
    const contentLength = response.headers['content-length'] || 'unknown';
    
    // 直接画像URLもdocumentImagesに追加
    const imageInfo = {
      source: 'direct_url',
      fileName: fileName,
      url: url,
      description: `${fileName} - 直接画像URL`,
      type: 'direct_image'
    };
    
    documentImages.push(imageInfo);
    console.log(`🖼️ 直接画像URL追加: ${imageInfo.description} - ${url}`);
    
    let content = `${fileName}\n${'='.repeat(50)}\n`;
    content += `種類: 画像ファイル\n`;
    content += `URL: ${url}\n`;
    content += `ファイル形式: ${contentType}\n`;
    content += `ファイルサイズ: ${contentLength} bytes\n\n`;
    content += `【AI画像解析対応】\nこの画像は、質問時に画像として添付された場合、AI が詳細に分析して回答します。\n`;
    content += `画像の内容、技術的な問題、改善点などを具体的に指摘できます。\n\n`;
    content += `--- 含まれる画像一覧 (1枚) ---\n`;
    content += `1. ${imageInfo.description}\n   URL: ${imageInfo.url}\n`;
    
    console.log(`✅ 画像URL情報取得成功: ${fileName}`);
    return content;

  } catch (error) {
    console.error(`❌ 画像URL情報取得失敗 ${fileName}:`, error.message);
    return `${fileName}: 画像アクセスエラー - ${error.message}`;
  }
}

// 🔧 修正：URL先のコンテンツを読み込む関数（画像対応版）
async function loadContentFromUrl(urlInfo) {
  const { url, fileName, category, type } = urlInfo;
  
  try {
    // Google Slides
    if (url.includes('docs.google.com/presentation')) {
      return await loadGoogleSlides(url, fileName);
    } 
    // Google Docs
    else if (url.includes('docs.google.com/document')) {
      return await loadGoogleDocs(url, fileName);
    } 
    // 🖼️ Notion対応（画像付き）
    else if (url.includes('notion.so') || url.includes('notion.site')) {
      return await loadNotionContent(url, fileName);
    }
    // 🖼️ 画像URL検出
    else if (url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i) || 
             url.includes('cdn.discordapp.com') ||
             url.includes('drive.google.com/file')) {
      return await loadImageUrlInfo(url, fileName);
    }
    // 🖼️ 一般WEBサイト（画像付き）
    else if (url.startsWith('http://') || url.startsWith('https://')) {
      return await loadWebsiteContent(url, fileName);
    }
    // 未対応形式
    else {
      console.log(`❓ 未知のURL形式: ${fileName}`);
      return `${fileName}: 未対応のURL形式 - ${url}`;
    }
  } catch (error) {
    console.error(`❌ コンテンツ読み込み失敗 ${fileName}:`, error.message);
    return `${fileName}: 読み込みエラー - ${error.message}`;
  }
}

// 🖼️ 修正：統合知識ベース構築関数（画像対応版）
async function buildKnowledgeBase() {
  try {
    console.log('📚 知識ベース構築開始（画像対応版）...');
    
    // 🖼️ 前回の文書内画像をクリア
    documentImages = [];
    
    const urlList = await loadUrlListFromSpreadsheet();
    if (urlList.length === 0) {
      console.log('❌ スプレッドシートにURLが見つかりません');
      return null;
    }

    let knowledgeBase = 'VTuber育成スクール - わなみさん 知識ベース（画像対応版）\n';
    knowledgeBase += '='.repeat(80) + '\n\n';

    // 各URLの内容を読み込み
    for (const urlInfo of urlList) {
      console.log(`📖 読み込み中: ${urlInfo.fileName}`);
      const content = await loadContentFromUrl(urlInfo);
      knowledgeBase += `\n\n${content}\n`;
      
      // APIレート制限対策で少し待機
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 🖼️ 総画像数を追記
    const totalImages = documentImages.length;
    knowledgeBase += `\n\n${'='.repeat(80)}\n`;
    knowledgeBase += `📚 知識ベース統計\n`;
    knowledgeBase += `- 総文字数: ${knowledgeBase.length}\n`;
    knowledgeBase += `- 含まれる画像総数: ${totalImages}枚\n`;
    
    if (totalImages > 0) {
      knowledgeBase += `\n🖼️ 全文書画像一覧:\n`;
      documentImages.forEach((img, index) => {
        knowledgeBase += `${index + 1}. ${img.description} (${img.source})\n`;
      });
    }

    console.log(`✅ 知識ベース構築完了 - 総文字数: ${knowledgeBase.length}, 画像数: ${totalImages}`);
    return knowledgeBase;

  } catch (error) {
    console.error('❌ 知識ベース構築エラー:', error);
    return null;
  }
}

// 🖼️ 新機能：文書内画像も含むメンションAI回答生成関数
async function generateMentionAIResponseWithImages(question, imageUrls, userInfo) {
  try {
    console.log(`🤖🖼️ 文書画像対応メンションAI回答生成開始`);
    console.log(`📝 ユーザー: ${userInfo.username}`);
    console.log(`💬 質問: ${question}`);
    console.log(`🖼️ ユーザー画像数: ${imageUrls.length}`);
    console.log(`📚 文書内画像数: ${documentImages.length}`);
    
    if (!openai) {
      console.log('❌ OpenAI not initialized');
      return 'すみません、現在AI回答システムに問題が発生しています。担任の先生にご相談ください。';
    }

    // 知識ベース読み込み
    const knowledgeBase = await buildKnowledgeBase();
    
    if (!knowledgeBase) {
      return 'すみません、現在知識ベースにアクセスできません。担任の先生に直接ご相談ください。';
    }

    // 🖼️ 文書画像対応システムプロンプト
    const systemPrompt = `あなたはVTuber育成スクール「わなみさん」の専門AIアシスタントです。

以下の知識ベースを参考に、生徒からの質問に親切で具体的な回答をしてください。

【知識ベース】
${knowledgeBase}

【文書内画像対応回答ルール】
- 添付された画像の内容を詳細に分析してください
- 知識ベース内の文書に含まれる関連画像も参考にしてください
- 文書内画像と質問画像を比較・関連付けて説明してください
- 画像に基づいた具体的なアドバイスやフィードバックを提供してください
- 配信設定、デザイン、SNS投稿など、VTuber活動に関連する画像は特に詳しく解説してください
- 丁寧で親しみやすい口調で回答してください
- 具体的で実用的なアドバイスを提供してください
- 絵文字を適度に使用してください
- 1000文字以内で簡潔にまとめてください
- 知識ベースにない内容は「担任の先生にご相談ください」と案内してください`;

    // 🖼️ メッセージ配列を構築（文書画像対応）
    const messages = [
      { role: "system", content: systemPrompt }
    ];

    // ユーザーメッセージに画像を含める
    const userMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: `${question || "この画像について教えてください"}\n\n【参考情報】知識ベースには${documentImages.length}枚の関連画像が含まれています。`
        }
      ]
    };

    // ユーザー添付画像を追加（優先度高）
    imageUrls.forEach(imageInfo => {
      userMessage.content.push({
        type: "image_url",
        image_url: {
          url: imageInfo.url,
          detail: "high" // 高解像度で分析
        }
      });
      console.log(`🖼️ ユーザー画像追加: ${imageInfo.filename}`);
    });

    // 🆕 文書内画像も追加（最大5枚まで、関連性の高いものを優先）
    const relevantDocImages = documentImages
      .filter(img => img.url && img.url.startsWith('http'))
      .slice(0, 5); // 最大5枚まで
    
    relevantDocImages.forEach(imageInfo => {
      userMessage.content.push({
        type: "image_url",
        image_url: {
          url: imageInfo.url,
          detail: "medium" // 中解像度で参考として
        }
      });
      console.log(`📚 文書画像追加: ${imageInfo.description}`);
    });

    messages.push(userMessage);

    // OpenAI API呼び出し（GPT-4 Vision）
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // 画像対応モデル
      messages: messages,
      max_tokens: 2000,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;
    console.log('✅ 文書画像対応メンションAI回答生成完了');
    
    return aiResponse;

  } catch (error) {
    console.error('❌ 文書画像対応メンションAI回答生成エラー:', error.message);
    
    return `申し訳ございません！現在画像解析AI機能に問題が発生しています🙏

画像の内容について詳しくお聞かせいただけますか？
または担任の先生に直接ご相談ください。

ご不便をおかけして申し訳ありません💦`;
  }
}

// 🆕 メンション対応AI回答生成関数（文書画像対応版に更新）
async function generateMentionAIResponse(question, userInfo, imageUrls = []) {
  // 🖼️ 画像がある場合または文書内画像がある場合は画像対応版を使用
  if ((imageUrls && imageUrls.length > 0) || documentImages.length > 0) {
    return await generateMentionAIResponseWithImages(question, imageUrls, userInfo);
  }

  // 以下は従来のテキストのみ版
  try {
    console.log(`🤖 メンションAI回答生成開始`);
    console.log(`📝 ユーザー: ${userInfo.username}`);
    console.log(`💬 質問: ${question}`);
    
    if (!openai) {
      console.log('❌ OpenAI not initialized');
      return 'すみません、現在AI回答システムに問題が発生しています。担任の先生にご相談ください。';
    }

    // 知識ベース読み込み
    const knowledgeBase = await buildKnowledgeBase();
    
    if (!knowledgeBase) {
      return 'すみません、現在知識ベースにアクセスできません。担任の先生に直接ご相談ください。';
    }

    // メンション対応システムプロンプト
    const systemPrompt = `あなたはVTuber育成スクール「わなみさん」の専門AIアシスタントです。

以下の知識ベースを参考に、生徒からの質問に親切で具体的な回答をしてください。

【知識ベース】
${knowledgeBase}

【回答ルール】
- 丁寧で親しみやすい口調で回答してください
- 具体的で実用的なアドバイスを提供してください
- 絵文字を適度に使用してください
- 500文字以内で簡潔にまとめてください
- 知識ベースにない内容は「担任の先生にご相談ください」と案内してください
- レッスン、SNS運用、ミッション提出など幅広い質問に対応してください
- 質問の内容に応じて適切なカテゴリで回答してください`;

    // OpenAI API呼び出し
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;
    console.log('✅ メンションAI回答生成完了');
    
    return aiResponse;

  } catch (error) {
    console.error('❌ メンションAI回答生成エラー:', error.message);
    
    return `申し訳ございません！現在AI機能に問題が発生しています🙏

お急ぎの場合は、担任の先生に直接ご相談ください。
しばらく時間をおいてからもう一度お試いいただけますか？

ご不便をおかけして申し訳ありません💦`;
  }
}

// 🖼️ 新機能：文書画像対応専門AI回答生成関数
async function generateAIResponseWithImages(question, buttonType, imageUrls, userInfo) {
  try {
    console.log(`🤖🖼️ 文書画像対応専門AI回答生成開始: ${buttonType}`);
    console.log(`📝 ユーザー: ${userInfo.username}`);
    console.log(`💬 質問: ${question}`);
    console.log(`🖼️ ユーザー画像数: ${imageUrls.length}`);
    console.log(`📚 文書内画像数: ${documentImages.length}`);
    
    if (!openai) {
      console.log('❌ OpenAI not initialized');
      return 'すみません、現在AI回答システムに問題が発生しています。担任の先生にご相談ください。';
    }

    // 知識ベース読み込み
    const knowledgeBase = await buildKnowledgeBase();
    
    if (!knowledgeBase) {
      return 'すみません、現在知識ベースにアクセスできません。担任の先生に直接ご相談ください。';
    }

    // ボタンタイプ別システムプロンプト（文書画像対応版）
    let systemPrompt = `あなたはVTuber育成スクール「わなみさん」の専門AIアシスタントです。

以下の知識ベースを参考に、生徒からの質問に親切で具体的な回答をしてください。

【知識ベース】
${knowledgeBase}

【文書内画像対応回答ルール】
- 添付された画像の内容を詳細に分析してください
- 知識ベース内の文書に含まれる関連画像も参考にしてください
- 文書内画像と質問画像を比較・関連付けて説明してください
- 画像に基づいた具体的なアドバイスやフィードバックを提供してください
- 画像の技術的な問題があれば指摘し、改善方法を提案してください
- 丁寧で親しみやすい口調で回答してください
- 具体的で実用的なアドバイスを提供してください
- 絵文字を適度に使用してください
- 1000文字以内で簡潔にまとめてください
- 知識ベースにない内容は「担任の先生にご相談ください」と案内してください`;

    switch (buttonType) {
      case 'lesson_question':
        systemPrompt += `\n\n【特別指示：レッスン質問 + 文書画像分析】
- レッスン内容に関する質問として回答してください
- 画像が配信設定やソフトウェア画面の場合、設定方法を詳しく説明してください
- 文書内の関連図表や画像と比較して説明してください
- 技術的な内容は段階的に説明してください
- 画像に写っているエラーや問題があれば解決方法を提案してください`;
        break;
        
      case 'sns_consultation':
        systemPrompt += `\n\n【特別指示：SNS運用相談 + 文書画像分析】
- X(Twitter)やYouTubeの運用に関する相談として回答してください
- 画像がSNS投稿、サムネイル、デザインの場合、改善点を具体的に指摘してください
- 文書内の成功例画像と比較して分析してください
- フォロワー獲得やエンゲージメント向上の観点から画像を評価してください
- デザインの改善点や魅力的な要素について言及してください`;
        break;
        
      case 'mission_submission':
        systemPrompt += `\n\n【特別指示：ミッション提出 + 文書画像分析】
- ミッション提出に関する質問として回答してください
- 画像がミッション成果物の場合、詳細なフィードバックを提供してください
- 文書内の課題例や参考画像と比較して評価してください
- 良い点を褒めつつ、改善可能な部分も建設的に指摘してください
- 次のステップや発展的なアドバイスを含めてください`;
        break;
    }

    // 🖼️ メッセージ配列を構築（文書画像対応）
    const messages = [
      { role: "system", content: systemPrompt }
    ];

    // ユーザーメッセージに画像を含める
    const userMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: `${question || "この画像について教えてください"}\n\n【参考情報】知識ベースには${documentImages.length}枚の関連画像が含まれています。`
        }
      ]
    };

    // ユーザー添付画像を追加（優先度高）
    imageUrls.forEach(imageInfo => {
      userMessage.content.push({
        type: "image_url",
        image_url: {
          url: imageInfo.url,
          detail: "high" // 高解像度で分析
        }
      });
    });

    // 🆕 文書内画像も追加（最大5枚まで）
    const relevantDocImages = documentImages
      .filter(img => img.url && img.url.startsWith('http'))
      .slice(0, 5);
    
    relevantDocImages.forEach(imageInfo => {
      userMessage.content.push({
        type: "image_url",
        image_url: {
          url: imageInfo.url,
          detail: "medium"
        }
      });
      console.log(`📚 文書画像追加: ${imageInfo.description}`);
    });

    messages.push(userMessage);

    // OpenAI API呼び出し（GPT-4 Vision）
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // 画像対応モデル
      messages: messages,
      max_tokens: 2000,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;
    console.log('✅ 文書画像対応専門AI回答生成完了');
    
    return aiResponse;

  } catch (error) {
    console.error('❌ 文書画像対応専門AI回答生成エラー:', error.message);
    
    return `申し訳ございません！現在画像解析AI機能に問題が発生しています🙏

画像の内容について詳しくお聞かせいただけますか？
または担任の先生に直接ご相談ください。

ご不便をおかけして申し訳ありません💦`;
  }
}

// 🆕 専門AI回答生成関数（知識ベース統合版）- ボタン対応（文書画像対応版に更新）
async function generateAIResponse(question, buttonType, userInfo, imageUrls = []) {
  // 🖼️ 画像がある場合または文書内画像がある場合は画像対応版を使用
  if ((imageUrls && imageUrls.length > 0) || documentImages.length > 0) {
    return await generateAIResponseWithImages(question, buttonType, imageUrls, userInfo);
  }

  // 以下は従来のテキストのみ版
  try {
    console.log(`🤖 専門AI回答生成開始: ${buttonType}`);
    console.log(`📝 ユーザー: ${userInfo.username}`);
    console.log(`💬 質問: ${question}`);
    
    if (!openai) {
      console.log('❌ OpenAI not initialized');
      return 'すみません、現在AI回答システムに問題が発生しています。担任の先生にご相談ください。';
    }

    // 知識ベース読み込み
    const knowledgeBase = await buildKnowledgeBase();
    
    if (!knowledgeBase) {
      return 'すみません、現在知識ベースにアクセスできません。担任の先生に直接ご相談ください。';
    }

    // レッスン番号抽出
    const lessonMatch = question.match(/レッスン?\s*(\d+)/i) || question.match(/Lesson\s*(\d+)/i);
    const lessonNumber = lessonMatch ? parseInt(lessonMatch[1]) : null;

    // ボタンタイプ別システムプロンプト
    let systemPrompt = `あなたはVTuber育成スクール「わなみさん」の専門AIアシスタントです。

以下の知識ベースを参考に、生徒からの質問に親切で具体的な回答をしてください。

【知識ベース】
${knowledgeBase}

【回答ルール】
- 丁寧で親しみやすい口調で回答してください
- 具体的で実用的なアドバイスを提供してください
- 絵文字を適度に使用してください
- 500文字以内で簡潔にまとめてください
- 知識ベースにない内容は「担任の先生にご相談ください」と案内してください`;

    switch (buttonType) {
      case 'lesson_question':
        systemPrompt += `\n\n【特別指示：レッスン質問】
- レッスン内容に関する質問として回答してください
- 該当するレッスン番号があれば具体的に案内してください
- 技術的な内容は段階的に説明してください`;
        break;
        
      case 'sns_consultation':
        systemPrompt += `\n\n【特別指示：SNS運用相談】
- X(Twitter)やYouTubeの運用に関する相談として回答してください
- 具体的な戦略やコツを提供してください
- フォロワー獲得やエンゲージメント向上のアドバイスを含めてください`;
        break;
        
      case 'mission_submission':
        systemPrompt += `\n\n【特別指示：ミッション提出】
- ミッション提出に関する質問として回答してください
- 取り組み方や提出方法について説明してください
- 建設的で励ましのフィードバックを提供してください`;
        break;
    }

    // OpenAI API呼び出し
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;
    console.log('✅ 専門AI回答生成完了');
    
    return aiResponse;

  } catch (error) {
    console.error('❌ 専門AI回答生成エラー:', error.message);
    
    return `申し訳ございません！現在AI機能に問題が発生しています🙏

お急ぎの場合は、担任の先生に直接ご相談ください。
しばらく時間をおいてからもう一度お試いいただけますか？

ご不便をおかけして申し訳ありません💦`;
  }
}

// AI応答ボタンの質問入力要求メッセージ（文書画像対応版に更新）
const AI_QUESTION_PROMPTS = {
  lesson_question: {
    title: "📚 レッスンについての質問",
    content: `**レッスンに関するご質問をお聞かせください！**

🔹 **質問例**
• 「外向きの配信とはどんな配信ですか？」
• 「配信で音声が聞こえない時の対処法は？」
• 「デザイン4原則について教えてください」

💡 **質問のコツ**
• 具体的な状況や症状を教えてください
• 使用しているソフトウェア名があれば記載してください
• エラーメッセージがあれば教えてください
• レッスン番号を記載してください
• 🖼️ **画像添付可能**：配信設定画面やエラー画面があれば添付してください

📚 **知識ベース内の関連画像も自動で参考にします！**

**📝 この下にあなたの質問を入力してください ⬇️**
※質問内容は1分以内に送信してください！
　回答まで1分半ほどかかります！`
  },
  
  sns_consultation: {
    title: "📱 SNS運用のご相談",
    content: `**SNS運用に関するご相談をお聞かせください！**

🔹 **相談例**
• 「Xでフォロワーを増やすコツは？」
• 「YouTube配信の企画アイデアを教えて」

💡 **相談のコツ**
• 現在のフォロワー数や状況を教えてください
• 目標（フォロワー数、再生数など）があれば記載してください
• 困っている具体的な内容を詳しく書いてください
• XアカウントやチャンネルURLを教えていただけるとより良いアドバイスができる可能性があります
• 🖼️ **画像添付可能**：サムネイル、投稿画像、アナリティクス画面など添付してください

📚 **知識ベース内の関連画像も自動で参考にします！**

**📝 この下にあなたのご相談内容を入力してください ⬇️**
※質問内容は1分以内に送信してください！
　回答まで1分半ほどかかります！`
  },
  
  mission_submission: {
    title: "🎯 ミッションの提出",
    content: `**ミッション提出に関してお聞かせください！**

🔹 **提出・相談例**
• 「レッスン〇のミッションを完了しました」
• 「レッスン〇のミッションのフィードバックください」

💡 **記載のコツ**
• レッスン番号を記載してください
• 完了報告の場合は取り組み内容を教えてください
• 質問の場合は具体的に何に困っているか書いてください
• 🖼️ **画像添付可能**：成果物のスクリーンショット、作業画面など添付してください

📚 **知識ベース内の関連画像も自動で参考にします！**

**📝 この下にミッション関連の内容を入力してください ⬇️**
※質問内容は1分以内に送信してください！　回答まで1分半ほどかかります！`
  }
};

// 🖼️ 新機能：メンション対応n8n送信関数（画像対応版）
async function sendMentionToN8N(interaction, questionText, imageUrls = []) {
  try {
    const payload = {
      button_id: 'mention_direct',
      user_id: interaction.author?.id || interaction.user?.id,
      username: interaction.author?.username || interaction.user?.username,
      guild_id: interaction.guild_id,
      channel_id: interaction.channel?.id || interaction.channel_id,
      timestamp: new Date().toISOString(),
      ai_request: true,
      phase: 'mention_direct',
      question_text: questionText,
      knowledge_base_ready: true,
      trigger_type: 'mention',
      // 🖼️ 画像情報を追加
      has_images: imageUrls.length > 0,
      image_count: imageUrls.length,
      image_urls: imageUrls,
      // 🆕 文書内画像情報を追加
      document_images_count: documentImages.length,
      has_document_images: documentImages.length > 0
    };

    console.log('🚀 n8nにメンションAI処理依頼送信中:', payload);
    
    const response = await axios.post(N8N_WEBHOOK_URL, payload, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ n8nメンション送信成功:', response.status);
  } catch (error) {
    console.error('❌ n8nメンション送信エラー:', error.message);
  }
}

// 🖼️ 新機能：n8n Webhookにデータ送信する関数（画像対応版）
async function sendToN8N(buttonId, interaction, questionText = null, imageUrls = []) {
  try {
    const payload = {
      button_id: buttonId,
      user_id: interaction.user?.id || interaction.member?.user?.id,
      username: interaction.user?.username || interaction.member?.user?.username,
      guild_id: interaction.guild_id,
      channel_id: interaction.channel_id,
      timestamp: new Date().toISOString(),
      ai_request: true,
      phase: questionText ? '2_with_question' : '1.5_prompt_only',
      question_text: questionText,
      knowledge_base_ready: true,
      // 🖼️ 画像情報を追加
      has_images: imageUrls.length > 0,
      image_count: imageUrls.length,
      image_urls: imageUrls,
      // 🆕 文書内画像情報を追加
      document_images_count: documentImages.length,
      has_document_images: documentImages.length > 0
    };

    console.log('🚀 n8nにAI処理依頼送信中:', payload);
    
    const response = await axios.post(N8N_WEBHOOK_URL, payload, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ n8n送信成功:', response.status);
  } catch (error) {
    console.error('❌ n8n送信エラー:', error.message);
  }
}

// ボタン応答生成関数（従来通り）
function generateButtonResponse(customId, interaction = null) {
  if (AI_TARGET_BUTTONS[customId]) {
    console.log(`🤖 AI処理対象ボタン: ${customId} - 質問入力要求`);
    
    if (interaction) {
      sendToN8N(customId, interaction).catch(error => {
        console.error('n8n送信失敗:', error);
      });
    }
    
    const promptData = AI_QUESTION_PROMPTS[customId];
    return {
      type: 4,
      data: {
        content: `✨ **${promptData.title}** ✨\n\n${promptData.content}`
      }
    };
  }

  switch (customId) {
    case 'payment_consultation':
      return {
        type: 4,
        data: {
          content: "申し訳ございません。お支払いに関してはここでは相談できません。\n💡 **管理者の方へ**：ここに適切な担当者のメンションを設定してください。\n\n例：<@USER_ID>にご相談ください。"
        }
      };
    
    case 'private_consultation':
      return {
        type: 4,
        data: {
          content: "申し訳ございません。プライベートなご相談については\nここでは回答できません。\n\n🎓 **担任の先生に直接ご相談ください。**"
        }
      };
    
    default:
      return {
        type: 4,
        data: {
          content: "❌ 申し訳ございません。認識できない選択肢です。\n再度メニューから選択してください。"
        }
      };
  }
}

// 🖼️ 新機能：メンション対応AI処理リクエスト受信エンドポイント（文書画像対応版）
app.post('/ai-process-mention', async (req, res) => {
  console.log('🏷️ メンションAI処理リクエスト受信（文書画像対応）:', req.body);
  
  try {
    // サービス初期化
    initializeServices();
    
    const { message_content, user_id, username, image_urls = [] } = req.body;
    
    if (!message_content && (!image_urls || image_urls.length === 0)) {
      return res.json({ error: '質問テキストまたは画像が必要です' });
    }
    
    // 🖼️ 文書画像対応メンションAI回答生成
    const aiResponse = await generateMentionAIResponse(message_content, {
      id: user_id,
      username: username
    }, image_urls);
    
    console.log('✅ メンションAI回答生成完了（文書画像対応）');
    
    res.json({
      success: true,
      ai_response: aiResponse,
      processed_at: new Date().toISOString(),
      knowledge_base_used: true,
      trigger_type: 'mention',
      has_images: image_urls.length > 0,
      image_count: image_urls.length,
      document_images_count: documentImages.length,
      has_document_images: documentImages.length > 0
    });
    
  } catch (error) {
    console.error('❌ メンションAI処理エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🖼️ 新機能：専門AI処理リクエスト受信エンドポイント（文書画像対応版）
app.post('/ai-process', async (req, res) => {
  console.log('🤖 専門AI処理リクエスト受信（文書画像対応）:', req.body);
  
  try {
    // サービス初期化
    initializeServices();
    
    const { button_id, message_content, user_id, username, image_urls = [] } = req.body;
    
    if (!message_content && (!image_urls || image_urls.length === 0)) {
      return res.json({ error: '質問テキストまたは画像が必要です' });
    }
    
    // 🖼️ 文書画像対応専門AI回答生成
    const aiResponse = await generateAIResponse(message_content, button_id, {
      id: user_id,
      username: username
    }, image_urls);
    
    console.log('✅ 専門AI回答生成完了（文書画像対応）');
    
    res.json({
      success: true,
      ai_response: aiResponse,
      processed_at: new Date().toISOString(),
      knowledge_base_used: true,
      has_images: image_urls.length > 0,
      image_count: image_urls.length,
      document_images_count: documentImages.length,
      has_document_images: documentImages.length > 0
    });
    
  } catch (error) {
    console.error('❌ 専門AI処理エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔧 修正：知識ベーステスト用エンドポイント（文書画像対応情報追加）
app.get('/test-knowledge-base', async (req, res) => {
  try {
    initializeServices();
    
    // 各APIの初期化状態確認
    const apiStatus = {
      auth_initialized: !!auth,
      sheets_initialized: !!sheets,
      drive_initialized: !!drive,
      docs_initialized: !!docs,
      slides_initialized: !!slides
    };
    
    console.log('🔍 API初期化状態:', apiStatus);
    
    const knowledgeBase = await buildKnowledgeBase();
    const urlList = await loadUrlListFromSpreadsheet();
    
    res.json({
      success: !!knowledgeBase,
      urls_found: urlList.length,
      knowledge_base_length: knowledgeBase ? knowledgeBase.length : 0,
      preview: knowledgeBase ? knowledgeBase.substring(0, 1000) : null,
      url_list: urlList.slice(0, 5), // 最初の5個のURL情報
      api_status: apiStatus,
      // 🆕 文書内画像情報追加
      document_images_count: documentImages.length,
      document_images_sample: documentImages.slice(0, 3).map(img => ({
        source: img.source,
        description: img.description,
        type: img.type
      })),
      environment_vars: {
        google_project_id: process.env.GOOGLE_PROJECT_ID ? 'Set' : 'Not Set',
        google_client_email: process.env.GOOGLE_CLIENT_EMAIL || 'Not Set',
        google_private_key_length: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.length : 0
      }
    });
  } catch (error) {
    console.error('❌ 知識ベーステストエラー:', error);
    res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Health check（更新）
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Discord Bot - VTuber School with Document Image Support',
    timestamp: new Date().toISOString(),
    version: '12.0.0', // 🖼️ 文書内画像対応版
    features: {
      slash_commands: true,
      mention_support: true,
      image_support: true,
      document_image_support: true, // 🆕 文書内画像対応
      button_interactions: true,
      static_responses: true,
      ai_responses: 'spreadsheet_knowledge_base_active',
      question_input_system: true,
      spreadsheet_integration: true,
      google_slides_docs_support: true,
      notion_support: true,
      website_support: true,
      image_url_support: true,
      knowledge_base_urls: KNOWLEDGE_SPREADSHEET_ID,
      ai_target_buttons: ['lesson_question', 'sns_consultation', 'mission_submission'],
      bot_user_id: BOT_USER_ID,
      gpt4_vision: true,
      document_images_count: documentImages.length // 🆕 文書内画像数
    }
  });
});

// 🖼️ 新機能：Discord webhook処理（文書画像対応版）
app.post('/discord', async (req, res) => {
  console.log('=== Discord Interaction 受信 ===');
  console.log('Time:', new Date().toISOString());
  
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const publicKey = process.env.DISCORD_PUBLIC_KEY || '63d73edbad916c2ee14b390d729061d40200f2d82753cb094ed89af67873dadd';
  
  if (publicKey) {
    const isValid = verifyDiscordSignature(signature, timestamp, req.body, publicKey);
    console.log('署名検証結果:', isValid);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }
  
  let body;
  try {
    body = JSON.parse(req.body.toString());
  } catch (error) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  
  console.log('Type:', body.type);
  console.log('Command/Custom ID:', body.data?.name || body.data?.custom_id);
  console.log('User:', body.member?.user?.username || body.user?.username);
  
  if (body.type === 1) {
    console.log('🏓 PING認証 - 直接応答');
    return res.json({ type: 1 });
  }
  
  // 🖼️ 文書画像対応：メッセージタイプ（type: 0）の処理を更新
  if (body.type === 0) {
    console.log('💬 メッセージ受信 - メンション確認中...');
    
    const content = body.content;
    const mentions = body.mentions || [];
    const attachments = body.attachments || [];
    
    // 🖼️ 画像添付チェック
    const hasImages = hasImageAttachments(attachments);
    const imageUrls = hasImages ? extractImageUrls(attachments) : [];
    
    if (hasImages) {
      console.log(`🖼️ 画像添付検出: ${imageUrls.length}個`);
    }
    
    // メンション検出
    if (isBotMentioned(content, mentions)) {
      console.log('🏷️ @わなみさん メンション検出！');
      
      // メンション部分を除去して質問内容を抽出
      const questionContent = extractContentFromMention(content);
      
      if ((!questionContent || questionContent.length < 3) && !hasImages) {
        // 質問内容も画像もない場合は選択肢メニューを表示
        console.log('📝 質問内容・画像なし - 選択肢メニュー表示');
        
        const userId = body.author?.id;
        const response = {
          type: 4,
          data: {
            content: `こんにちは <@${userId}>さん！\nどのようなご相談でしょうか？以下から選択してください：`,
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 1,
                    label: "お支払いに関する相談",
                    custom_id: "payment_consultation"
                  },
                  {
                    type: 2,
                    style: 2,
                    label: "プライベートなご相談",
                    custom_id: "private_consultation"
                  },
                  {
                    type: 2,
                    style: 3,
                    label: "レッスンについての質問",
                    custom_id: "lesson_question"
                  }
                ]
              },
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 3,
                    label: "SNS運用相談",
                    custom_id: "sns_consultation"
                  },
                  {
                    type: 2,
                    style: 1,
                    label: "ミッションの提出",
                    custom_id: "mission_submission"
                  }
                ]
              }
            ]
          }
        };
        
        return res.json(response);
      } else {
        // 質問内容または画像がある場合はn8nに送信してAI処理
        console.log('🤖 メンション質問をn8nに送信（文書画像対応）');
        
        // 🖼️ 文書画像対応版のn8n送信
        sendMentionToN8N(body, questionContent, imageUrls).catch(error => {
          console.error('n8nメンション送信失敗:', error);
        });
        
        // 🖼️ 文書画像対応の受付確認メッセージ
        let confirmationMessage = `📝 **ご質問ありがとうございます！**\n\n`;
        
        if (questionContent) {
          confirmationMessage += `「${questionContent}」\n\n`;
        }
        
        if (hasImages) {
          confirmationMessage += `🖼️ **画像 ${imageUrls.length}枚を確認しました**\n\n`;
        }
        
        // 🆕 文書内画像情報を追加
        if (documentImages.length > 0) {
          confirmationMessage += `📚 **知識ベース内の関連画像 ${documentImages.length}枚も参考にします**\n\n`;
        }
        
        confirmationMessage += `知識ベース（Google Slides、Docs、Notion、WEBサイト含む）を確認して回答を準備中です。少々お待ちください... 🤖✨`;
        
        const response = {
          type: 4,
          data: {
            content: confirmationMessage
          }
        };
        
        return res.json(response);
      }
    } else {
      // メンションではない通常メッセージは無視
      console.log('📝 通常メッセージ（メンションなし）- 処理スキップ');
      return res.status(200).json({ message: 'Message ignored' });
    }
  }
  
  if (body.type === 2 && body.data?.name === 'soudan') {
    console.log('⚡ /soudan コマンド - 文書画像対応専門知識ベース版');
    
    const userId = body.member?.user?.id || body.user?.id;
    const response = {
      type: 4,
      data: {
        content: `こんにちは <@${userId}>さん！\nどのようなご相談でしょうか？以下から選択してください：`,
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 1,
                label: "お支払いに関する相談",
                custom_id: "payment_consultation"
              },
              {
                type: 2,
                style: 2,
                label: "プライベートなご相談",
                custom_id: "private_consultation"
              },
              {
                type: 2,
                style: 3,
                label: "レッスンについての質問",
                custom_id: "lesson_question"
              }
            ]
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: "SNS運用相談",
                custom_id: "sns_consultation"
              },
              {
                type: 2,
                style: 1,
                label: "ミッションの提出",
                custom_id: "mission_submission"
              }
            ]
          }
        ]
      }
    };

    console.log('✅ Discord即座応答送信（文書画像対応専門知識ベース版）');
    return res.json(response);
  }
  
  if (body.type === 3) {
    const buttonId = body.data?.custom_id;
    console.log('🔘 ボタンクリック - 文書画像対応専門知識ベース');
    console.log('Button ID:', buttonId);
    
    const response = generateButtonResponse(buttonId, body);
    
    if (AI_TARGET_BUTTONS[buttonId]) {
      console.log('📝 文書画像対応専門AI質問入力要求送信 + n8n通知');
    } else {
      console.log('📝 静的応答送信:', buttonId);
    }
    
    return res.json(response);
  }
  
  console.log('❓ 未対応のInteractionタイプ:', body.type);
  res.status(400).json({ error: 'Unsupported interaction type' });
});

// 🔧 修正：デバッグ用エンドポイント（詳細情報追加）
app.get('/debug-google-auth', (req, res) => {
  res.json({
    google_project_id: process.env.GOOGLE_PROJECT_ID ? 'Set' : 'Not Set',
    google_private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID ? 'Set' : 'Not Set',
    google_private_key: process.env.GOOGLE_PRIVATE_KEY ? 'Set (length: ' + process.env.GOOGLE_PRIVATE_KEY.length + ')' : 'Not Set',
    google_client_email: process.env.GOOGLE_CLIENT_EMAIL ? process.env.GOOGLE_CLIENT_EMAIL : 'Not Set',
    google_client_id: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not Set',
    openai_api_key: process.env.OPENAI_API_KEY ? 'Set' : 'Not Set',
    bot_user_id: BOT_USER_ID,
    api_objects: {
      auth_initialized: !!auth,
      sheets_initialized: !!sheets,
      drive_initialized: !!drive,
      docs_initialized: !!docs,
      slides_initialized: !!slides
    },
    document_images_count: documentImages.length
  });
});

app.listen(PORT, () => {
  console.log('=== Discord Bot VTuber School v12.0 ===');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🤖 Bot User ID: ${BOT_USER_ID}`);
  console.log('✅ Static responses: Render.com');
  console.log('🏷️ Mention Support: @わなみさん Active');
  console.log('🖼️ Image Analysis: GPT-4 Vision Active');
  console.log('📚 Document Image Support: Active'); // 🆕 新ログ
  console.log('📝 Notion Support: Active');
  console.log('🌐 Website Support: Active');
  console.log('🖼️ Image URL Support: Active');
  console.log('📝 AI Question Input System: Active');
  console.log('🤖 専門AI Response Generation: Active');
  console.log('📊 Spreadsheet Knowledge Base: Active');
  console.log(`📚 Knowledge Source: ${KNOWLEDGE_SPREADSHEET_ID}`);
  console.log(`🔗 n8n Webhook: ${N8N_WEBHOOK_URL}`);
  console.log('🎯 AI Target Buttons: lesson_question, sns_consultation, mission_submission');
  console.log('🚀 Phase 7: 🖼️ 文書内画像完全対応完了'); // 🆕 新ログ
  console.log('=====================================');

  // 起動時に初期化実行
  initializeServices();
});

// 🆕 メッセージ監視Bot並行実行
if (process.env.ENABLE_MESSAGE_BOT === 'true') {
  console.log('🤖 Discord Message Bot 起動中...');
  require('./discord-message-bot.js');
}
