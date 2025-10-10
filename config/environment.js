// 環境変数管理とバリデーション
require('dotenv').config();

const logger = require('../utils/logger');

class EnvironmentManager {
    constructor() {
        this.requiredEnvVars = [
            'DISCORD_BOT_TOKEN',
            'DISCORD_APPLICATION_ID',
            'OPENAI_API_KEY',
            // Google認証情報用の個別キー
            'GOOGLE_CLIENT_EMAIL',
            'GOOGLE_CLIENT_ID',
            'GOOGLE_PRIVATE_KEY',
            'GOOGLE_PRIVATE_KEY_ID',
            'GOOGLE_PROJECT_ID',
            // 知識ベースID
            'KNOWLEDGE_BASE_SHEET_ID'
        ];

        this.config = {};
        this.loadEnvironment();
    }

    loadEnvironment() {
        try {
            // 必須環境変数のチェック
            const missingVars = [];

            for (const varName of this.requiredEnvVars) {
                const value = process.env[varName];
                if (!value) {
                    missingVars.push(varName);
                } else {
                    this.config[varName] = value;
                }
            }

            if (missingVars.length > 0) {
                const errorMsg = `必須環境変数が設定されていません: ${missingVars.join(', ')}`;
                logger.error('❌ Environment Error:', errorMsg);
                throw new Error(errorMsg);
            }

            // オプション環境変数
            this.config.PORT = process.env.PORT || 3000;
            this.config.NODE_ENV = process.env.NODE_ENV || 'production';

            // Google Sheets認証情報の組み立て
            this.config.GOOGLE_CREDENTIALS = {
                type: "service_account",
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                client_id: process.env.GOOGLE_CLIENT_ID,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
                project_id: process.env.GOOGLE_PROJECT_ID
            };

            logger.info('✅ 環境変数の読み込み完了');
        } catch (error) {
            logger.error('❌ 環境変数読み込みエラー:', error);
            process.exit(1);
        }
    }

    get(key) {
        return this.config[key];
    }
}

module.exports = new EnvironmentManager();
