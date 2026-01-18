/**
 * Discord Webhook送信サービス v1.0.0
 * 
 * 【機能】
 * - 生徒情報スプレッドシートからWebhook URLを取得
 * - アクティブ会員のみに送信
 * - 「回答サンプル」から未使用のQ&Aをランダム選択
 * - フォーマットに従ってDiscord Webhookで送信
 * - 送信済みフラグを更新
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { google } = require('googleapis');

class DiscordWebhookService {
  constructor() {
    this.sheets = null;
    this.isInitialized = false;
    this.studentSpreadsheetId = process.env.STUDENT_SPREADSHEET_ID || '1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM';
    this.knowledgeSpreadsheetId = process.env.KNOWLEDGE_BASE_SPREADSHEET_ID;
  }

  /**
   * 初期化メソッド
   */
  async initialize() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📨 [WEBHOOK] Discord Webhook送信サービス初期化開始 v1.0.0');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Google Sheets API認証
      const auth = new google.auth.GoogleAuth({
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
          client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      this.sheets = google.sheets({ version: 'v4', auth });
      console.log('✅ [WEBHOOK] Google Sheets API認証成功');

      this.isInitialized = true;
      console.log('✅ [WEBHOOK] 初期化完了');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      return true;

    } catch (error) {
      console.error('❌ [WEBHOOK] 初期化失敗:', error.message);
      throw error;
    }
  }

  /**
   * アクティブ会員のWebhook URLリストを取得
   */
  async getActiveWebhooks() {
    try {
      const sheetName = '❶RAW_生徒様情報';
      
      // D列（会員ステータス）とI列（お役立ち_WH）を取得
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.studentSpreadsheetId,
        range: `${sheetName}!D:I`
      });

      const rows = response.data.values || [];
      
      if (rows.length === 0) {
        console.warn('⚠️ [WEBHOOK] 生徒情報が見つかりません');
        return [];
      }

      // ヘッダー行をスキップして処理
      const webhooks = [];
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const status = row[0]; // D列（インデックス0）
        const webhookUrl = row[5]; // I列（インデックス5）

        // 会員ステータスが「アクティブ」でWebhook URLが存在する場合のみ追加
        if (status === 'アクティブ' && webhookUrl && webhookUrl.startsWith('http')) {
          webhooks.push({
            url: webhookUrl,
            rowIndex: i + 1 // 行番号（1始まり）
          });
        }
      }

      console.log(`✅ [WEBHOOK] アクティブ会員のWebhook: ${webhooks.length}件`);
      
      return webhooks;

    } catch (error) {
      console.error('❌ [WEBHOOK] Webhook取得エラー:', error.message);
      throw error;
    }
  }

  /**
   * 未使用のQ&Aサンプルをランダムに1つ取得
   */
  async getRandomUnusedSample() {
    try {
      const sheetName = '回答サンプル';
      
      // A列〜D列を取得
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.knowledgeSpreadsheetId,
        range: `${sheetName}!A:D`
      });

      const rows = response.data.values || [];
      
      if (rows.length <= 1) {
        console.warn('⚠️ [WEBHOOK] Q&Aサンプルが見つかりません');
        return null;
      }

      // ヘッダー行を除いてデータ行を取得
      const dataRows = rows.slice(1);
      
      // 未使用のサンプルをフィルタリング（D列が'FALSE'または空）
      const unusedSamples = [];
      
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const timestamp = row[0];
        const question = row[1];
        const answer = row[2];
        const used = row[3];

        // 使用済みフラグがFALSEまたは空の場合
        if (used !== 'TRUE' && question && answer) {
          unusedSamples.push({
            timestamp,
            question,
            answer,
            used: used || 'FALSE',
            rowIndex: i + 2 // ヘッダー行があるため+2（スプレッドシートの行番号）
          });
        }
      }

      console.log(`📊 [WEBHOOK] 未使用サンプル: ${unusedSamples.length}件`);

      // 未使用サンプルがない場合、全てを再利用可能にする
      if (unusedSamples.length === 0) {
        console.log('⚠️ [WEBHOOK] 未使用サンプルがないため、全サンプルを再利用可能にします');
        await this.resetAllUsedFlags();
        
        // 再度取得
        return await this.getRandomUnusedSample();
      }

      // ランダムに1つ選択
      const randomIndex = Math.floor(Math.random() * unusedSamples.length);
      const selectedSample = unusedSamples[randomIndex];

      console.log(`✅ [WEBHOOK] サンプル選択: 行${selectedSample.rowIndex}`);
      console.log(`   質問: ${selectedSample.question.substring(0, 50)}...`);
      
      return selectedSample;

    } catch (error) {
      console.error('❌ [WEBHOOK] サンプル取得エラー:', error.message);
      throw error;
    }
  }

  /**
   * 全ての使用済みフラグをリセット
   */
  async resetAllUsedFlags() {
    try {
      const sheetName = '回答サンプル';
      
      // D列の全てのフラグを取得
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.knowledgeSpreadsheetId,
        range: `${sheetName}!D:D`
      });

      const rows = response.data.values || [];
      const dataRowCount = rows.length - 1; // ヘッダー行を除く

      if (dataRowCount <= 0) {
        return;
      }

      // 全てのフラグをFALSEに更新
      const resetValues = Array(dataRowCount).fill(['FALSE']);

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.knowledgeSpreadsheetId,
        range: `${sheetName}!D2:D${rows.length}`,
        valueInputOption: 'RAW',
        resource: { values: resetValues }
      });

      console.log(`✅ [WEBHOOK] 使用済みフラグをリセット（${dataRowCount}件）`);

    } catch (error) {
      console.error('❌ [WEBHOOK] フラグリセットエラー:', error.message);
      throw error;
    }
  }

  /**
   * 使用済みフラグを更新
   */
  async markAsUsed(rowIndex) {
    try {
      const sheetName = '回答サンプル';
      
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.knowledgeSpreadsheetId,
        range: `${sheetName}!D${rowIndex}`,
        valueInputOption: 'RAW',
        resource: { values: [['TRUE']] }
      });

      console.log(`✅ [WEBHOOK] 使用済みフラグ更新: 行${rowIndex}`);

    } catch (error) {
      console.error('❌ [WEBHOOK] フラグ更新エラー:', error.message);
      throw error;
    }
  }

  /**
   * Discord Webhookメッセージを送信
   */
  async sendWebhookMessage(webhookUrl, question, answer) {
    try {
      // Discordメッセージフォーマット
      const content = `# 【わなみさん】の使い方についてお知らせ☆

生徒のみなさん、お疲れ様です！ 新人マネージャーの「わなみ」です！
今日は「わなみさん」システムを使う事でどんな課題が解決できるかご紹介します！

質問例を参考に沢山「わなみさん」を使ってくださいね☆

【質問例】
${question}

【回答例】
${answer}`;

      // Webhook送信
      await axios.post(webhookUrl, {
        content: content,
        username: 'わなみさん',
        avatar_url: '' // オプション: アバター画像URL
      });

      console.log('✅ [WEBHOOK] メッセージ送信成功');
      return true;

    } catch (error) {
      console.error('❌ [WEBHOOK] メッセージ送信エラー:', error.message);
      
      // エラーの詳細をログ出力（デバッグ用）
      if (error.response) {
        console.error('   レスポンスステータス:', error.response.status);
        console.error('   レスポンスデータ:', JSON.stringify(error.response.data));
      }
      
      return false;
    }
  }

  /**
   * 毎週の定期送信タスク
   */
  async sendWeeklyMessages() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📨 [WEBHOOK] 毎週の定期送信タスク開始');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // 1. アクティブ会員のWebhookリストを取得
      const webhooks = await this.getActiveWebhooks();
      
      if (webhooks.length === 0) {
        console.warn('⚠️ [WEBHOOK] 送信先がありません');
        return { success: false, message: '送信先なし' };
      }

      // 2. 未使用のQ&Aサンプルをランダム選択
      const sample = await this.getRandomUnusedSample();
      
      if (!sample) {
        console.error('❌ [WEBHOOK] 送信するサンプルがありません');
        return { success: false, message: 'サンプルなし' };
      }

      console.log(`📝 今週のサンプル:`);
      console.log(`   質問: ${sample.question}`);
      console.log(`   回答: ${sample.answer.substring(0, 100)}...`);
      console.log(`\n📨 送信先: ${webhooks.length}件\n`);

      // 3. 全てのWebhookに送信
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < webhooks.length; i++) {
        const webhook = webhooks[i];
        
        console.log(`[${i + 1}/${webhooks.length}] 送信中...`);
        
        const success = await this.sendWebhookMessage(
          webhook.url,
          sample.question,
          sample.answer
        );

        if (success) {
          successCount++;
          console.log(`✅ [${i + 1}/${webhooks.length}] 送信成功`);
        } else {
          failCount++;
          console.log(`❌ [${i + 1}/${webhooks.length}] 送信失敗`);
        }

        // レート制限対策: 各送信間に1秒待機
        if (i < webhooks.length - 1) {
          await this.sleep(1000);
        }
      }

      // 4. 使用済みフラグを更新
      await this.markAsUsed(sample.rowIndex);

      // 結果サマリー
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 [WEBHOOK] 送信完了');
      console.log(`   成功: ${successCount}件`);
      console.log(`   失敗: ${failCount}件`);
      console.log(`   使用サンプル: 行${sample.rowIndex}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        success: true,
        successCount,
        failCount,
        totalWebhooks: webhooks.length,
        sampleUsed: sample.rowIndex
      };

    } catch (error) {
      console.error('❌ [WEBHOOK] 定期送信タスクエラー:', error.message);
      console.error(error.stack);
      
      return {
        success: false,
        error: error.message
      };
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
      initialized: this.isInitialized,
      sheets_api: this.sheets ? '接続済み' : '未接続',
      student_spreadsheet_id: this.studentSpreadsheetId,
      knowledge_spreadsheet_id: this.knowledgeSpreadsheetId
    };
  }
}

// シングルトンインスタンスをエクスポート
const discordWebhookService = new DiscordWebhookService();

module.exports = { 
  discordWebhookService,
  DiscordWebhookService 
};
