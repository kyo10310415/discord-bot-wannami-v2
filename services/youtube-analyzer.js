// services/youtube-analyzer.js - YouTubeチャンネル分析サービス
// Version: 1.0.0
// 作成日: 2026-02-16
// 機能: YouTube Data APIを使用してチャンネル情報を取得・分析

const { google } = require('googleapis');
const logger = require('../utils/logger');

class YouTubeAnalyzer {
  constructor() {
    this.youtube = null;
    this.initialized = false;
  }

  /**
   * YouTube Data API クライアントを初期化
   */
  initialize() {
    try {
      const apiKey = process.env.YOUTUBE_API_KEY;
      
      if (!apiKey) {
        logger.warn('⚠️ YOUTUBE_API_KEY が設定されていません。YouTubeチャンネル分析機能は無効化されます。');
        return false;
      }

      this.youtube = google.youtube({
        version: 'v3',
        auth: apiKey
      });

      this.initialized = true;
      logger.info('✅ YouTube Data API クライアント初期化完了');
      return true;
    } catch (error) {
      logger.error('❌ YouTube Data API クライアント初期化エラー:', error.message);
      return false;
    }
  }

  /**
   * YouTubeチャンネルURLからチャンネルIDを抽出
   * @param {string} url - YouTubeチャンネルURL
   * @returns {string|null} チャンネルID
   */
  extractChannelId(url) {
    try {
      // パターン1: https://www.youtube.com/channel/UC...
      const channelMatch = url.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
      if (channelMatch) return channelMatch[1];

      // パターン2: https://www.youtube.com/@username
      const handleMatch = url.match(/youtube\.com\/@([a-zA-Z0-9_-]+)/);
      if (handleMatch) return `@${handleMatch[1]}`;

      // パターン3: https://www.youtube.com/c/customname
      const customMatch = url.match(/youtube\.com\/c\/([a-zA-Z0-9_-]+)/);
      if (customMatch) return customMatch[1];

      // パターン4: https://www.youtube.com/user/username
      const userMatch = url.match(/youtube\.com\/user\/([a-zA-Z0-9_-]+)/);
      if (userMatch) return userMatch[1];

      logger.warn('⚠️ URLからチャンネルIDを抽出できませんでした:', url);
      return null;
    } catch (error) {
      logger.error('❌ チャンネルID抽出エラー:', error.message);
      return null;
    }
  }

  /**
   * @で始まるハンドルからチャンネルIDを取得
   * @param {string} handle - @で始まるハンドル
   * @returns {string|null} チャンネルID
   */
  async getChannelIdFromHandle(handle) {
    try {
      if (!this.initialized) {
        logger.warn('⚠️ YouTube API が初期化されていません');
        return null;
      }

      // @記号を除去
      const cleanHandle = handle.replace('@', '');

      const response = await this.youtube.search.list({
        part: 'snippet',
        q: `@${cleanHandle}`,
        type: 'channel',
        maxResults: 1
      });

      if (response.data.items && response.data.items.length > 0) {
        return response.data.items[0].snippet.channelId;
      }

      return null;
    } catch (error) {
      logger.error('❌ ハンドルからチャンネルID取得エラー:', error.message);
      return null;
    }
  }

  /**
   * チャンネル情報を取得
   * @param {string} channelIdOrHandle - チャンネルIDまたはハンドル
   * @returns {Object|null} チャンネル情報
   */
  async getChannelInfo(channelIdOrHandle) {
    try {
      if (!this.initialized) {
        logger.warn('⚠️ YouTube API が初期化されていません');
        return null;
      }

      let channelId = channelIdOrHandle;

      // @で始まる場合はハンドルとして処理
      if (channelIdOrHandle.startsWith('@')) {
        channelId = await this.getChannelIdFromHandle(channelIdOrHandle);
        if (!channelId) {
          logger.warn('⚠️ ハンドルからチャンネルIDを取得できませんでした:', channelIdOrHandle);
          return null;
        }
      }

      logger.info(`📺 チャンネル情報を取得中: ${channelId}`);

      const response = await this.youtube.channels.list({
        part: 'snippet,statistics,brandingSettings,contentDetails',
        id: channelId,
        maxResults: 1
      });

      if (!response.data.items || response.data.items.length === 0) {
        logger.warn('⚠️ チャンネルが見つかりませんでした:', channelId);
        return null;
      }

      const channel = response.data.items[0];
      const info = {
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description || '',
        customUrl: channel.snippet.customUrl || '',
        subscriberCount: parseInt(channel.statistics.subscriberCount || 0),
        videoCount: parseInt(channel.statistics.videoCount || 0),
        viewCount: parseInt(channel.statistics.viewCount || 0),
        keywords: channel.brandingSettings?.channel?.keywords || '',
        country: channel.snippet.country || '',
        thumbnailUrl: channel.snippet.thumbnails?.high?.url || '',
        uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads || ''
      };

      logger.info(`✅ チャンネル情報取得完了: ${info.title} (登録者: ${info.subscriberCount}人)`);
      return info;
    } catch (error) {
      logger.error('❌ チャンネル情報取得エラー:', error.message);
      return null;
    }
  }

  /**
   * チャンネルの最新動画を取得
   * @param {string} uploadsPlaylistId - アップロード再生リストID
   * @param {number} maxResults - 取得する動画数（デフォルト10）
   * @returns {Array} 動画情報の配列
   */
  async getRecentVideos(uploadsPlaylistId, maxResults = 10) {
    try {
      if (!this.initialized) {
        logger.warn('⚠️ YouTube API が初期化されていません');
        return [];
      }

      logger.info(`🎬 最新動画を取得中（最大${maxResults}件）`);

      const response = await this.youtube.playlistItems.list({
        part: 'snippet',
        playlistId: uploadsPlaylistId,
        maxResults: maxResults
      });

      const videos = response.data.items.map(item => ({
        videoId: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        description: item.snippet.description || '',
        publishedAt: item.snippet.publishedAt,
        thumbnailUrl: item.snippet.thumbnails?.high?.url || ''
      }));

      logger.info(`✅ ${videos.length}件の動画情報を取得しました`);
      return videos;
    } catch (error) {
      logger.error('❌ 動画情報取得エラー:', error.message);
      return [];
    }
  }

  /**
   * 動画の詳細情報を取得（タグ含む）
   * @param {Array<string>} videoIds - 動画IDの配列
   * @returns {Array} 動画詳細情報の配列
   */
  async getVideoDetails(videoIds) {
    try {
      if (!this.initialized || videoIds.length === 0) {
        return [];
      }

      const response = await this.youtube.videos.list({
        part: 'snippet,statistics',
        id: videoIds.join(',')
      });

      const videos = response.data.items.map(item => ({
        videoId: item.id,
        title: item.snippet.title,
        description: item.snippet.description || '',
        tags: item.snippet.tags || [],
        viewCount: parseInt(item.statistics.viewCount || 0),
        likeCount: parseInt(item.statistics.likeCount || 0),
        commentCount: parseInt(item.statistics.commentCount || 0)
      }));

      return videos;
    } catch (error) {
      logger.error('❌ 動画詳細取得エラー:', error.message);
      return [];
    }
  }

  /**
   * チャンネルを包括的に分析
   * @param {string} channelUrl - YouTubeチャンネルURL
   * @returns {Object|null} 分析結果
   */
  async analyzeChannel(channelUrl) {
    try {
      if (!this.initialized) {
        return {
          success: false,
          error: 'YouTube API が初期化されていません。YOUTUBE_API_KEYを設定してください。'
        };
      }

      logger.info(`🔍 チャンネル分析開始: ${channelUrl}`);

      // 1. チャンネルIDを抽出
      const channelId = this.extractChannelId(channelUrl);
      if (!channelId) {
        return {
          success: false,
          error: 'チャンネルURLが無効です。正しいYouTubeチャンネルURLを入力してください。'
        };
      }

      // 2. チャンネル情報を取得
      const channelInfo = await this.getChannelInfo(channelId);
      if (!channelInfo) {
        return {
          success: false,
          error: 'チャンネル情報を取得できませんでした。URLを確認してください。'
        };
      }

      // 3. 最新動画を取得
      const recentVideos = await this.getRecentVideos(channelInfo.uploadsPlaylistId, 10);

      // 4. 動画の詳細情報を取得（タグ情報など）
      const videoIds = recentVideos.map(v => v.videoId);
      const videoDetails = await this.getVideoDetails(videoIds);

      // 5. キーワードを抽出
      const keywords = this.extractKeywords(channelInfo, videoDetails);

      // 6. 活動内容を分析
      const activities = this.analyzeActivities(channelInfo, videoDetails);

      const analysis = {
        success: true,
        channel: {
          name: channelInfo.title,
          subscriberCount: channelInfo.subscriberCount,
          videoCount: channelInfo.videoCount,
          description: channelInfo.description
        },
        keywords: keywords,
        activities: activities,
        recentVideos: videoDetails.slice(0, 5).map(v => ({
          title: v.title,
          tags: v.tags,
          viewCount: v.viewCount
        }))
      };

      logger.info(`✅ チャンネル分析完了: ${channelInfo.title}`);
      logger.info(`📊 キーワード数: ${keywords.length}件, 活動カテゴリ: ${activities.categories.join(', ')}`);

      return analysis;
    } catch (error) {
      logger.error('❌ チャンネル分析エラー:', error.message);
      return {
        success: false,
        error: `分析中にエラーが発生しました: ${error.message}`
      };
    }
  }

  /**
   * キーワードを抽出
   * @param {Object} channelInfo - チャンネル情報
   * @param {Array} videos - 動画詳細情報
   * @returns {Array<string>} キーワードリスト
   */
  extractKeywords(channelInfo, videos) {
    const keywordSet = new Set();

    // チャンネルのキーワード
    if (channelInfo.keywords) {
      channelInfo.keywords.split(/\s+/).forEach(kw => {
        if (kw.length > 1) keywordSet.add(kw);
      });
    }

    // チャンネル説明からキーワード抽出
    const descriptionWords = channelInfo.description.match(/[ぁ-んァ-ヶー一-龠a-zA-Z0-9]+/g) || [];
    descriptionWords.forEach(word => {
      if (word.length > 2) keywordSet.add(word);
    });

    // 動画タグからキーワード抽出
    videos.forEach(video => {
      if (video.tags) {
        video.tags.forEach(tag => {
          if (tag.length > 1) keywordSet.add(tag);
        });
      }
    });

    // 頻出度でソート（簡易版）
    return Array.from(keywordSet).slice(0, 20);
  }

  /**
   * 活動内容を分析
   * @param {Object} channelInfo - チャンネル情報
   * @param {Array} videos - 動画詳細情報
   * @returns {Object} 活動分析結果
   */
  analyzeActivities(channelInfo, videos) {
    const categories = new Set();
    const gameKeywords = ['ゲーム', 'game', 'プレイ', 'play', '実況', 'モンスターハンター', 'マイクラ', 'APEX', 'ポケモン'];
    const streamKeywords = ['配信', 'stream', 'live', 'ライブ', '雑談'];
    const musicKeywords = ['歌', '歌ってみた', 'cover', 'music', '音楽', 'カバー'];
    const creativeKeywords = ['描いてみた', 'イラスト', 'アート', 'art', 'お絵描き'];

    const allText = [
      channelInfo.description,
      ...videos.map(v => v.title + ' ' + v.description + ' ' + (v.tags || []).join(' '))
    ].join(' ').toLowerCase();

    if (gameKeywords.some(kw => allText.includes(kw.toLowerCase()))) {
      categories.add('ゲーム実況');
    }
    if (streamKeywords.some(kw => allText.includes(kw.toLowerCase()))) {
      categories.add('配信・雑談');
    }
    if (musicKeywords.some(kw => allText.includes(kw.toLowerCase()))) {
      categories.add('歌・音楽');
    }
    if (creativeKeywords.some(kw => allText.includes(kw.toLowerCase()))) {
      categories.add('創作・イラスト');
    }

    return {
      categories: Array.from(categories),
      mainGenre: categories.size > 0 ? Array.from(categories)[0] : '総合'
    };
  }

  /**
   * 企画提案を生成するためのコンテキスト情報を作成
   * @param {Object} analysis - チャンネル分析結果
   * @param {string} userRequest - ユーザーのリクエスト内容
   * @returns {string} AI用のコンテキスト情報
   */
  buildPlanningContext(analysis, userRequest) {
    if (!analysis.success) {
      return null;
    }

    const context = `
【チャンネル分析結果】
チャンネル名: ${analysis.channel.name}
登録者数: ${analysis.channel.subscriberCount}人
動画投稿数: ${analysis.channel.videoCount}本
チャンネル説明: ${analysis.channel.description.substring(0, 200)}...

【活動内容】
主なジャンル: ${analysis.activities.mainGenre}
活動カテゴリ: ${analysis.activities.categories.join('、')}

【キーワード】
${analysis.keywords.slice(0, 15).join('、')}

【最近の動画】
${analysis.recentVideos.map(v => `・${v.title}（視聴回数: ${v.viewCount}）`).join('\n')}

【ユーザーからのリクエスト】
${userRequest}
`;

    return context;
  }
}

// シングルトンインスタンス
const youtubeAnalyzer = new YouTubeAnalyzer();

module.exports = {
  youtubeAnalyzer,
  YouTubeAnalyzer
};
