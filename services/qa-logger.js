// services/qa-logger.js - Q&A記録サービス（改善版）
// Version: 15.5.2
// 更新日: 2025-11-13
// 変更内容: 
//   - 回答ステータス列を追加
//   - 行の高さ固定、テキスト折り返し無効化

const { google } = require('googleapis');
const logger = require('../utils/logger');
const env = require('../config/environment');

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
      const credentials = env.GOOGLE_SHEETS_CREDENTIALS;
      
      if (!credentials) {
        throw new Error('GOOGLE_SHEETS_CREDENTIALS環境変数が設定されていません');
      }

      // 既にオブジェクトの場合はそのまま使用、文字列の場合はパース
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

      if (!spreadsheet.data || !spreadsheet.data.sheets) {
        throw new Error('スプレッドシート情報の取得に失敗しました');
      }

      // シートが存在するか確認
      const sheetExists = spreadsheet.data.sheets.some(
        sheet => sheet.properties.title === this.sheetName
      );

      let sheetId = null;

      if (!sheetExists) {
        logger.info(`📝 シート "${this.sheetName}" が存在しないため作成します`);
        
        // シートを作成
        const createResponse = await sheets.spreadsheets.batchUpdate({
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

        // 作成されたシートのIDを取得
        sheetId = createResponse.data.replies[0].addSheet.properties.sheetId;
        logger.success(`✅ シート "${this.sheetName}" を作成しました (ID: ${sheetId})`);

        // ヘッダー行を追加
        await this.addHeaderRow(sheets);

        // ✅ 書式設定を適用（行の高さ固定、テキスト折り返し無効化）
        await this.applyFormatting(sheets, sheetId);
        
      } else {
        logger.info(`✅ シート "${this.sheetName}" は既に存在します`);
        
        // 既存シートのIDを取得
        const sheet = spreadsheet.data.sheets.find(
          sheet => sheet.properties.title === this.sheetName
        );
        sheetId = sheet.properties.sheetId;
        
        // ✅ 既存シートにも書式設定を適用
        await this.applyFormatting(sheets, sheetId);
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
      // ✅ 回答ステータス列を追加
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
        '質問タイプ',
        '回答ステータス' // ✨ 新しい列
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:L1`, // K1 → L1に変更
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
   * ✨ 新機能: 書式設定を適用
   * @param {Object} sheets - Google Sheets APIクライアント
   * @param {number} sheetId - シートID
   */
  async applyFormatting(sheets, sheetId) {
    try {
      logger.info('📐 書式設定を適用中...');

      const requests = [
        // 1. すべての行の高さを21pxに固定
        {
          updateDimensionProperties: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: 0,
              endIndex: 10000 // 最大10,000行まで対応
            },
            properties: {
              pixelSize: 21 // 行の高さを21pxに固定
            },
            fields: 'pixelSize'
          }
        },
        // 2. すべてのセルのテキスト折り返しを無効化（切り詰め）
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: 0,
              endRowIndex: 10000,
              startColumnIndex: 0,
              endColumnIndex: 12 // A列～L列（12列）
            },
            cell: {
              userEnteredFormat: {
                wrapStrategy: 'CLIP' // テキストを切り詰め
              }
            },
            fields: 'userEnteredFormat.wrapStrategy'
          }
        },
        // 3. ヘッダー行を太字にして背景色を設定
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 12
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true
                },
                backgroundColor: {
                  red: 0.85,
                  green: 0.85,
                  blue: 0.85
                }
              }
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)'
          }
        },
        // 4. ヘッダー行を固定（スクロール時も表示）
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheetId,
              gridProperties: {
                frozenRowCount: 1
              }
            },
            fields: 'gridProperties.frozenRowCount'
          }
        }
      ];

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: { requests }
      });

      logger.success('✅ 書式設定を適用しました（行の高さ固定、テキスト折り返し無効化）');
    } catch (error) {
      logger.warn('⚠️ 書式設定適用エラー（記録機能には影響なし）:', error.message);
      // 書式設定失敗は致命的ではないので、エラーを投げずに続行
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

      // ✅ 回答ステータスを判定
      let responseStatus = '成功';
      if (qaData.status) {
        responseStatus = qaData.status; // 明示的に渡された場合
      } else if (qaData.questionType === 'システムエラー') {
        responseStatus = 'システムエラー';
      } else if (qaData.questionType === 'エラー応答') {
        responseStatus = 'エラー応答';
      }

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
        qaData.questionType || '通常質問',
        responseStatus // ✨ 新しい列
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:L`, // A:K → A:Lに変更
        valueInputOption: 'RAW',
        resource: {
          values: [row],
        },
      });

      logger.debug(`📊 Q&A記録追加: ${qaData.username} - ${qaData.question?.substring(0, 50)}... [${responseStatus}]`);
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
        range: `${this.sheetName}!A:L`, // A:K → A:Lに変更
      });

      const rows = response.data.values || [];
      const dataRows = rows.slice(1); // ヘッダー行を除く

      // ✅ ステータス別の集計
      const statusCount = {
        success: 0,
        error: 0,
        systemError: 0
      };

      dataRows.forEach(row => {
        const status = row[11]; // L列（回答ステータス）
        if (status === '成功') statusCount.success++;
        else if (status === 'エラー応答') statusCount.error++;
        else if (status === 'システムエラー') statusCount.systemError++;
      });

      return {
        totalRecords: dataRows.length,
        successCount: statusCount.success,
        errorCount: statusCount.error,
        systemErrorCount: statusCount.systemError,
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
