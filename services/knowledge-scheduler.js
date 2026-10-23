// services/knowledge-scheduler.js - 知識ベース定期更新スケジューラー

const cron = require('node-cron');
const logger = require('../utils/logger');
const { knowledgeBaseService } = require('./knowledge-base');

class KnowledgeScheduler {
  constructor() {
    this.isRunning = false;
    this.lastUpdate = null;
    this.nextUpdate = null;
    this.cronJob = null;
    this.updateInProgress = false;
  }

  // スケジューラー開始
  start() {
    try {
      // 毎週月曜日午前3時（日本時間）に実行
      // cron形式: 秒 分 時 日 月 曜日
      // 0 0 3 * * 1 = 毎週月曜日の午前3時
      this.cronJob = cron.createTask('0 0 3 * * 1', async () => {
        await this.performScheduledUpdate();
      }, {
        timezone: 'Asia/Tokyo'
      });

      this.cronJob.start();
      this.isRunning = true;
      
      // 次回更新時刻を計算
      this.calculateNextUpdate();
      
      logger.info('📅 知識ベース自動更新スケジューラー開始');
      logger.info(`⏰ 次回更新予定: ${this.nextUpdate?.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
      
    } catch (error) {
      logger.errorDetail('スケジューラー開始エラー:', error);
      throw error;
    }
  }

  // スケジューラー停止
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
    logger.info('📅 知識ベース自動更新スケジューラー停止');
  }

  // 定期更新実行
  async performScheduledUpdate() {
    if (this.updateInProgress) {
      logger.warn('⚠️ 知識ベース更新が既に進行中のため、スキップします');
      return;
    }

    try {
      this.updateInProgress = true;
      const startTime = Date.now();
      
      logger.info('🔄 定期知識ベース更新開始');
      logger.info(`📊 更新開始時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);

      // 現在の知識ベース統計を記録
      const beforeStats = this.getKnowledgeBaseStats();
      logger.info(`📈 更新前統計: 文書数=${beforeStats.documentCount}, 文字数=${beforeStats.totalCharacters}`);

      // 知識ベースを再構築
      await knowledgeBaseService.buildKnowledgeBase();
      
      // 更新後の統計を記録
      const afterStats = this.getKnowledgeBaseStats();
      const duration = (Date.now() - startTime) / 1000;
      
      this.lastUpdate = new Date();
      this.calculateNextUpdate();
      
      logger.info('✅ 定期知識ベース更新完了');
      logger.info(`📊 更新後統計: 文書数=${afterStats.documentCount}, 文字数=${afterStats.totalCharacters}`);
      logger.info(`⏱️ 更新時間: ${duration.toFixed(2)}秒`);
      logger.info(`📅 次回更新予定: ${this.nextUpdate?.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
      
      // 更新結果の通知（必要に応じて）
      await this.notifyUpdateComplete(beforeStats, afterStats, duration);
      
    } catch (error) {
      logger.errorDetail('定期知識ベース更新エラー:', error);
      
      // エラー通知（必要に応じて）
      await this.notifyUpdateError(error);
      
    } finally {
      this.updateInProgress = false;
    }
  }

  // 手動更新実行
  async performManualUpdate() {
    logger.info('🔧 手動知識ベース更新開始');
    return await this.performScheduledUpdate();
  }

  // 次回更新時刻を計算
  calculateNextUpdate() {
    const now = new Date();
    const nextMonday = new Date();
    
    // 現在の曜日を取得（0=日曜日, 1=月曜日）
    const currentDay = now.getDay();
    const daysUntilMonday = currentDay === 0 ? 1 : (8 - currentDay);
    
    // 次の月曜日の日付を設定
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(3, 0, 0, 0); // 午前3時に設定
    
    // もし今日が月曜日で、まだ午前3時前なら今日の午前3時
    if (currentDay === 1 && now.getHours() < 3) {
      nextMonday.setDate(now.getDate());
    }
    
    this.nextUpdate = nextMonday;
  }

  // 知識ベース統計取得
  getKnowledgeBaseStats() {
    try {
      const stats = knowledgeBaseService.getStats();
      return {
        documentCount: stats.totalDocuments || 0,
        totalCharacters: stats.totalCharacters || 0,
        imageCount: stats.totalImages || 0
      };
    } catch (error) {
      logger.warn('知識ベース統計取得エラー:', error.message);
      return {
        documentCount: 0,
        totalCharacters: 0,
        imageCount: 0
      };
    }
  }

  // 更新完了通知
  async notifyUpdateComplete(beforeStats, afterStats, duration) {
    try {
      const message = this.formatUpdateNotification(beforeStats, afterStats, duration, 'success');
      
      // ログに記録（必要に応じてDiscordチャンネルに通知も可能）
      logger.info('📢 更新完了通知:', message);
      
      // 将来的にDiscord通知を追加する場合
      // await this.sendDiscordNotification(message);
      
    } catch (error) {
      logger.warn('更新完了通知エラー:', error.message);
    }
  }

  // 更新エラー通知
  async notifyUpdateError(error) {
    try {
      const message = `❌ **知識ベース定期更新エラー**\n\n` +
                     `🕐 **エラー発生時刻**: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n` +
                     `📝 **エラー内容**: ${error.message}\n\n` +
                     `🔧 **対応**: システム管理者に確認を依頼してください`;
      
      logger.error('📢 更新エラー通知:', message);
      
      // 将来的にDiscord通知やメール通知を追加する場合
      // await this.sendDiscordNotification(message);
      
    } catch (notifyError) {
      logger.warn('更新エラー通知送信エラー:', notifyError.message);
    }
  }

  // 更新通知メッセージフォーマット
  formatUpdateNotification(beforeStats, afterStats, duration, status) {
    const docChange = afterStats.documentCount - beforeStats.documentCount;
    const charChange = afterStats.totalCharacters - beforeStats.totalCharacters;
    
    let message = status === 'success' 
      ? `✅ **知識ベース定期更新完了**\n\n`
      : `❌ **知識ベース定期更新エラー**\n\n`;
    
    message += `🕐 **更新時刻**: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n`;
    message += `⏱️ **更新時間**: ${duration.toFixed(2)}秒\n\n`;
    
    message += `📊 **更新結果**:\n`;
    message += `• 文書数: ${beforeStats.documentCount} → ${afterStats.documentCount} (${docChange >= 0 ? '+' : ''}${docChange})\n`;
    message += `• 文字数: ${beforeStats.totalCharacters.toLocaleString()} → ${afterStats.totalCharacters.toLocaleString()} (${charChange >= 0 ? '+' : ''}${charChange.toLocaleString()})\n\n`;
    
    message += `📅 **次回更新予定**: ${this.nextUpdate?.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`;
    
    return message;
  }

  // スケジューラー状態取得
  getStatus() {
    return {
      isRunning: this.isRunning,
      updateInProgress: this.updateInProgress,
      lastUpdate: this.lastUpdate,
      nextUpdate: this.nextUpdate,
      cronExpression: '0 0 3 * * 1', // 毎週月曜日午前3時
      timezone: 'Asia/Tokyo'
    };
  }

  // 即座に更新をテスト実行（開発・テスト用）
  async testUpdate() {
    logger.info('🧪 知識ベース更新テスト実行');
    return await this.performScheduledUpdate();
  }
}

// シングルトンインスタンス
const knowledgeScheduler = new KnowledgeScheduler();

module.exports = {
  knowledgeScheduler,
  KnowledgeScheduler
};
