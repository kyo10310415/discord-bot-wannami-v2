// utils/content-loaders.js - コンテンツ読み込みユーティリティ

const axios = require('axios');

// Notion画像対応版
async function loadNotionContent(url, fileName) {
  try {
    console.log(`📝 Notion読み込み開始: ${fileName}`);
    
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
    
    // 画像URLを抽出してプレースホルダーに変換
    const imgMatches = html.match(/<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi);
    let imageIndex = 0;
    let processedHtml = html;
    
    if (imgMatches) {
      imgMatches.forEach((imgTag) => {
        const srcMatch = imgTag.match(/src=['"]([^'"]+)['"]/);
        if (srcMatch) {
          let imageUrl = srcMatch[1];
          
          // 相対URLを絶対URLに変換
          if (imageUrl.startsWith('/')) {
            imageUrl = new URL(imageUrl, url).href;
          }
          
          // Notionの画像URLを処理
          if (imageUrl.includes('notion') || imageUrl.includes('amazonaws.com')) {
            imageIndex++;
            const placeholder = `\n[🖼️ 画像: ${fileName} - Notion画像${imageIndex}]\n`;
            processedHtml = processedHtml.replace(imgTag, placeholder);
          }
        }
      });
    }
    
    // Notionページのタイトルを抽出
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(' | Notion', '').trim() : fileName;
    
    // Notionの特殊なHTML構造からテキストを抽出
    let textContent = processedHtml
      // スクリプトとスタイルを除去
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
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
    
    console.log(`✅ Notion読み込み成功: ${fileName} (${content.length}文字, ${imageIndex}枚の画像)`);
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

// 汎用WEBサイト画像対応版
async function loadWebsiteContent(url, fileName) {
  try {
    console.log(`🌐 WEBサイト読み込み開始: ${fileName}`);
    
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // HTMLから主要なテキストコンテンツを抽出
    const html = response.data;
    
    // 画像URLを抽出してプレースホルダーに変換
    const imgMatches = html.match(/<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi);
    let imageIndex = 0;
    let processedHtml = html;
    
    if (imgMatches) {
      imgMatches.forEach((imgTag) => {
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
          
          // 有効な画像URLのみを処理
          if (imageUrl.startsWith('http') && imageUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i)) {
            imageIndex++;
            const placeholder = `\n[🖼️ 画像: ${fileName} - WEB画像${imageIndex}]\n`;
            processedHtml = processedHtml.replace(imgTag, placeholder);
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
    
    // 基本的なHTMLタグを除去してテキストを抽出
    let textContent = processedHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
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
    
    console.log(`✅ WEBサイト読み込み成功: ${fileName} (${content.length}文字, ${imageIndex}枚の画像)`);
    return content;

  } catch (error) {
    console.error(`❌ WEBサイト読み込み失敗 ${fileName}:`, error.message);
    return `${fileName}: WEBサイト読み込みエラー - ${error.message}`;
  }
}

// 画像URL情報取得関数
async function loadImageUrlInfo(url, fileName) {
  try {
    console.log(`🖼️ 画像URL情報取得: ${fileName}`);
    
    // 画像URLの場合はメタデータのみ取得
    const response = await axios.head(url, {
      timeout: 5000
    });
    
    const contentType = response.headers['content-type'] || 'unknown';
    const contentLength = response.headers['content-length'] || 'unknown';
    
    let content = `${fileName}\n${'='.repeat(50)}\n`;
    content += `種類: 画像ファイル\n`;
    content += `URL: ${url}\n`;
    content += `ファイル形式: ${contentType}\n`;
    content += `ファイルサイズ: ${contentLength} bytes\n\n`;
    content += `【AI画像解析対応】\nこの画像は、質問時に画像として添付された場合、AI が詳細に分析して回答します。\n`;
    content += `画像の内容、技術的な問題、改善点などを具体的に指摘できます。\n\n`;
    content += `[🖼️ 画像: ${fileName} - 直接画像URL]\n`;
    
    console.log(`✅ 画像URL情報取得成功: ${fileName}`);
    return content;

  } catch (error) {
    console.error(`❌ 画像URL情報取得失敗 ${fileName}:`, error.message);
    return `${fileName}: 画像アクセスエラー - ${error.message}`;
  }
}

module.exports = {
  loadNotionContent,  
  loadWebsiteContent,
  loadImageUrlInfo
};
