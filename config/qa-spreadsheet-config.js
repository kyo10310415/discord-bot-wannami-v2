// config/qa-spreadsheet-config.js - Q&A記録用スプレッドシート設定

const environment = require('./environment');

/**
 * Q&A記録用スプレッドシートID
 * 
 * environment.jsから取得
 * .envファイルの QA_SPREADSHEET_ID を設定してください
 */

module.exports = {
  QA_SPREADSHEET_ID: environment.QA_SPREADSHEET_ID,
  SHEET_NAME: 'QA_Log'
};
