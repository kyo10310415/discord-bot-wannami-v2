/**
 * Q&A自動生成サービス v1.0.0
 * 
 * 【機能】
 * - 知識ベースから質問候補トピックを抽出
 * - OpenAI APIを使用してランダムな質問を生成
 * - RAGシステムで回答を生成
 * - 「回答サンプル」シートにQ&Aペアを記録
 */

const logger = require('../utils/logger');
const knowledgeBase = require('./knowledge-base');
const { ragSystem } = require('./rag-system');
const { generateAIResponse } = require('./openai-service');
const { google } = require('googleapis');

class QAGeneratorService {
  constructor() {
    this.sheets = null;
    this.isInitialized = false;
  }

  /**
   * 初期化メソッド
   */
  async initialize() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🤖 [QA-GENERATOR] Q&A自動生成サービス初期化開始 v1.0.0');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
      // Google Sheets API認証
      const auth = new google.auth.GoogleAuth({
        credentials: {
          type: 'service_account',
          project_id: process.env.GOOGLE_PROJECT_ID,
          private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          client_id: process.env.GOOGLE_CLIENT_ID,
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      this.sheets = google.sheets({ version: 'v4', auth });
      console.log('✅ [QA-GENERATOR] Google Sheets API認証成功');

      // 「回答サンプル」シートのヘッダー確認・作成
      await this.ensureHeaders();

      this.isInitialized = true;
      console.log('✅ [QA-GENERATOR] 初期化完了');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      return true;

    } catch (error) {
      console.error('❌ [QA-GENERATOR] 初期化失敗:', error.message);
      throw error;
    }
  }

  /**
   * 「回答サンプル」シートのヘッダー確認と作成
   */
  async ensureHeaders() {
    try {
      const spreadsheetId = process.env.KNOWLEDGE_BASE_SPREADSHEET_ID;
      const sheetName = '回答サンプル';
      
      // 既存データを確認
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A1:D1`
      });

      if (!response.data.values || response.data.values.length === 0) {
        // ヘッダー行が存在しない場合は作成
        console.log('📝 [QA-GENERATOR] ヘッダー行を作成中...');
        
        const headers = [
          'タイムスタンプ',  // A列
          '質問',            // B列
          '回答',            // C列
          '使用済み'         // D列（送信済みフラグ）
        ];

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheetId,
          range: `${sheetName}!A1:D1`,
          valueInputOption: 'RAW',
          resource: { values: [headers] }
        });

        console.log('✅ [QA-GENERATOR] ヘッダー行作成完了');
      } else {
        console.log('✅ [QA-GENERATOR] ヘッダー行確認完了');
      }
    } catch (error) {
      // シートが存在しない場合は警告のみ（手動で作成する必要がある）
      console.warn('⚠️ [QA-GENERATOR] ヘッダー確認失敗（シートが存在しない可能性）:', error.message);
      console.warn('⚠️ 手動で「回答サンプル」シートを作成してください');
    }
  }

  /**
   * 知識ベースからランダムなトピックを選択
   */
  getRandomTopic() {
    const topics = [
      'VTuber名の決め方',
      'キャラクター設定の作り方',
      'デザインの基本',
      'Xの使い方',
      '初ポストの書き方',
      '日常ポストの作り方',
      'ポストの型と手法',
      '文章の書き方の基本',
      '配信のコツ',
      'サムネイルの作り方',
      'コントローラブルKPI',
      '3Hの考え方',
      'レッスンのミッション',
      '基本利用規約',
      '休会・退会について',
      'お支払いについて',
      'サービス保障',
      'PROプラン',
      'スペシャルイベント',
      'AIイラスト提供',
      '画像編集ソフト',
      'フォントのインストール',
      'Xアカウント凍結対応',
      'DMやリプライへの対応',
      'VQ診断'
    ];

    return topics[Math.floor(Math.random() * topics.length)];
  }

  /**
   * OpenAI APIで質問を生成
   */
  async generateQuestion(topic) {
    try {
      const systemPrompt = 'あなたは質問生成アシスタントです。VTuber育成スクールの生徒が実際に質問しそうな内容を生成してください。';
      
      const userQuery = `以下のトピックについて、具体的で実践的な質問を1つ生成してください。

トピック: ${topic}

【質問の条件】
- 初心者が実際に困りそうな内容
- 具体的で答えやすい質問
- 1文で簡潔に
- 「〜について教えてください」「〜はどうすればいいですか？」などの形式

質問のみを出力してください。`;

      const response = await generateAIResponse(
        systemPrompt,
        userQuery,
        [],  // images (空配列)
        {    // context
          temperature: 0.8,
          max_tokens: 200
        }
      );

      const question = response.trim();
      console.log(`✅ [QA-GENERATOR] 質問生成完了: "${question}"`);
      
      return question;

    } catch (error) {
      console.error('❌ [QA-GENERATOR] 質問生成エラー:', error.message);
      throw error;
    }
  }

  /**
   * RAGシステムで回答を生成
   */
  async generateAnswer(question) {
    try {
      console.log(`🔍 [QA-GENERATOR] 回答生成開始: "${question}"`);

      // RAGシステムで回答生成
      const result = await ragSystem.generateRAGResponse(question, [], {
        username: 'システム',
        channelName: 'サンプル生成'
      });

      // resultが文字列の場合と、オブジェクトの場合の両方に対応
      const answer = typeof result === 'string' ? result : result.answer;

      if (!answer || answer.length === 0) {
        throw new Error('回答生成に失敗しました');
      }

      console.log(`✅ [QA-GENERATOR] 回答生成完了 (${answer.length}文字)`);
      
      return answer;

    } catch (error) {
      console.error('❌ [QA-GENERATOR] 回答生成エラー:', error.message);
      throw error;
    }
  }

  /**
   * Q&Aペアを「回答サンプル」シートに保存
   */
  async saveQAPair(question, answer) {
    try {
      const spreadsheetId = process.env.KNOWLEDGE_BASE_SPREADSHEET_ID;
      const sheetName = '回答サンプル';

      const row = [
        new Date().toISOString(),  // A: タイムスタンプ
        question,                  // B: 質問
        answer,                    // C: 回答
        'FALSE'                    // D: 使用済みフラグ（初期値FALSE）
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A:D`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [row] }
      });

      console.log('✅ [QA-GENERATOR] Q&Aペア保存完了');
      return true;

    } catch (error) {
      console.error('❌ [QA-GENERATOR] Q&Aペア保存エラー:', error.message);
      throw error;
    }
  }

  /**
   * 1つのQ&Aペアを生成して保存
   */
  async generateAndSaveOne() {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🤖 [QA-GENERATOR] Q&Aペア生成開始');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // ランダムなトピックを選択
      const topic = this.getRandomTopic();
      console.log(`📚 選択トピック: ${topic}`);

      // 質問を生成
      const question = await this.generateQuestion(topic);

      // 回答を生成
      const answer = await this.generateAnswer(question);

      // 保存
      await this.saveQAPair(question, answer);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ [QA-GENERATOR] Q&Aペア生成完了');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return { question, answer };

    } catch (error) {
      console.error('❌ [QA-GENERATOR] Q&Aペア生成失敗:', error.message);
      throw error;
    }
  }

  /**
   * 現在の「回答サンプル」の件数を取得
   */
  async getSampleCount() {
    try {
      const spreadsheetId = process.env.KNOWLEDGE_BASE_SPREADSHEET_ID;
      const sheetName = '回答サンプル';

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A:D`
      });

      const rows = response.data.values || [];
      // ヘッダー行を除く
      const dataRows = rows.slice(1);
      
      return dataRows.length;

    } catch (error) {
      console.error('❌ [QA-GENERATOR] サンプル件数取得エラー:', error.message);
      return 0;
    }
  }

  /**
   * ステータス取得メソッド
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      sheets_api: this.sheets ? '接続済み' : '未接続'
    };
  }
}

// シングルトンインスタンスをエクスポート
const qaGeneratorService = new QAGeneratorService();

module.exports = { 
  qaGeneratorService,
  QAGeneratorService 
};
