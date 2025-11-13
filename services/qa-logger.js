// services/qa-logger.js - Q&A記録サービス（エラー修正版）
// Version: 15.5.1
// 更新日: 2025-11-13
// 修正内容: JSON.parse()エラーの修正、環境変数読み込み改善

const { google } = require('googleapis');
const logger = require('../utils/logger');
const env = require('../config/environment'); // ✅ environment.jsから環境変数取得

class QALoggerService {
  constructor() {
    this.spreadsheetId = null;
    this.sheetName = 'Q&A記録';
    this.initialized = false;
  }

  /**
   * サービスの初期化
   * @param {string} spreadsheetId - スプレッドシートID
   */
  async initialize(spreadsheetId) {
    try {
      if (!spreadsheetId) {
        throw new Error('スプレッドシートIDが指定されていません');
      }

      this.spreadsheetId = spreadsheetId;
      await this.ensureSheetExists();
      this.initialized = true;
      logger.success('Q&A記録サービス初期化完了');
    } catch (error) {
      logger.error('Q&A記録サービス初期化エラー:', error.message);
      logger.errorDetail('初期化詳細エラー:', error);
      throw error;
    }
  }

  /**
   * Google Sheets認証オブジェクトを取得
   */
  async getAuthClient() {
    try {
      // ✅ 修正: environment.jsから認証情報を取得
      const credentials = env.GOOGLE_SHEETS_CREDENTIALS;
      
      if (!credentials) {
        throw new Error('GOOGLE_SHEETS_CREDENTIALS環境変数が設定されていません');
      }

      // ✅ 修正: 既にオブジェクトの場合はそのまま使用、文字列の場合はパース
      let parsedCredentials;
      if (typeof credentials === 'string') {
        try {
          parsedCredentials = JSON.parse(credentials);
        } catch (parseError) {
          logger.error('認証情報のJSON解析エラー:', parseError.message);
          throw new Error('GOOGLE_SHEETS_CREDENTIALS環境変数のJSON形式が不正です');
        }
      } else if (typeof credentials === 'object') {
        parsedCredentials = credentials;
      } else {
        throw new Error('GOOGLE_SHEETS_CREDENTIALS環境変数の形式が不正です');
      }

      const auth = new google.auth.GoogleAuth({
        credentials: parsedCredentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      return auth;
    } catch (error) {
      logger.error('Google Sheets認証エラー:', error.message);
      throw error;
    }
  }

  /**
   * シートの存在を確認し、なければ作成
   */
  async ensureSheetExists() {
    try {
      const auth = await this.getAuthClient();
      const sheets = google.sheets({ version: 'v4', auth });

      // スプレッドシートの情報を取得
      logger.debug(`📊 スプレッドシート情報取得中: ${this.spreadsheetId}`);
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      // ✅ 修正: response.dataではなくspreadsheet.dataを直接使用
      if (!spreadsheet.data || !spreadsheet.data.sheets) {
        throw new Error('スプレッドシート情報の取得に失敗しました');
      }

      // シートが存在するか確認
      const sheetExists = spreadsheet.data.sheets.some(
        sheet => sheet.properties.title === this.sheetName
      );

      if (!sheetExists) {
        logger.info(`📝 シート "${this.sheetName}" が存在しないため作成します`);
        
        // シートを作成
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          resource: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: this.sheetName,
                  },
                },
              },
            ],
          },
        });

        logger.success(`✅ シート "${this.sheetName}" を作成しました`);

        // ヘッダー行を追加
        await this.addHeaderRow(sheets);
      } else {
        logger.info(`✅ シート "${this.sheetName}" は既に存在します`);
      }
    } catch (error) {
      logger.error('シート確認・作成エラー:', error.message);
      logger.errorDetail('シート詳細エラー:', error);
      throw error;
    }
  }

  /**
   * ヘッダー行を追加
   */
  async addHeaderRow(sheets) {
    try {
      const headers = [
        'タイムスタンプ',
        'ユーザー名',
        'ユーザーID',
        'チャンネル名',
        'チャンネルID',
        'サーバー名',
        '質問内容',
        '回答内容',
        '回答文字数',
        '処理時間(ms)',
        '質問タイプ'
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:K1`,
        valueInputOption: 'RAW',
        resource: {
          values: [headers],
        },
      });

      logger.success('✅ ヘッダー行を追加しました');
    } catch (error) {
      logger.error('ヘッダー行追加エラー:', error.message);
      throw error;
    }
  }

  /**
   * Q&Aデータを記録
   * @param {Object} qaData - Q&Aデータ
   */
  async logQA(qaData) {
    if (!this.initialized) {
      logger.warn('⚠️ Q&A記録サービスが初期化されていません');
      return;
    }

    try {
      const auth = await this.getAuthClient();
      const sheets = google.sheets({ version: 'v4', auth });

      // タイムスタンプ（日本時間）
      const timestamp = new Date().toLocaleString('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const row = [
        timestamp,
        qaData.username || '',
        qaData.userId || '',
        qaData.channelName || '',
        qaData.channelId || '',
        qaData.guildName || '',
        qaData.question || '',
        qaData.response || '',
        qaData.responseLength || 0,
        qaData.processingTime || 0,
        qaData.questionType || '通常質問'
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:K`,
        valueInputOption: 'RAW',
        resource: {
          values: [row],
        },
      });

      logger.debug(`📊 Q&A記録追加: ${qaData.username} - ${qaData.question?.substring(0, 50)}...`);
    } catch (error) {
      logger.error('Q&A記録追加エラー:', error.message);
      logger.errorDetail('Q&A記録詳細エラー:', error);
      throw error;
    }
  }

  /**
   * Q&A記録の統計情報を取得
   */
  async getStats() {
    if (!this.initialized) {
      return {
        totalRecords: 0,
        error: 'サービスが初期化されていません'
      };
    }

    try {
      const auth = await this.getAuthClient();
      const sheets = google.sheets({ version: 'v4', auth });

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:K`,
      });

      const rows = response.data.values || [];
      const dataRows = rows.slice(1); // ヘッダー行を除く

      return {
        totalRecords: dataRows.length,
        lastUpdated: dataRows.length > 0 ? dataRows[dataRows.length - 1][0] : null,
        spreadsheetId: this.spreadsheetId,
        sheetName: this.sheetName
      };
    } catch (error) {
      logger.error('統計情報取得エラー:', error.message);
      return {
        totalRecords: 0,
        error: error.message
      };
    }
  }
}

// シングルトンインスタンス
const qaLoggerService = new QALoggerService();

module.exports = {
  qaLoggerService,
  QALoggerService
};
