// config/environment.js - 環境変数管理（Q&A記録対応版）
// Version: 15.5.1
// 更新日: 2025-11-13
// 修正内容: GOOGLE_SHEETS_CREDENTIALS getter追加

class Environment {
  constructor() {
    this.validateRequiredEnvVars();
  }

  // OpenAI設定
  get OPENAI_API_KEY() {
    return process.env.OPENAI_API_KEY;
  }

  // Discord Bot設定
  get DISCORD_BOT_TOKEN() {
    return process.env.DISCORD_BOT_TOKEN;
  }

  get DISCORD_PUBLIC_KEY() {
    return process.env.DISCORD_PUBLIC_KEY;
  }

  get DISCORD_APPLICATION_ID() {
    return process.env.DISCORD_APPLICATION_ID;
  }

  // Google Sheets設定 - スプレッドシートID
  get KNOWLEDGE_SPREADSHEET_ID() {
    return process.env.KNOWLEDGE_SPREADSHEET_ID;
  }

  get QA_SPREADSHEET_ID() {
    return process.env.QA_SPREADSHEET_ID;
  }

  // Google APIs設定
  get GOOGLE_CREDENTIALS() {
    // プライベートキーの正規化
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    if (privateKey) {
      // \\n を実際の改行文字に変換
      privateKey = privateKey.replace(/\\n/g, '\n');
      // ヘッダー/フッターの確認
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = '-----BEGIN PRIVATE KEY-----\n' + privateKey;
      }
      if (!privateKey.includes('-----END PRIVATE KEY-----')) {
        privateKey = privateKey + '\n-----END PRIVATE KEY-----';
      }
    }
    
    const credentials = {
      type: 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID || 'dummy-key-id',
      private_key: privateKey,
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID || 'dummy-client-id',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.GOOGLE_CLIENT_EMAIL?.replace('@', '%40')}`
    };
    
    return credentials;
  }

  // ✅ 追加: Google Sheets API専用の認証情報getter
  get GOOGLE_SHEETS_CREDENTIALS() {
    // GOOGLE_CREDENTIALSと同じオブジェクトを返す
    return this.GOOGLE_CREDENTIALS;
  }

  // 必須環境変数の検証
  validateRequiredEnvVars() {
    // 基本的な環境変数のみチェック
    const required = [
      'DISCORD_BOT_TOKEN',
      'OPENAI_API_KEY'
    ];
    
    // Google APIs関連はオプションとしてチェック
    const googleRequired = [
      'GOOGLE_PROJECT_ID',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_CLIENT_EMAIL'
    ];

    const missing = required.filter(key => !process.env[key]);
    const googleMissing = googleRequired.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.error(`❌ 以下の必須環境変数が設定されていません: ${missing.join(', ')}`);
      throw new Error('必須環境変数が不足しています');
    }
    
    if (googleMissing.length > 0) {
      console.warn(`⚠️ Google APIs関連の環境変数が不足: ${googleMissing.join(', ')}`);
      console.warn('知識ベース機能が制限されます。');
    }

    // Q&A記録スプレッドシートIDの確認（オプション）
    if (!process.env.QA_SPREADSHEET_ID) {
      console.warn('⚠️ QA_SPREADSHEET_IDが設定されていません。Q&A記録機能は無効です。');
    }
  }

  // 環境変数の状態確認
  getStatus() {
    return {
      openai_api_key: !!process.env.OPENAI_API_KEY,
      google_project_id: !!process.env.GOOGLE_PROJECT_ID,
      google_client_email: !!process.env.GOOGLE_CLIENT_EMAIL,
      google_private_key: !!process.env.GOOGLE_PRIVATE_KEY,
      knowledge_spreadsheet_id: !!process.env.KNOWLEDGE_SPREADSHEET_ID,
      qa_spreadsheet_id: !!process.env.QA_SPREADSHEET_ID,
      discord_bot_token: !!process.env.DISCORD_BOT_TOKEN,
      discord_public_key: !!process.env.DISCORD_PUBLIC_KEY,
      discord_application_id: !!process.env.DISCORD_APPLICATION_ID,
      bot_user_id: !!process.env.BOT_USER_ID,
      enable_message_bot: process.env.ENABLE_MESSAGE_BOT === 'true'
    };
  }

  // 開発モード判定
  get isDevelopment() {
    return process.env.NODE_ENV === 'development';
  }

  // 本番モード判定
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  // ポート設定
  get PORT() {
    return process.env.PORT || 3000;
  }

  // 汎用getメソッド（後方互換性のため）
  get(key) {
    if (this.hasOwnProperty(key)) {
      return this[key];
    }
    return process.env[key];
  }
}

module.exports = new Environment();
