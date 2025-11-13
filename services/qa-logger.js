// services/qa-logger.js - Q&A記録サービス

const { google } = require('googleapis');
const logger = require('../utils/logger');

class QALoggerService {
  constructor() {
    this.spreadsheetId = null;
    this.sheetName = 'QA_Log';
    this.isInitialized = false;
  }

  /**
   * サービスの初期化
   */
  async initialize(spreadsheetId) {
    try {
      this.spreadsheetId = spreadsheetId;
      
      // スプレッドシートの存在確認とシート作成
      await this.ensureSheetExists();
      
      this.isInitialized = true;
      logger.info('✅ Q&A記録サービス初期化完了');
      logger.info(`📊 記録先: スプレッドシートID ${spreadsheetId}, シート名 "${this.sheetName}"`);
      
      return true;
    } catch (error) {
      logger.error('❌ Q&A記録サービス初期化エラー:', error);
      throw error;
    }
  }

  /**
   * シートの存在を確認し、なければ作成
   */
  async ensureSheetExists() {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });

      // スプレッドシートの情報を取得
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

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
                    gridProperties: {
                      rowCount: 1000,
                      columnCount: 10,
                      frozenRowCount: 1
                    }
                  }
                }
              }
            ]
          }
        });

        // ヘッダー行を追加
        await this.addHeaderRow(sheets);
        
        logger.info(`✅ シート "${this.sheetName}" を作成しました`);
      } else {
        logger.info(`✅ シート "${this.sheetName}" は既に存在します`);
      }
    } catch (error) {
      logger.error('❌ シート確認・作成エラー:', error);
      throw error;
    }
  }

  /**
   * ヘッダー行を追加
   */
  async addHeaderRow(sheets) {
    const headerRow = [
      'タイムスタンプ',
      'ユーザー名',
      'ユーザーID',
      'チャンネル名',
      'チャンネルID',
      'サーバー名',
      '質問内容',
      '回答内容',
      '回答文字数',
      '処理時間（秒）'
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${this.sheetName}!A1:J1`,
      valueInputOption: 'RAW',
      resource: {
        values: [headerRow]
      }
    });

    // ヘッダー行を太字にする
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      resource: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: await this.getSheetId(sheets),
                startRowIndex: 0,
                endRowIndex: 1
              },
              cell: {
                userEnteredFormat: {
                  textFormat: {
                    bold: true
                  },
                  backgroundColor: {
                    red: 0.9,
                    green: 0.9,
                    blue: 0.9
                  }
                }
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor)'
            }
          }
        ]
      }
    });
  }

  /**
   * シートIDを取得
   */
  async getSheetId(sheets) {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
    });

    const sheet = spreadsheet.data.sheets.find(
      s => s.properties.title === this.sheetName
    );

    return sheet ? sheet.properties.sheetId : 0;
  }

  /**
   * Q&Aを記録
   */
  async logQA(qaData) {
    try {
      if (!this.isInitialized) {
        logger.warn('⚠️ Q&A記録サービスが初期化されていません');
        return false;
      }

      const {
        timestamp,
        userName,
        userId,
        channelName,
        channelId,
        guildName,
        question,
        answer,
        processingTime
      } = qaData;

      // タイムスタンプをフォーマット
      const formattedTimestamp = timestamp 
        ? new Date(timestamp).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
        : new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

      // 回答文字数を計算
      const answerLength = answer ? answer.length : 0;

      // 処理時間を秒に変換（ミリ秒の場合）
      const processingTimeSec = processingTime 
        ? (processingTime > 1000 ? (processingTime / 1000).toFixed(2) : processingTime.toFixed(2))
        : '-';

      const row = [
        formattedTimestamp,
        userName || '-',
        userId || '-',
        channelName || '-',
        channelId || '-',
        guildName || '-',
        question || '-',
        answer || '-',
        answerLength,
        processingTimeSec
      ];

      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });

      // 既存の行数を取得
      const existingData = await sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:A`,
      });

      const nextRow = (existingData.data.values?.length || 0) + 1;

      // データを追加
      await sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A${nextRow}`,
        valueInputOption: 'RAW',
        resource: {
          values: [row]
        }
      });

      logger.info(`✅ Q&A記録完了: ${userName} - 質問${question.substring(0, 30)}... → 回答${answerLength}文字`);
      return true;

    } catch (error) {
      logger.error('❌ Q&A記録エラー:', error);
      return false;
    }
  }

  /**
   * 統計情報を取得
   */
  async getStats() {
    try {
      if (!this.isInitialized) {
        return null;
      }

      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });

      const sheets = google.sheets({ version: 'v4', auth });

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A2:J`,
      });

      const rows = response.data.values || [];
      
      return {
        totalQAs: rows.length,
        lastUpdated: rows.length > 0 ? rows[rows.length - 1][0] : null,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`
      };

    } catch (error) {
      logger.error('❌ 統計情報取得エラー:', error);
      return null;
    }
  }
}

// シングルトンインスタンス
const qaLoggerService = new QALoggerService();

module.exports = {
  qaLoggerService,
  initialize: (spreadsheetId) => qaLoggerService.initialize(spreadsheetId),
  logQA: (qaData) => qaLoggerService.logQA(qaData),
  getStats: () => qaLoggerService.getStats(),
  default: qaLoggerService
};
