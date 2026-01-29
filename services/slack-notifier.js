// services/slack-notifier.js - Slack通知サービス
// Discord接続エラーをSlackに通知

const axios = require('axios');
const logger = require('../utils/logger');

class SlackNotifier {
  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
    this.isEnabled = !!this.webhookUrl;
    this.lastNotificationTime = {};
    this.notificationCooldown = 30 * 60 * 1000; // 30分間は同じエラーを再送しない
  }

  /**
   * Discord接続エラーをSlackに通知
   */
  async notifyDiscordConnectionError(errorDetails) {
    if (!this.isEnabled) {
      logger.warn('⚠️ Slack通知が無効です（SLACK_WEBHOOK_URLが設定されていません）');
      return;
    }

    const errorType = this.detectErrorType(errorDetails);
    
    // クールダウン中かチェック
    if (this.isInCooldown(errorType)) {
      logger.info(`ℹ️ Slack通知クールダウン中: ${errorType}`);
      return;
    }

    try {
      const message = this.buildSlackMessage(errorType, errorDetails);
      
      await axios.post(this.webhookUrl, message, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      logger.success('✅ Slack通知送信成功');
      this.lastNotificationTime[errorType] = Date.now();
      
    } catch (error) {
      logger.error('❌ Slack通知送信失敗:', error.message);
    }
  }

  /**
   * エラータイプを検出
   */
  detectErrorType(errorDetails) {
    const { status, statusText, message, code } = errorDetails;

    if (status === 429 || message?.includes('rate limit') || message?.includes('1015')) {
      return 'RATE_LIMITED';
    }
    
    if (status === 401 || message?.includes('TOKEN_INVALID') || message?.includes('Incorrect login')) {
      return 'AUTH_ERROR';
    }
    
    if (message?.includes('timeout')) {
      return 'TIMEOUT';
    }
    
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
      return 'NETWORK_ERROR';
    }
    
    return 'UNKNOWN_ERROR';
  }

  /**
   * クールダウン中かチェック
   */
  isInCooldown(errorType) {
    const lastTime = this.lastNotificationTime[errorType];
    if (!lastTime) return false;
    
    const elapsed = Date.now() - lastTime;
    return elapsed < this.notificationCooldown;
  }

  /**
   * Slackメッセージを構築
   */
  buildSlackMessage(errorType, errorDetails) {
    const { status, statusText, message, code, wsStatus, ip, rayId } = errorDetails;
    
    const color = this.getColorByErrorType(errorType);
    const emoji = this.getEmojiByErrorType(errorType);
    const title = this.getTitleByErrorType(errorType);
    const solution = this.getSolutionByErrorType(errorType);

    const timestamp = Math.floor(Date.now() / 1000);

    return {
      text: `${emoji} Discord Bot接続エラー: ${title}`,
      attachments: [
        {
          color: color,
          title: `${emoji} ${title}`,
          fields: [
            {
              title: 'エラータイプ',
              value: errorType,
              short: true
            },
            {
              title: 'ステータス',
              value: status ? `${status} ${statusText || ''}` : 'N/A',
              short: true
            },
            {
              title: 'エラーコード',
              value: code || 'N/A',
              short: true
            },
            {
              title: 'WebSocket状態',
              value: wsStatus !== undefined ? `${wsStatus}` : 'N/A',
              short: true
            },
            {
              title: 'エラーメッセージ',
              value: `\`\`\`${message || 'N/A'}\`\`\``,
              short: false
            },
            {
              title: '推奨対応',
              value: solution,
              short: false
            }
          ],
          footer: 'Discord Bot Monitor',
          footer_icon: 'https://cdn.discordapp.com/embed/avatars/0.png',
          ts: timestamp
        }
      ]
    };
  }

  /**
   * エラータイプ別の色
   */
  getColorByErrorType(errorType) {
    const colors = {
      'RATE_LIMITED': '#FF0000',    // 赤
      'AUTH_ERROR': '#FF6600',       // オレンジ
      'TIMEOUT': '#FFCC00',          // 黄色
      'NETWORK_ERROR': '#FF9900',    // 橙色
      'UNKNOWN_ERROR': '#999999'     // グレー
    };
    return colors[errorType] || '#999999';
  }

  /**
   * エラータイプ別の絵文字
   */
  getEmojiByErrorType(errorType) {
    const emojis = {
      'RATE_LIMITED': '🚨',
      'AUTH_ERROR': '🔐',
      'TIMEOUT': '⏱️',
      'NETWORK_ERROR': '🌐',
      'UNKNOWN_ERROR': '❌'
    };
    return emojis[errorType] || '❌';
  }

  /**
   * エラータイプ別のタイトル
   */
  getTitleByErrorType(errorType) {
    const titles = {
      'RATE_LIMITED': 'Cloudflare レート制限（Error 1015）',
      'AUTH_ERROR': '認証エラー（トークン無効）',
      'TIMEOUT': '接続タイムアウト',
      'NETWORK_ERROR': 'ネットワーク接続エラー',
      'UNKNOWN_ERROR': '不明なエラー'
    };
    return titles[errorType] || '不明なエラー';
  }

  /**
   * エラータイプ別の推奨対応
   */
  getSolutionByErrorType(errorType) {
    const solutions = {
      'RATE_LIMITED': 
        '• RenderのIPアドレスがDiscord/CloudflareにBANされています\n' +
        '• 対応1: 2〜6時間待ってから再デプロイ\n' +
        '• 対応2: 新しいRenderサービスを作成して別IPを取得\n' +
        '• 対応3: 別システムと同時稼働していないか確認',
      
      'AUTH_ERROR':
        '• Discord Bot トークンが無効です\n' +
        '• 対応: Discord Developer Portalでトークンを再生成\n' +
        '• 環境変数 DISCORD_BOT_TOKEN を更新してください',
      
      'TIMEOUT':
        '• Discord Gateway接続がタイムアウトしました\n' +
        '• 対応1: Renderのネットワークが遅い可能性\n' +
        '• 対応2: Discord側の一時的な障害\n' +
        '• 対応3: しばらく待ってから再試行',
      
      'NETWORK_ERROR':
        '• ネットワーク接続に失敗しました\n' +
        '• 対応: Renderのネットワーク状態を確認\n' +
        '• Discord APIが正常か確認: https://discordstatus.com/',
      
      'UNKNOWN_ERROR':
        '• 不明なエラーが発生しました\n' +
        '• 対応: Renderのログを確認してください\n' +
        '• 詳細: https://dashboard.render.com/'
    };
    return solutions[errorType] || '詳細はログを確認してください';
  }

  /**
   * Discord接続成功をSlackに通知
   */
  async notifyDiscordConnectionSuccess() {
    if (!this.isEnabled) return;

    try {
      const message = {
        text: '✅ Discord Bot接続成功',
        attachments: [
          {
            color: '#36a64f',
            title: '✅ Discord Bot接続成功',
            text: 'Discord Botが正常に接続されました。',
            footer: 'Discord Bot Monitor',
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };

      await axios.post(this.webhookUrl, message, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      logger.success('✅ Slack通知送信成功（接続成功）');
      
    } catch (error) {
      logger.error('❌ Slack通知送信失敗:', error.message);
    }
  }

  /**
   * カスタム通知を送信
   */
  async sendCustomNotification(title, message, color = '#36a64f') {
    if (!this.isEnabled) return;

    try {
      const payload = {
        text: title,
        attachments: [
          {
            color: color,
            title: title,
            text: message,
            footer: 'Discord Bot Monitor',
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };

      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      logger.success('✅ Slack通知送信成功（カスタム）');
      
    } catch (error) {
      logger.error('❌ Slack通知送信失敗:', error.message);
    }
  }

  /**
   * サービス状態を取得
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      webhookConfigured: !!this.webhookUrl,
      lastNotifications: this.lastNotificationTime
    };
  }
}

// シングルトンインスタンス
const slackNotifier = new SlackNotifier();

module.exports = {
  slackNotifier,
  SlackNotifier
};
