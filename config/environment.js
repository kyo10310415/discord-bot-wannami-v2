// 環境変数管理とバリデーション
require('dotenv').config(); // ← この行が重要！

const logger = require('../utils/logger');

class EnvironmentManager {
    constructor() {
        this.requiredEnvVars = [
            'DISCORD_BOT_TOKEN',
            'DISCORD_APPLICATION_ID', 
            'OPENAI_API_KEY',
            'GOOGLE_SHEETS_CREDENTIALS',
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
                console.error('❌ Environment Error:', errorMsg);
                throw new Error(errorMsg);
            }
            
            // オプション環境変数
            this.config.PORT = process.env.PORT || 3000;
            this.config.NODE_ENV = process.env.NODE_ENV || 'production';
            
            // Google Sheets認証情報のパース
            try {
                this.config.GOOGLE_CREDENTIALS = JSON.parse(this.config.GOOGLE_SHEETS_CREDENTIALS);
            } catch (error) {
                console.error('❌ Google Credentials Parse Error:', error);
                throw new Error('GOOGLE_SHEETS_CREDENTIALS環境変数が正しいJSON形式ではありません');
            }
            
            console.log('✅ 環境変数の読み込み完了');
            
        } catch (error) {
            console.error('❌ 環境変数読み込みエラー:', error);
            process.exit(1); // 環境変数エラーの場合は強制終了
        }
    }
    
    get(key) {
        return this.config[key];
    }
}

module.exports = new EnvironmentManager();
