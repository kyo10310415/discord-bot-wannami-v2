// services/google-apis.js - 前バージョン互換修正版

const { google } = require('googleapis');
const environment = require('../config/environment');

class GoogleAPIs {
    constructor() {
        this.sheets = null;
        this.auth = null;
        this.initialized = false;
    }
    
    async initialize() {
        try {
            console.log('🔧 Google APIs初期化開始（前バージョン互換モード）...');
            
            // 🔧 前バージョンの個別環境変数から認証情報を構築
            const credentials = {
                type: "service_account",
                project_id: environment.get('GOOGLE_PROJECT_ID'),
                private_key_id: environment.get('GOOGLE_PRIVATE_KEY_ID'),
                private_key: environment.get('GOOGLE_PRIVATE_KEY')?.replace(/\\n/g, '\n'),
                client_email: environment.get('GOOGLE_CLIENT_EMAIL'),
                client_id: environment.get('GOOGLE_CLIENT_ID'),
                auth_uri: "https://accounts.google.com/o/oauth2/auth",
                token_uri: "https://oauth2.googleapis.com/token",
                auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(environment.get('GOOGLE_CLIENT_EMAIL'))}`
            };
            
            console.log('📧 Service Account Email:', credentials.client_email);
            console.log('🆔 Project ID:', credentials.project_id);
            
            // JWT認証の作成
            this.auth = new google.auth.JWT(
                credentials.client_email,
                null,
                credentials.private_key,
                ['https://www.googleapis.com/auth/spreadsheets.readonly']
            );
            
            // 認証テスト
            await this.auth.authorize();
            console.log('✅ Google APIs認証成功');
            
            // Sheets APIインスタンス作成
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            
            this.initialized = true;
            console.log('✅ Google APIs初期化完了');
            
        } catch (error) {
            console.error('❌ Google APIs初期化エラー:', error.message);
            console.error('詳細:', error);
            throw error;
        }
    }
    
    async readSheet(sheetsId, range) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
            // 🔧 sheetsIdが未指定の場合は環境変数から取得
            const targetSheetsId = sheetsId || environment.getGoogleSheetsId();
            
            console.log(`📊 Sheets読み取り: ${targetSheetsId}, Range: ${range}`);
            
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: targetSheetsId,
                range: range,
            });
            
            console.log(`✅ 読み取り成功: ${response.data.values?.length || 0}行`);
            return response.data.values || [];
            
        } catch (error) {
            console.error('❌ Sheets読み取りエラー:', error.message);
            throw error;
        }
    }
    
    // 既存のメソッドも互換性を保つ
    async getSheetData(range = 'A:G') {
        return await this.readSheet(null, range);
    }
}

module.exports = new GoogleAPIs();
