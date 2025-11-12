// utils/content-loaders.js - コンテンツ読み込みユーティリティ v2.8.0（再帰的Notionクロール対応）

const axios = require('axios');

/**
 * NotionページからリンクURLを抽出
 */
function extractNotionLinks(html) {
  const links = [];
  const urlPattern = /https:\/\/[^\s<>"']+notion\.so\/[^\s<>"']+/g;
  const matches = html.matchAll(urlPattern);
  
  for (const match of matches) {
    let url = match[0];
    
    // HTMLエンティティをデコード
    url = url.replace(/&amp;/g, '&');
    
    // クエリパラメータとフラグメントを除去
    url = url.split('?')[0].split('#')[0];
    
    // 末尾の特殊文字を除去
    url = url.replace(/[,;.)]+$/, '');
    
    if (!links.includes(url)) {
      links.push(url);
    }
  }
  
  return links;
}

/**
 * HTMLからテキストコンテンツを抽出
 */
function extractTextFromHtml(html, fileName) {
  // 画像URLを抽出してプレースホルダーに変換
  const imgMatches = html.match(/<img[^>]+src=['"]([^'"]+)['"][^>]*>/gi);
  let imageIndex = 0;
  let processedHtml = html;
  
  if (imgMatches) {
    imgMatches.forEach((imgTag) => {
      const srcMatch = imgTag.match(/src=['"]([^'"]+)['"]/);
      if (srcMatch) {
        let imageUrl = srcMatch[1];
        
        // Notionの画像URLを処理
        if (imageUrl.includes('notion') || imageUrl.includes('amazonaws.com')) {
          imageIndex++;
          const placeholder = `\n[🖼️ 画像: ${fileName} - Notion画像${imageIndex}]\n`;
          processedHtml = processedHtml.replace(imgTag, placeholder);
        }
      }
    });
  }
  
  // テキストコンテンツを抽出
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
    .replace(/\n\s+/g, '\n')
    .trim();
  
  return { textContent, imageCount: imageIndex };
}

/**
 * Notionコンテンツを再帰的に取得（リンク先も含む）
 */
async function loadNotionContentRecursive(url, fileName, depth = 0, maxDepth = 2, visitedUrls = new Set()) {
  try {
    // 最大深度チェック
    if (depth > maxDepth) {
      console.log(`${'  '.repeat(depth)}⚠️ 最大深度 ${maxDepth} に達しました: ${url}`);
      return null;
    }
    
    // 訪問済みURLチェック（循環参照防止）
    const cleanUrl = url.split('?')[0].split('#')[0];
    if (visitedUrls.has(cleanUrl)) {
      console.log(`${'  '.repeat(depth)}⚠️ すでに訪問済み: ${url}`);
      return null;
    }
    visitedUrls.add(cleanUrl);
    
    console.log(`${'  '.repeat(depth)}━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`${'  '.repeat(depth)}🔍 Notionページ読み込み (深度${depth}): ${fileName}`);
    console.log(`${'  '.repeat(depth)}📍 URL: ${url.substring(0, 60)}...`);
    console.log(`${'  '.repeat(depth)}━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    // NotionのページIDを抽出
    const pageIdMatch = url.match(/([a-f0-9]{32}|[a-f0-9-]{36})/);
    if (!pageIdMatch) {
      console.error(`${'  '.repeat(depth)}❌ Invalid Notion URL format - Page ID not found`);
      return null;
    }
    
    const pageId = pageIdMatch[0].replace(/-/g, '');
    console.log(`${'  '.repeat(depth)}🔑 Notion Page ID: ${pageId}`);
    
    // Notion公開ページをスクレイピング
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
    
    // タイトルを抽出
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(' | Notion', '').trim() : fileName;
    
    // テキストコンテンツを抽出
    const { textContent, imageCount } = extractTextFromHtml(html, fileName);
    
    console.log(`${'  '.repeat(depth)}📏 コンテンツ文字数: ${textContent.length.toLocaleString()}`);
    console.log(`${'  '.repeat(depth)}🖼️ 画像数: ${imageCount}`);
    console.log(`${'  '.repeat(depth)}📝 コンテンツの最初の200文字:`);
    console.log(`${'  '.repeat(depth)}${textContent.substring(0, 200).replace(/\n/g, `\n${'  '.repeat(depth)}`)}`);
    
    // 現在のページのコンテンツをフォーマット
    let fullContent = '';
    
    if (depth === 0) {
      // 親ページ
      fullContent += `${fileName}\n${'='.repeat(50)}\n`;
      fullContent += `タイトル: ${title}\n`;
      fullContent += `Notion URL: ${url}\n`;
      fullContent += `種類: Notionページ\n\n`;
      fullContent += textContent;
    } else {
      // 子ページ（区切り線で区別）
      fullContent += `\n\n${'─'.repeat(50)}\n`;
      fullContent += `【リンク先ページ ${depth}階層目】\n`;
      fullContent += `タイトル: ${title}\n\n`;
      fullContent += textContent;
    }
    
    // リンク先のNotionページを抽出
    const notionLinks = extractNotionLinks(html);
    
    if (notionLinks.length > 0 && depth < maxDepth) {
      console.log(`${'  '.repeat(depth)}🔗 Notionリンク検出: ${notionLinks.length}件`);
      
      // 各リンク先を再帰的にクロール
      for (let i = 0; i < notionLinks.length; i++) {
        const linkUrl = notionLinks[i];
        console.log(`${'  '.repeat(depth)}📎 リンク ${i + 1}/${notionLinks.length}: ${linkUrl.substring(0, 50)}...`);
        
        // リンク先のタイトルを推測
        const linkTitle = `リンク先_${i + 1}`;
        
        const childContent = await loadNotionContentRecursive(
          linkUrl,
          linkTitle,
          depth + 1,
          maxDepth,
          visitedUrls
        );
        
        if (childContent) {
          fullContent += childContent;
          console.log(`${'  '.repeat(depth)}✅ リンク先追加完了 (${i + 1}/${notionLinks.length})`);
        }
        
        // API制限を考慮して待機
        if (i < notionLinks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } else if (notionLinks.length === 0) {
      console.log(`${'  '.repeat(depth)}📭 Notionリンクなし（リーフページ）`);
    }
    
    console.log(`${'  '.repeat(depth)}━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    return fullContent;
    
  } catch (error) {
    console.error(`${'  '.repeat(depth)}❌ Notion読み込みエラー: ${fileName}`, error.message);
    return null;
  }
}

/**
 * Notion画像対応版（エントリーポイント、再帰的クロール対応）
 */
async function loadNotionContent(url, fileName) {
  try {
    console.log(`\n🚀 Notion再帰クロール開始: ${fileName}`);
    console.log(`📍 親URL: ${url}`);
    console.log(`⚙️ 設定: 最大深度2階層（親 + 子ページ）\n`);
    
    const content = await loadNotionContentRecursive(url, fileName, 0, 2);
    
    if (content) {
      console.log(`\n✨ Notion再帰クロール完了: ${fileName}`);
      console.log(`📊 最終コンテンツ文字数: ${content.length.toLocaleString()}`);
      console.log(`📝 最終コンテンツの最初の500文字:\n${content.substring(0, 500)}`);
      if (content.length > 500) {
        console.log(`📝 最終コンテンツの最後の300文字:\n${content.substring(content.length - 300)}`);
      }
      console.log(`✅ Notion読み込み成功\n`);
      
      return content;
    } else {
      throw new Error('再帰クロールが失敗しました');
    }
    
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
