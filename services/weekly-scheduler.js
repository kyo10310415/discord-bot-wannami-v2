/**
 * 週次スケジューラーサービス v1.0.0
 * 
 * 【機能】
 * - 毎週火曜日18時（日本時間）にDiscord Webhook送信
 * - Q&Aサンプルの自動生成（30個未満の場合）
 * - node-cronを使用したスケジュール実行
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const { qaAutomationService } = require('./qa-automation');
const { discordWebhookService } = require('./discord-webhook');

class WeeklySchedulerService {
  constructor() {
    this.weeklyTask = null;
    this.dailyCheckTask = null;
    this.isRunning = false;
  }

  /**
   * スケジューラー開始
   */
  start() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⏰ [SCHEDULER] 週次スケジューラー開始 v1.0.0');
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

      // 毎日深夜2時（UTC 17時 = JST 2:00）にQ&Aサンプルチェック
      const DAILY_CHECK = '0 17 * * *'; // 毎日 UTC 17:00 (JST 2:00)
      
      this.dailyCheckTask = cron.schedule(DAILY_CHECK, async () => {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 [SCHEDULER] 毎日のQ&Aサンプルチェック実行');
        console.log(`   実行時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        await this.runDailyCheck();
      }, {
        timezone: 'UTC'
      });

      console.log('✅ [SCHEDULER] 毎日深夜2時（JST）のチェックタスク登録完了');
      console.log(`   Cron式: ${DAILY_CHECK} (UTC)`);
      console.log(`   日本時間: 毎日 2:00`);

      this.isRunning = true;
      
      console.log('\n📊 [SCHEDULER] 登録済みタスク一覧:');
      console.log('   1. 毎週火曜日 18:00 (JST) - Discord Webhook送信');
      console.log('   2. 毎日 2:00 (JST) - Q&Aサンプル自動補充チェック');
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
   * 毎日のQ&Aサンプルチェックタスク
   */
  async runDailyCheck() {
    try {
      console.log('🔍 [SCHEDULER] 日次チェック: Q&Aサンプル自動補充');

      // Q&Aサンプル自動生成（30個未満の場合のみ）
      const result = await qaAutomationService.runGenerationTask();

      if (result.success && result.generated > 0) {
        console.log(`✅ [SCHEDULER] 日次チェック完了: ${result.generated}個生成`);
        console.log(`   現在の件数: ${result.currentCount}/${result.targetCount}`);
      } else if (result.success && result.generated === 0) {
        console.log('✅ [SCHEDULER] 日次チェック完了: サンプル充足済み');
      } else {
        console.error('❌ [SCHEDULER] 日次チェック失敗:', result.error);
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return result;

    } catch (error) {
      console.error('❌ [SCHEDULER] 日次チェック実行エラー:', error.message);
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
   * 手動実行：日次チェックタスク（テスト用）
   */
  async executeDailyCheckManually() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 [SCHEDULER] 手動実行: 日次チェック（テスト）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return await this.runDailyCheck();
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

    if (this.dailyCheckTask) {
      this.dailyCheckTask.stop();
      console.log('✅ [SCHEDULER] 日次チェックタスク停止');
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
      dailyCheckTask: this.dailyCheckTask ? '稼働中' : '停止',
      schedule: {
        weekly: '毎週火曜日 18:00 (JST)',
        daily: '毎日 2:00 (JST)'
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
