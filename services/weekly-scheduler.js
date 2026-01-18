/**
 * 週次スケジューラーサービス v1.1.0
 * 
 * 【機能】
 * - 毎週火曜日18時（日本時間）にDiscord Webhook送信
 * - node-cronを使用したスケジュール実行
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const { discordWebhookService } = require('./discord-webhook');

class WeeklySchedulerService {
  constructor() {
    this.weeklyTask = null;
    this.isRunning = false;
  }

  /**
   * スケジューラー開始
   */
  start() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⏰ [SCHEDULER] 週次スケジューラー開始 v1.1.0');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // 毎週火曜日18時（日本時間 = UTC 9時）に実行
      // Cron式: 分 時 日 月 曜日
      // 0 9 * * 2 = 毎週火曜日 UTC 9:00 (JST 18:00)
      
      const TUESDAY_18_JST = '0 9 * * 2'; // UTC時間で指定
      
      this.weeklyTask = cron.schedule(TUESDAY_18_JST, async () => {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⏰ [SCHEDULER] 毎週火曜日18時の定期実行開始');
        console.log(`   実行時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        await this.runWeeklyTask();
      }, {
        timezone: 'UTC' // UTCタイムゾーンで実行
      });

      console.log('✅ [SCHEDULER] 毎週火曜日18時（JST）のタスク登録完了');
      console.log(`   Cron式: ${TUESDAY_18_JST} (UTC)`);
      console.log(`   日本時間: 毎週火曜日 18:00`);

      this.isRunning = true;
      
      console.log('\n📊 [SCHEDULER] 登録済みタスク一覧:');
      console.log('   1. 毎週火曜日 18:00 (JST) - Discord Webhook送信');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return true;

    } catch (error) {
      console.error('❌ [SCHEDULER] スケジューラー開始エラー:', error.message);
      throw error;
    }
  }

  /**
   * 毎週火曜日18時のタスク実行
   */
  async runWeeklyTask() {
    try {
      console.log('📨 [SCHEDULER] 週次タスク: Discord Webhook送信');

      // Discord Webhookで質問・回答を送信
      const result = await discordWebhookService.sendWeeklyMessages();

      if (result.success) {
        console.log(`✅ [SCHEDULER] 週次タスク完了: ${result.successCount}件送信成功`);
      } else {
        console.error('❌ [SCHEDULER] 週次タスク失敗:', result.error || result.message);
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return result;

    } catch (error) {
      console.error('❌ [SCHEDULER] 週次タスク実行エラー:', error.message);
      console.error(error.stack);
    }
  }

  /**
   * 手動実行：週次タスク（テスト用）
   */
  async executeWeeklyTaskManually() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 [SCHEDULER] 手動実行: 週次タスク（テスト）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return await this.runWeeklyTask();
  }

  /**
   * スケジューラー停止
   */
  stop() {
    console.log('⏹️ [SCHEDULER] スケジューラー停止中...');

    if (this.weeklyTask) {
      this.weeklyTask.stop();
      console.log('✅ [SCHEDULER] 週次タスク停止');
    }

    this.isRunning = false;
    console.log('✅ [SCHEDULER] スケジューラー停止完了');
  }

  /**
   * ステータス取得
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      weeklyTask: this.weeklyTask ? '稼働中' : '停止',
      schedule: {
        weekly: '毎週火曜日 18:00 (JST)'
      }
    };
  }
}

// シングルトンインスタンスをエクスポート
const weeklySchedulerService = new WeeklySchedulerService();

module.exports = { 
  weeklySchedulerService,
  WeeklySchedulerService 
};
