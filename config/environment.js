// config/environment.js - 環境変数管理

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

  // Google APIs設定
  get GOOGLE_CREDENTIALS() {
    return {
      type: 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.GOOGLE_CLIENT_EMAIL?.replace('@', '%40')}`
    };
  }

  // 必須環境変数の検証
  validateRequiredEnvVars() {
    const required = [
      'OPENAI_API_KEY',
      'GOOGLE_PROJECT_ID',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_CLIENT_EMAIL',
      'DISCORD_BOT_TOKEN',
      'DISCORD_PUBLIC_KEY',
      'DISCORD_APPLICATION_ID'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.warn(`⚠️ 以下の環境変数が設定されていません: ${missing.join(', ')}`);
      console.warn('一部の機能が制限される可能性があります。');
    }
  }

  // 環境変数の状態確認
  getStatus() {
    return {
      openai_api_key: !!process.env.OPENAI_API_KEY,
      google_project_id: !!process.env.GOOGLE_PROJECT_ID,
      google_client_email: !!process.env.GOOGLE_CLIENT_EMAIL,
      google_private_key: !!process.env.GOOGLE_PRIVATE_KEY,
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
}

module.exports = new Environment();
