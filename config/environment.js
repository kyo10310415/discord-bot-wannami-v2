// config/environment.js - 前バージョン互換版

require('dotenv').config();

class Environment {
    constructor() {
        // 🔧 前バージョンの環境変数名に変更
        this.requiredVars = [
            'DISCORD_BOT_TOKEN',
            'OPENAI_API_KEY',
            'GOOGLE_SHEETS_API_KEY',  // 変更: GOOGLE_SHEETS_ID → GOOGLE_SHEETS_API_KEY
            'GOOGLE_CLIENT_EMAIL',    // 変更: GOOGLE_SERVICE_ACCOUNT_KEY → 個別設定
            'GOOGLE_PRIVATE_KEY',
            'GOOGLE_PROJECT_ID'
        ];
        
        this.validateEnvironment();
    }
    
    validateEnvironment() {
        const missingVars = [];
        const presentVars = [];
        
        this.requiredVars.forEach(varName => {
            const value = process.env[varName];
            if (!value || value.trim() === '') {
                missingVars.push(varName);
            } else {
                // プライベートキーは長いので短縮表示
                const displayValue = varName === 'GOOGLE_PRIVATE_KEY' 
                    ? `${varName}=-----BEGIN PRIVATE KEY-----...` 
                    : `${varName}=${value.substring(0, 10)}...`;
                presentVars.push(displayValue);
            }
        });
        
        console.log('🔍 環境変数チェック結果:');
        console.log('✅ 設定済み変数:', presentVars);
        
        if (missingVars.length > 0) {
            console.error('❌ 未設定の環境変数:', missingVars);
            console.error('🚨 以下の環境変数が必要です（既存のRender設定から確認）:');
            missingVars.forEach(varName => {
                console.error(`   ${varName}=既存の設定値を確認してください`);
            });
            
            throw new Error(`必須環境変数が設定されていません: ${missingVars.join(', ')}`);
        }
        
        console.log('✅ 全環境変数設定完了');
    }
    
    get(key, defaultValue = null) {
        const value = process.env[key];
        if (value === undefined && defaultValue === null) {
            console.warn(`⚠️ 環境変数 ${key} が設定されていません`);
        }
        return value || defaultValue;
    }
    
    // 🆕 前のバージョン互換: Google Service Account Key を動的構築
    getGoogleServiceAccountKey() {
        return JSON.stringify({
            type: "service_account",
            project_id: process.env.GOOGLE_PROJECT_ID,
            private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            client_id: process.env.GOOGLE_CLIENT_ID,
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL)}`
        });
    }
    
    // 🆕 Google Sheets ID を環境変数または設定から取得
    getGoogleSheetsId() {
        // 既存の設定から取得する場合の例
        // 実際のSHEETS_IDが別の環境変数名で設定されている可能性
        return process.env.GOOGLE_SHEETS_ID || 
               process.env.GOOGLE_SHEET_ID || 
               process.env.SHEETS_ID ||
               'デフォルトSHEETS_ID'; // 実際のIDに置き換え
    }
    
    isRenderEnvironment() {
        return process.env.RENDER === 'true' || process.env.RENDER_SERVICE_ID;
    }
    
    getRenderInfo() {
        if (this.isRenderEnvironment()) {
            return {
                serviceId: process.env.RENDER_SERVICE_ID,
                serviceName: process.env.RENDER_SERVICE_NAME,
                deployId: process.env.RENDER_DEPLOY_ID,
                region: process.env.RENDER_REGION
            };
        }
        return null;
    }
}

module.exports = new Environment();
