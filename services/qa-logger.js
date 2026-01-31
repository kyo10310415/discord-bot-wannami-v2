/**
 * Q&A記録サービス v15.5.3
 * 
 * 【機能】
 * - ユーザーの質問と回答をGoogleスプレッドシートに自動記録
 * - タイムスタンプ、ユーザー情報、チャンネル情報を記録
 * - 処理時間・回答長・質問タイプなどの統計情報を記録
 * 
 * 【v15.5.3 変更点】
 * - channelName, guildName, response, responseLength, processingTime, questionType フィールドを追加
 * - initialize メソッドを追加（index.jsからの初期化対応）
 * - エラーハンドリング強化
 */

const { google } = require('googleapis');
const logger = require('../utils/logger');

class QALoggerService {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = null;
    this.isInitialized = false;
  }

  /**
   * 初期化メソッド
   * @param {string} spreadsheetId - GoogleスプレッドシートのID
   */
  async initialize(spreadsheetId) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 [QA-LOGGER] Q&A記録サービス初期化開始 v15.5.3');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (!spreadsheetId) {
      throw new Error('スプレッドシートIDが指定されていません');
    }

    this.spreadsheetId = spreadsheetId;
    console.log(`📊 [QA-LOGGER] スプレッドシートID: ${spreadsheetId.substring(0, 20)}...`);

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
      console.log('✅ [QA-LOGGER] Google Sheets API認証成功');

      // スプレッドシートへのアクセステスト
      await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId
      });
      console.log('✅ [QA-LOGGER] スプレッドシートアクセス確認完了');

      // ヘッダー行の確認と作成
      await this.ensureHeaders();

      this.isInitialized = true;
      console.log('✅ [QA-LOGGER] 初期化完了');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      return true;

    } catch (error) {
      console.error('❌ [QA-LOGGER] 初期化失敗:', error.message);
      throw error;
    }
  }

  /**
   * ヘッダー行の確認と作成
   */
  async ensureHeaders() {
    try {
      const sheetName = 'Q&A記録'; // デフォルトシート名
      
      // 既存データを確認
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A1:M1`
      });

      if (!response.data.values || response.data.values.length === 0) {
        // ヘッダー行が存在しない場合は作成
        console.log('📝 [QA-LOGGER] ヘッダー行を作成中...');
        
        const headers = [
          'タイムスタンプ',       // A列
          'ユーザーID',          // B列
          'ユーザー名',          // C列
          'チャンネル名',        // D列
          'チャンネルID',        // E列
          'サーバー名',          // F列
          '質問内容',            // G列
          '回答内容',            // H列
          '回答文字数',          // I列
          '処理時間(ms)',        // J列
          '質問タイプ',          // K列
          '回答ステータス',      // L列
          'サーバーID'           // M列
        ];

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${sheetName}!A1:M1`,
          valueInputOption: 'RAW',
          resource: { values: [headers] }
        });

        console.log('✅ [QA-LOGGER] ヘッダー行作成完了');
      } else {
        console.log('✅ [QA-LOGGER] ヘッダー行確認完了');
      }
    } catch (error) {
      console.warn('⚠️ [QA-LOGGER] ヘッダー確認/作成失敗（記録は続行）:', error.message);
    }
  }

  /**
   * Q&A記録メソッド
   * @param {Object} qaData - Q&Aデータ
   */
  async logQA(qaData) {
    if (!this.isInitialized) {
      console.warn('⚠️ [QA-LOGGER] 未初期化のため記録をスキップ');
      return false;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 [QA-LOGGER] Q&A記録処理開始');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      const {
        userId,
        username,
        channelName,
        channelId,
        guildName,
        guildId,          // ✅ 追加
        question,
        response,
        responseLength,
        processingTime,
        questionType,
        responseStatus,   // ✅ 追加
        hasImage,
        messageId
      } = qaData;

      // デバッグログ
      console.log('📊 [DEBUG] 記録データ:');
      console.log(`  ユーザー: ${username} (${userId})`);
      console.log(`  チャンネル: ${channelName} (${channelId})`);
      console.log(`  サーバー: ${guildName} (${guildId || 'N/A'})`);
      console.log(`  質問長: ${question?.length || 0}文字`);
      console.log(`  回答長: ${responseLength || response?.length || 0}文字`);
      console.log(`  処理時間: ${processingTime || 'N/A'}ms`);
      console.log(`  質問タイプ: ${questionType || '通常質問'}`);
      console.log(`  回答ステータス: ${responseStatus || '成功'}`);

      // スプレッドシートに書き込むデータ
      const row = [
        new Date().toISOString(),                    // A: タイムスタンプ
        userId || '',                                // B: ユーザーID
        username || '',                              // C: ユーザー名
        channelName || 'DM',                         // D: チャンネル名
        channelId || '',                             // E: チャンネルID
        guildName || 'DM',                           // F: サーバー名
        question || '',                              // G: 質問内容
        response || '',                              // H: 回答内容
        responseLength || (response?.length || 0),   // I: 回答文字数
        processingTime || 0,                         // J: 処理時間(ms)
        questionType || '通常質問',                  // K: 質問タイプ
        responseStatus || '成功',                    // L: 回答ステータス
        guildId || ''                                // M: サーバーID
      ];

      // スプレッドシートに追記
      const sheetName = 'Q&A記録';
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:M`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [row] }
      });

      console.log('✅ [QA-LOGGER] スプレッドシート書き込み成功');
      console.log(`📊 記録ID: ${messageId}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return true;

    } catch (error) {
      console.error('❌ [QA-LOGGER] 記録失敗:', error.message);
      console.error('❌ [QA-LOGGER] スタックトレース:', error.stack);
      
      // エラーでも処理は継続（Bot動作に影響を与えない）
      return false;
    }
  }

  /**
   * 統計情報取得メソッド
   */
  async getStats() {
    if (!this.isInitialized) {
      return {
        initialized: false,
        message: 'Q&A記録サービスが初期化されていません'
      };
    }

    try {
      const sheetName = 'Q&A記録';
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${sheetName}!A:M`
      });

      const rows = response.data.values || [];
      const dataRows = rows.slice(1); // ヘッダー行を除く

      return {
        initialized: true,
        total_records: dataRows.length,
        spreadsheet_id: this.spreadsheetId,
        last_updated: new Date().toISOString(),
        headers: rows[0] || []
      };

    } catch (error) {
      console.error('❌ [QA-LOGGER] 統計取得失敗:', error.message);
      return {
        initialized: true,
        error: error.message
      };
    }
  }

  /**
   * ステータス取得メソッド
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      spreadsheet_id: this.spreadsheetId ? '設定済み' : '未設定',
      sheets_api: this.sheets ? '接続済み' : '未接続'
    };
  }
}

// シングルトンインスタンスをエクスポート
const qaLoggerService = new QALoggerService();

module.exports = { 
  qaLoggerService,
  QALoggerService 
};
