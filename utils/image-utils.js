// utils/image-utils.js - 画像関連ユーティリティ

// 画像添付検出関数
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

// 画像URL抽出関数
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

// 画像URLの妥当性チェック
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  // HTTPSまたはHTTPで始まる
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  
  // 画像拡張子のチェック
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i;
  const hasImageExtension = imageExtensions.test(url);
  
  // Discord CDN、Google Drive、その他の画像ホスティングサービス
  const knownImageHosts = [
    'cdn.discordapp.com',
    'media.discordapp.net', 
    'drive.google.com',
    'imgur.com',
    'i.imgur.com'
  ];
  
  const isKnownHost = knownImageHosts.some(host => url.includes(host));
  
  return hasImageExtension || isKnownHost;
}

// 画像情報の正規化
function normalizeImageInfo(imageData) {
  if (typeof imageData === 'string') {
    return {
      url: imageData,
      filename: extractFilenameFromUrl(imageData),
      content_type: 'image/unknown',
      size: null,
      detail: 'high'
    };
  }
  
  return {
    url: imageData.url,
    filename: imageData.filename || extractFilenameFromUrl(imageData.url),
    content_type: imageData.content_type || 'image/unknown',
    size: imageData.size || null,
    detail: imageData.detail || 'high'
  };
}

// URLからファイル名を抽出
function extractFilenameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop();
    
    // ファイル名が空またはない場合はデフォルト
    if (!filename || filename === '') {
      return 'image';
    }
    
    return filename;
  } catch (error) {
    return 'image';
  }
}

// 画像配列のフィルタリングと制限
function filterAndLimitImages(images, maxImages = 5) {
  if (!Array.isArray(images)) return [];
  
  return images
    .filter(img => {
      const url = typeof img === 'string' ? img : img.url;
      return isValidImageUrl(url);
    })
    .slice(0, maxImages)
    .map(img => normalizeImageInfo(img));
}

// OpenAI Vision形式への変換
function convertToVisionFormat(images, detail = 'high') {
  return images.map(img => {
    const imageInfo = normalizeImageInfo(img);
    return {
      type: "image_url",
      image_url: {
        url: imageInfo.url,
        detail: detail
      }
    };
  });
}

// 画像メタデータの取得（非同期）
async function getImageMetadata(imageUrl) {
  const axios = require('axios');
  
  try {
    const response = await axios.head(imageUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ImageMetadataBot/1.0)'
      }
    });
    
    return {
      contentType: response.headers['content-type'],
      contentLength: parseInt(response.headers['content-length']) || null,
      lastModified: response.headers['last-modified'],
      etag: response.headers['etag'],
      accessible: true
    };
  } catch (error) {
    console.warn(`⚠️ 画像メタデータ取得失敗: ${imageUrl}`, error.message);
    return {
      contentType: null,
      contentLength: null,
      lastModified: null,
      etag: null,
      accessible: false,
      error: error.message
    };
  }
}

// 画像統計情報の計算
function calculateImageStats(images) {
  const stats = {
    total: images.length,
    byContentType: {},
    totalSize: 0,
    averageSize: 0,
    accessible: 0,
    sources: {}
  };
  
  images.forEach(img => {
    const imageInfo = normalizeImageInfo(img);
    
    // コンテンツタイプ別集計
    const contentType = imageInfo.content_type || 'unknown';
    stats.byContentType[contentType] = (stats.byContentType[contentType] || 0) + 1;
    
    // サイズ集計
    if (imageInfo.size && !isNaN(imageInfo.size)) {
      stats.totalSize += imageInfo.size;
    }
    
    // ソース別集計（URLのホスト名で判定）
    try {
      const hostname = new URL(imageInfo.url).hostname;
      stats.sources[hostname] = (stats.sources[hostname] || 0) + 1;
    } catch (error) {
      stats.sources['unknown'] = (stats.sources['unknown'] || 0) + 1;
    }
  });
  
  // 平均サイズ計算
  if (stats.totalSize > 0) {
    const imagesWithSize = images.filter(img => {
      const imageInfo = normalizeImageInfo(img);
      return imageInfo.size && !isNaN(imageInfo.size);
    });
    stats.averageSize = Math.round(stats.totalSize / imagesWithSize.length);
  }
  
  return stats;
}

module.exports = {
  hasImageAttachments,
  extractImageUrls,
  isValidImageUrl,
  normalizeImageInfo,
  extractFilenameFromUrl,
  filterAndLimitImages,
  convertToVisionFormat,
  getImageMetadata,
  calculateImageStats
};
