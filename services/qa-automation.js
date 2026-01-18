/**
 * Q&A自動化サービス v1.0.0
 * 
 * 【機能】
 * - 「回答サンプル」シートの件数を監視
 * - 30個未満の場合、自動的にQ&Aペアを生成
 * - 1回の実行で最大5個まで生成（API制限対策）
 */

const logger = require('../utils/logger');
const { qaGeneratorService } = require('./qa-generator');

class QAAutomationService {
  constructor() {
    this.isRunning = false;
    this.targetCount = 30;  // 目標件数
    this.batchSize = 5;     // 1回の実行で生成する最大件数
  }

  /**
   * Q&Aサンプル自動生成タスク
   */
  async runGenerationTask() {
    if (this.isRunning) {
      console.log('⚠️ [QA-AUTOMATION] 既に実行中のタスクがあります');
      return;
    }

    this.isRunning = true;

    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔄 [QA-AUTOMATION] Q&A自動生成タスク開始');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // 現在の件数を確認
      const currentCount = await qaGeneratorService.getSampleCount();
      console.log(`📊 現在のサンプル数: ${currentCount}/${this.targetCount}`);

      if (currentCount >= this.targetCount) {
        console.log('✅ [QA-AUTOMATION] 目標件数に到達済み。生成をスキップします。');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return { 
          success: true, 
          generated: 0, 
          message: '既に30個のサンプルが存在します' 
        };
      }

      // 不足数を計算
      const needed = this.targetCount - currentCount;
      const toGenerate = Math.min(needed, this.batchSize);
      
      console.log(`📝 不足数: ${needed}個`);
      console.log(`🎯 今回生成数: ${toGenerate}個`);

      // Q&Aペアを生成
      const results = [];
      let successCount = 0;
      let failCount = 0;

      for (let i = 1; i <= toGenerate; i++) {
        try {
          console.log(`\n[${i}/${toGenerate}] Q&Aペア生成中...`);
          
          const result = await qaGeneratorService.generateAndSaveOne();
          results.push(result);
          successCount++;

          console.log(`✅ [${i}/${toGenerate}] 生成成功`);

          // API制限対策: 各生成間に2秒待機
          if (i < toGenerate) {
            console.log('⏳ 2秒待機中...');
            await this.sleep(2000);
          }

        } catch (error) {
          console.error(`❌ [${i}/${toGenerate}] 生成失敗:`, error.message);
          failCount++;
          
          // エラーが発生しても続行（最大5回まで）
          if (failCount >= 3) {
            console.error('❌ エラーが3回発生したため、処理を中断します');
            break;
          }
        }
      }

      // 最終結果
      const finalCount = await qaGeneratorService.getSampleCount();
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 [QA-AUTOMATION] タスク完了');
      console.log(`   成功: ${successCount}個`);
      console.log(`   失敗: ${failCount}個`);
      console.log(`   最終件数: ${finalCount}/${this.targetCount}`);
      
      if (finalCount >= this.targetCount) {
        console.log('🎉 目標件数30個に到達しました！');
      } else {
        console.log(`📌 残り${this.targetCount - finalCount}個が必要です`);
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        success: true,
        generated: successCount,
        failed: failCount,
        currentCount: finalCount,
        targetCount: this.targetCount,
        remaining: Math.max(0, this.targetCount - finalCount)
      };

    } catch (error) {
      console.error('❌ [QA-AUTOMATION] タスク実行エラー:', error.message);
      console.error(error.stack);
      
      return {
        success: false,
        error: error.message
      };

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 強制的に30個生成するタスク（初回セットアップ用）
   */
  async generateFullSet() {
    if (this.isRunning) {
      console.log('⚠️ [QA-AUTOMATION] 既に実行中のタスクがあります');
      return;
    }

    this.isRunning = true;

    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 [QA-AUTOMATION] フルセット生成タスク開始（30個）');
      console.log('⚠️  この処理には約5〜10分かかります');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // 既存のサンプルをクリア（オプション）
      const currentCount = await qaGeneratorService.getSampleCount();
      console.log(`📊 現在のサンプル数: ${currentCount}`);

      let successCount = 0;
      let failCount = 0;

      // 30個生成
      for (let i = 1; i <= this.targetCount; i++) {
        try {
          console.log(`\n[${i}/${this.targetCount}] Q&Aペア生成中...`);
          
          await qaGeneratorService.generateAndSaveOne();
          successCount++;

          console.log(`✅ [${i}/${this.targetCount}] 生成成功`);

          // API制限対策: 各生成間に3秒待機
          if (i < this.targetCount) {
            console.log('⏳ 3秒待機中...');
            await this.sleep(3000);
          }

          // 進捗を定期的に表示
          if (i % 5 === 0) {
            console.log(`\n📊 進捗: ${i}/${this.targetCount} (${Math.round(i / this.targetCount * 100)}%)\n`);
          }

        } catch (error) {
          console.error(`❌ [${i}/${this.targetCount}] 生成失敗:`, error.message);
          failCount++;
          
          // エラーが発生しても続行
          console.log('⏳ エラー後5秒待機...');
          await this.sleep(5000);
        }
      }

      // 最終結果
      const finalCount = await qaGeneratorService.getSampleCount();
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎉 [QA-AUTOMATION] フルセット生成完了！');
      console.log(`   成功: ${successCount}個`);
      console.log(`   失敗: ${failCount}個`);
      console.log(`   最終件数: ${finalCount}/${this.targetCount}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        success: true,
        generated: successCount,
        failed: failCount,
        finalCount: finalCount
      };

    } catch (error) {
      console.error('❌ [QA-AUTOMATION] フルセット生成エラー:', error.message);
      return {
        success: false,
        error: error.message
      };

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * スリープ関数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * ステータス取得
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      targetCount: this.targetCount,
      batchSize: this.batchSize
    };
  }
}

// シングルトンインスタンスをエクスポート
const qaAutomationService = new QAAutomationService();

module.exports = { 
  qaAutomationService,
  QAAutomationService 
};
