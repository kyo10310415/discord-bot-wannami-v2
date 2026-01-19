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
   * 知識ベーススプレッドシートからトピックを取得
   */
  async getTopicsFromKnowledgeBase() {
    try {
      const spreadsheetId = process.env.KNOWLEDGE_BASE_SPREADSHEET_ID;
      
      // A列（タイトル）とG列（キーワード）を取得
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: 'A:G'
      });

      const rows = response.data.values || [];
      const topics = [];

      // ヘッダー行をスキップ（2行目から）
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const title = row[0]; // A列：タイトル
        const keywords = row[6]; // G列：キーワード

        if (title || keywords) {
          topics.push({
            title: title || '',
            keywords: keywords || ''
          });
        }
      }

      console.log(`✅ [QA-GENERATOR] 知識ベースから${topics.length}件のトピック取得`);
      return topics;

    } catch (error) {
      console.error('❌ [QA-GENERATOR] トピック取得エラー:', error.message);
      // エラー時はフォールバック用の固定トピックを返す
      return this.getFallbackTopics();
    }
  }

  /**
   * フォールバック用の固定トピック（知識ベース読み込み失敗時）
   */
  getFallbackTopics() {
    return [
      { title: 'Xの型の使い方', keywords: 'X, ポスト, 型, 手法' },
      { title: 'YouTubeアナリティクス', keywords: 'YouTube, アナリティクス, 分析' },
      { title: 'サムネイルの作り方', keywords: 'サムネイル, 画像, デザイン' }
    ];
  }

  /**
   * 苦戦しやすいトピックを優先的に選択
   */
  async getRandomTopic() {
    try {
      // 知識ベースからトピックを取得
      const allTopics = await this.getTopicsFromKnowledgeBase();

      // 苦戦しやすいキーワード（優先度高）
      const difficultKeywords = [
        'X', 'ポスト', '型', '手法', 'YouTube', 'アナリティクス', 
        '分析', 'KPI', 'インプレッション', 'エンゲージメント', 
        'リーチ', 'サムネイル', 'アルゴリズム', 'SEO', '投稿時間',
        'タグ', 'ハッシュタグ', '配信設定', 'OBS', '音声',
        'マイク', 'キャプチャ', 'エンコード', 'ビットレート',
        'アーカイブ', 'クリップ', 'ショート動画', 'ミッション',
        'レッスン', '合格基準', '提出', '添削', 'フィードバック'
      ];

      // 苦戦しやすいトピックをフィルタリング
      const difficultTopics = allTopics.filter(topic => {
        const text = `${topic.title} ${topic.keywords}`.toLowerCase();
        return difficultKeywords.some(keyword => 
          text.includes(keyword.toLowerCase())
        );
      });

      // 苦戦しやすいトピックがあれば80%の確率で優先選択
      let selectedTopic;
      if (difficultTopics.length > 0 && Math.random() < 0.8) {
        selectedTopic = difficultTopics[Math.floor(Math.random() * difficultTopics.length)];
        console.log(`🎯 [QA-GENERATOR] 苦戦しやすいトピックを選択`);
      } else {
        selectedTopic = allTopics[Math.floor(Math.random() * allTopics.length)];
        console.log(`📚 [QA-GENERATOR] 通常トピックを選択`);
      }

      // タイトルとキーワードを組み合わせて返す
      const topicText = selectedTopic.keywords 
        ? `${selectedTopic.title}（${selectedTopic.keywords}）`
        : selectedTopic.title;

      return topicText;

    } catch (error) {
      console.error('❌ [QA-GENERATOR] トピック選択エラー:', error.message);
      // エラー時はフォールバックトピックから選択
      const fallbackTopics = this.getFallbackTopics();
      const selected = fallbackTopics[Math.floor(Math.random() * fallbackTopics.length)];
      return `${selected.title}（${selected.keywords}）`;
    }
  }

  /**
   * OpenAI APIで質問を生成
   */
  async generateQuestion(topic) {
    try {
      const systemPrompt = `あなたはVTuber育成スクールの質問生成アシスタントです。
生徒がVTuber活動で実際に直面する困りごとや疑問を、具体的な質問として生成してください。

【重要な制約】
- VTuber活動、配信、SNS運用、コンテンツ制作に関する質問のみを生成すること
- プログラミングやWeb技術に関する質問は生成しないこと
- 生徒が実際に「わなみさん」に質問しそうな口調で生成すること`;
      
      const userQuery = `以下のトピックについて、VTuber育成スクールの生徒が実際に困りそうな質問を1つ生成してください。

トピック: ${topic}

【質問の条件】
- VTuber活動における実践的な悩みや疑問
- 初心者が実際に困りそうな具体的な内容
- 「〜について教えてください」「〜はどうすればいいですか？」「〜のコツは？」などの形式
- 1文で簡潔に、親しみやすい口調で
- X（旧Twitter）のポスト、YouTube配信、サムネイル作成、デザイン、アナリティクス分析などVTuber活動に直結する内容

【悪い例】
- Promiseを使って非同期処理の結果を取得する方法について教えてください
- HTMLのフォーム送信について教えてください

【良い例】
- Xのポストの型を使い分ける方法を教えてください
- YouTubeのサムネイルで目を引くデザインのコツは？
- 配信のアナリティクスでどの数値を見ればいいですか？

質問のみを出力してください。`;

      const response = await generateAIResponse(
        systemPrompt,
        userQuery,
        [],  // images (空配列)
        {    // context
          temperature: 0.7, // 温度を下げて安定した生成に
          max_tokens: 150
        }
      );

      const question = response.trim();
      
      // プログラミング関連のキーワードが含まれていないかチェック
      const bannedKeywords = [
        'Promise', 'async', 'await', 'JavaScript', 'HTML', 'CSS',
        'コード', 'プログラミング', '関数', 'メソッド', 'API',
        '変数', 'データベース', 'SQL', 'React', 'Node.js'
      ];
      
      const hasBannedKeyword = bannedKeywords.some(keyword => 
        question.includes(keyword)
      );
      
      if (hasBannedKeyword) {
        console.warn(`⚠️ [QA-GENERATOR] 不適切なキーワードを検出: "${question}"`);
        console.log(`🔄 [QA-GENERATOR] 再生成を試みます...`);
        // 再帰的に再生成（最大1回）
        return await this.generateQuestion(topic);
      }
      
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

      console.log(`📝 [QA-GENERATOR] 保存開始 - SpreadsheetID: ${spreadsheetId}`);
      console.log(`📝 [QA-GENERATOR] シート名: ${sheetName}`);

      const row = [
        new Date().toISOString(),  // A: タイムスタンプ
        question,                  // B: 質問
        answer,                    // C: 回答
        'FALSE'                    // D: 使用済みフラグ（初期値FALSE）
      ];

      console.log(`📝 [QA-GENERATOR] 保存データ準備完了 - 質問: ${question.substring(0, 50)}...`);

      const result = await this.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A:D`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [row] }
      });

      console.log('✅ [QA-GENERATOR] Q&Aペア保存完了');
      console.log(`📊 [QA-GENERATOR] 保存結果: ${JSON.stringify(result.data)}`);
      return true;

    } catch (error) {
      console.error('❌ [QA-GENERATOR] Q&Aペア保存エラー:', error.message);
      console.error('❌ [QA-GENERATOR] エラー詳細:', error);
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
