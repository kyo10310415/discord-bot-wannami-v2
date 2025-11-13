// config/qa-spreadsheet-config.js - Q&A記録用スプレッドシート設定

/**
 * Q&A記録用スプレッドシートID
 * 
 * 設定方法:
 * 1. Google Spreadsheetsで新しいスプレッドシートを作成
 * 2. URLから以下の部分をコピー:
 *    https://docs.google.com/spreadsheets/d/{スプレッドシートID}/edit
 * 3. 以下の QA_SPREADSHEET_ID に設定
 * 4. スプレッドシートの共有設定で、サービスアカウントのメールアドレスに編集権限を付与
 *    （GOOGLE_SHEETS_CREDENTIALSのclient_emailを共有設定に追加）
 */

const QA_SPREADSHEET_ID = process.env.QA_SPREADSHEET_ID || '';

// 開発環境用のデフォルトID（オプション）
// 本番環境では必ず環境変数を設定してください
const DEFAULT_QA_SPREADSHEET_ID = '';

module.exports = {
  QA_SPREADSHEET_ID: QA_SPREADSHEET_ID || DEFAULT_QA_SPREADSHEET_ID,
  SHEET_NAME: 'QA_Log'
};
