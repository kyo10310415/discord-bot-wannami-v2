// config/environment.js - エラーハンドリング強化版

require('dotenv').config();

class Environment {
    constructor() {
        this.requiredVars = [
            'DISCORD_BOT_TOKEN',
            'OPENAI_API_KEY', 
            'GOOGLE_SHEETS_ID',
            'GOOGLE_SERVICE_ACCOUNT_KEY'
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
                presentVars.push(`${varName}=${value.substring(0, 10)}...`);
            }
        });
        
        console.log('🔍 環境変数チェック結果:');
        console.log('✅ 設定済み変数:', presentVars);
        
        if (missingVars.length > 0) {
            console.error('❌ 未設定の環境変数:', missingVars);
            console.error('🚨 Renderの環境変数設定で以下を追加してください:');
            missingVars.forEach(varName => {
                console.error(`   ${varName}=your_${varName.toLowerCase()}_here`);
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
    
    // Render用の特別設定
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
