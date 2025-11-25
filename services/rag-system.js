// services/rag-system.js - RAG(Retrieval-Augmented Generation)システム v2.11.0
// Version: 2.11.0
// 更新日: 2025-11-25
// 変更内容: 
// - わなみさんの性格設定を追加（23歳新人マネージャー、おっちょこちょい、熱意と情熱）
// - 挨拶自動応答機能を追加（こんにちは、よろしく等に元気よく応答）
// - システムプロンプトにキャラクター設定を統合

const logger = require('../utils/logger');
const knowledgeBase = require('./knowledge-base');
const { generateAIResponse } = require('./openai-service');
const { LIMITS } = require('../utils/constants');
const { urlContentLoader } = require('./url-content-loader');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🎭 わなみさんのキャラクター設定（共通）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const WANAMI_CHARACTER = `━━━━━━━━━━━━━━━━━━━━━━━━━━
🎭 わなみさんのキャラクター設定
━━━━━━━━━━━━━━━━━━━━━━━━━━

【基本情報】
• 名前: わなみさん
• 年齢: 23歳
• 役割: VTuber育成スクールの新人マネージャー（講師アシスタント）
• 種別: AIチャットボット

【性格・特徴】
✨ **熱意と情熱**: VTuber育成に対する真剣な思い、生徒の成長を心から応援
💪 **頑張り屋**: 困難にも前向きに取り組む、諦めない姿勢
😅 **おっちょこちょい**: 時々ドジをする、失敗も素直に認める親しみやすさ
🌟 **新人らしさ**: 完璧じゃないけど一生懸命、生徒と一緒に成長する姿勢

【話し方の特徴】
• 明るく元気な口調（「です・ます」調）
• 適度な絵文字使用（✨💡🎯など）
• 親しみやすい表現
• 時々「えっと...」「あ、そうだ！」など自然な言い回し

━━━━━━━━━━━━━━━━━━━━━━━━━━`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 👋 挨拶パターン検出と自動応答
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const GREETING_PATTERNS = [
  { pattern: /^(こんにちは|こんにちわ|今日は)[\s!！]*$/i, response: '🌟 **こんにちは！わなみです！**\n\n今日も元気にサポートさせていただきます✨\n何かお手伝いできることがあれば、気軽に聞いてくださいね！💪' },
  { pattern: /^(おはよう|おはようございます|ohayo)[\s!！]*$/i, response: '☀️ **おはようございます！わなみです！**\n\n今日も一日頑張りましょう✨\nVTuber活動のこと、何でもサポートしますよ！🎯' },
  { pattern: /^(こんばんは|こんばんわ|今晩は)[\s!！]*$/i, response: '🌙 **こんばんは！わなみです！**\n\n今日もお疲れさまです✨\n夜でも全力でサポートしますので、何でも聞いてくださいね！💡' },
  { pattern: /^(よろしく|よろしくお願いします|宜しく)[\s!！]*$/i, response: '🤝 **よろしくお願いします！わなみです！**\n\nVTuber育成スクールの新人マネージャーとして、全力でサポートさせていただきます✨\n一緒に頑張りましょう！💪' },
  { pattern: /^(ありがとう|ありがとうございます|感謝|thx|thanks)[\s!！]*$/i, response: '😊 **どういたしまして！**\n\nお役に立てて嬉しいです✨\n他にも何かあれば、いつでも声をかけてくださいね！💡' },
  { pattern: /^(おつかれ|お疲れ様|お疲れさま|おつ)[\s!！]*$/i, response: '🎉 **お疲れさまです！**\n\n今日も頑張りましたね✨\nゆっくり休んで、また明日も一緒に頑張りましょう！🌟' },
  { pattern: /^(はじめまして|初めまして)[\s!！]*$/i, response: '👋 **はじめまして！わなみです！**\n\nVTuber育成スクールの新人マネージャーとして、みなさんをサポートしています✨\nおっちょこちょいな一面もありますが（笑）、熱意と情熱だけは誰にも負けません！💪\n\nよろしくお願いします！一緒に素敵なVTuberを目指しましょう🎯' }
];

function detectGreeting(userQuery) {
  const trimmedQuery = userQuery.trim();
  
  for (const { pattern, response } of GREETING_PATTERNS) {
    if (pattern.test(trimmedQuery)) {
      logger.info(`👋 挨拶検出: "${trimmedQuery}" → パターンマッチ`);
      return response;
    }
  }
  
  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class RAGSystem {
  constructor() {
    this.initialized = false;
    this.isInitializing = false;
    this.initializationPromise = null;
    this.maxContextTokens = LIMITS.MAX_CONTEXT_LENGTH || 25000;
  }

  async initialize() {
    if (this.isInitializing) {
      logger.info('⏳ 既に初期化処理中です。完了を待機...');
      return this.initializationPromise;
    }

    if (this.initialized) {
      logger.info('✅ RAGシステムは既に初期化済みです');
      return true;
    }

    this.isInitializing = true;
    this.initializationPromise = this._performInitialization();
    
    try {
      const result = await this.initializationPromise;
      return result;
    } finally {
      this.isInitializing = false;
      this.initializationPromise = null;
    }
  }

  async _performInitialization() {
    try {
      this.initialized = true;
      logger.info('✅ RAGシステム初期化完了');
      return true;
    } catch (error) {
      logger.errorDetail('RAGシステム初期化エラー:', error);
      this.initialized = false;
      throw error;
    }
  }

  async waitForInitialization(timeoutMs = 30000) {
    if (this.initialized) {
      return true;
    }

    logger.info('⏳ RAGシステム初期化を待機中...');
    const startTime = Date.now();

    while (!this.initialized && (Date.now() - startTime < timeoutMs)) {
      await this._sleep(500);
    }

    if (!this.initialized) {
      throw new Error('RAGシステム初期化がタイムアウトしました');
    }

    logger.info('✅ RAGシステム初期化完了を確認');
    return true;
  }

  async _searchKnowledge(query, options = {}) {
    try {
      await this.waitForInitialization();

      if (typeof knowledgeBase.searchKnowledge === 'function') {
        logger.info('📚 検索方法: 直接関数呼び出し');
        return knowledgeBase.searchKnowledge(query, options);
      }
      else if (knowledgeBase.knowledgeBaseService && typeof knowledgeBase.knowledgeBaseService.searchKnowledge === 'function') {
        logger.info('📚 検索方法: knowledgeBaseService経由');
        return knowledgeBase.knowledgeBaseService.searchKnowledge(query, options);
      }
      else {
        logger.error('❌ searchKnowledge関数が見つかりません', {
          availableKeys: Object.keys(knowledgeBase),
          knowledgeBaseType: typeof knowledgeBase,
          hasKnowledgeBaseService: !!knowledgeBase.knowledgeBaseService,
          knowledgeBaseServiceKeys: knowledgeBase.knowledgeBaseService ? Object.keys(knowledgeBase.knowledgeBaseService) : 'N/A'
        });
        throw new Error('searchKnowledge関数が見つかりません。knowledge-base.jsのエクスポート構造を確認してください。');
      }
    } catch (error) {
      logger.error('❌ 知識ベース検索エラー:', error);
      throw error;
    }
  }

  _optimizeSearchQuery(userQuery) {
    const stopWords = [
      'について', '教えて', 'ください', 'どうすれば', 'どうやって',
      'どのように', 'ですか', 'でしょうか', 'なんですか', 'とは',
      'を知りたい', 'を教えて', 'したい', 'したいです', 'です',
      'ます', 'ですか?', 'でしょうか?', 'ありますか', 'ありますか?',
      'なに', '何', 'いつ', '誰', 'どこ', 'なぜ', 'の方法',
      '方法を', 'やり方', 'コツ', 'ポイント', 'を', 'は', 'が', 'の'
    ];
    
    let optimizedQuery = userQuery;
    
    const lessonMatch = userQuery.match(/レッスン(\d+)/);
    let lessonNumber = null;
    
    if (lessonMatch) {
      lessonNumber = lessonMatch[1];
      logger.info(`📚 レッスン番号を検出: ${lessonNumber}`);
      optimizedQuery = optimizedQuery.replace(/レッスン\d+の?/g, '').trim();
    }
    
    stopWords.forEach(word => {
      const endPattern = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'g');
      optimizedQuery = optimizedQuery.replace(endPattern, '').trim();
      
      if (word.length >= 2) {
        const middlePattern = new RegExp('\\s+' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'g');
        optimizedQuery = optimizedQuery.replace(middlePattern, ' ').trim();
      }
    });
    
    optimizedQuery = optimizedQuery.replace(/\s+/g, ' ').trim();
    optimizedQuery = optimizedQuery.replace(/[？?！!。、，,]/g, '').trim();
    
    if (!optimizedQuery || optimizedQuery.length < 2) {
      if (lessonNumber && userQuery.includes('ミッション')) {
        optimizedQuery = 'ミッション';
      } else {
        optimizedQuery = this._extractKeywords(userQuery);
      }
    }
    
    return {
      optimizedQuery,
      lessonNumber,
      originalQuery: userQuery
    };
  }
  
  _extractKeywords(text) {
    const keywords = text.match(/[ァ-ヶー]+|[一-龯]+|[ぁ-ん]{2,}/g) || [];
    keywords.sort((a, b) => b.length - a.length);
    return keywords.slice(0, 3).join(' ') || text;
  }

  async generateRAGResponse(userQuery, images = [], context = {}) {
    try {
      logger.ai('RAG応答生成開始');

      const knowledgeResults = await this._searchKnowledge(userQuery, {
        maxResults: 5,
        minScore: 0.05,
        includeMetadata: true
      });

      logger.info(`知識ベース検索結果: ${knowledgeResults.length}件`);

      let knowledgeContext = '';
      if (knowledgeResults.length > 0) {
        knowledgeContext = '【知識ベースからの関連情報】\n\n';
        knowledgeResults.forEach((result, index) => {
          knowledgeContext += `${index + 1}. ${result.title || result.source}\n`;
          const contentPreview = result.answer || result.content.substring(0, 2000);
          knowledgeContext += `${contentPreview}\n`;
          knowledgeContext += `(関連度: ${(result.score * 100).toFixed(1)}%)\n\n`;
        });
      }

      const systemPrompt = `${WANAMI_CHARACTER}

【重要な役割】
- VTuber活動を目指す生徒をサポート
- 技術的な質問に対して具体的かつ分かりやすく回答
- 親しみやすく、励ましの言葉も添える
- 知識ベースの情報を最優先に使用

【回答スタイル】
- 絵文字を適度に使用（🎥✨💡など）
- 専門用語は初心者にも分かるように説明
- 具体例を交えた実践的なアドバイス
- 必要に応じて段階的な手順を提示
- **生のスライド内容をそのまま貼り付けず、要約して説明する**

【重要なスクールのルール】
- **コラボ配信の禁止**
- **活動者や生徒同士の横のつながり禁止**
YouTube:
- 週4回以上の配信をする
- 1回1時間半以上の配信
- YouTube企画の基本にのっとってあたりコンテンツを見つける
X:
- 1日2回以上の日常ポスト
- 画像付きのポスト
- ハッシュタグは2つまで
- Xの企画基本編にのっとって企画を週に2回実施
- XのDMは案件のみ対応で活動者やファンとのDMは禁止

【最重要ルール - 絶対に守ること】
1. **以下の【参照資料】の内容だけを使って回答してください**
2. **参照資料に書かれていない情報は、絶対に答えないでください**
3. **あなたの一般知識や学習データは一切使用しないでください**
4. **推測や想像で答えないでください**
5. **参照資料に情報がない場合は、正直に「知識ベースに情報がありません」と答えてください**

【知識ベース情報】
${knowledgeContext || '関連する知識ベース情報が見つかりませんでした。'}

上記の知識ベース情報を参考に、ユーザーの質問に答えてください。
**重要**: スライドの生の内容（"--- スライド X ---"など）をそのまま出力せず、内容を理解して要約・整理してください。`;

      const aiResponse = await generateAIResponse(
        systemPrompt,
        userQuery,
        images,
        context,
        { maxTokens: 3000 }
      );

      logger.success('RAG応答生成完了');
      return aiResponse;

    } catch (error) {
      logger.errorDetail('RAG応答生成エラー:', error);
      throw error;
    }
  }

  async generateRAGResponseWithVision(userQuery, imageUrls = [], context = {}) {
    try {
      logger.ai('画像解析統合RAG応答生成開始');

      const knowledgeResults = await this._searchKnowledge(userQuery, {
        maxResults: 3,
        minScore: 0.05,
        includeMetadata: true
      });

      let visionContext = '';
      if (imageUrls.length > 0) {
        visionContext = `\n【添付画像】\nユーザーが${imageUrls.length}枚の画像を添付しています。画像の内容を確認して、適切なアドバイスを提供してください。`;
      }

      let knowledgeContext = '';
      if (knowledgeResults.length > 0) {
        knowledgeContext = '【知識ベース情報】\n';
        knowledgeResults.forEach(result => {
          const contentPreview = result.answer || result.content.substring(0, 300);
          knowledgeContext += `- ${result.title || result.source}: ${contentPreview}\n`;
        });
      }

      const systemPrompt = `${WANAMI_CHARACTER}

${knowledgeContext}
${visionContext}

ユーザーの質問と添付画像を確認して、適切なアドバイスを提供してください。
**重要**: 知識ベースの内容を要約・整理して、わかりやすく説明してください。`;

      const response = await generateAIResponse(
        systemPrompt,
        userQuery,
        imageUrls.map(url => ({ url })),
        context,
        { maxTokens: 3000 }
      );

      logger.success('画像解析統合RAG応答生成完了');
      return response;

    } catch (error) {
      logger.errorDetail('画像解析統合RAG応答エラー:', error);
      throw error;
    }
  }

  /**
   * 🆕 v2.10.1: ミッション評価用の回答生成（教育的文脈強化版）
   */
  async generateMissionResponse(userQuery, imageUrls = [], context = {}) {
    try {
      logger.ai('📝 ===== ミッション提出専用処理開始 (v2.11.0) =====');
      logger.info('📝 ユーザー入力:', userQuery);
      logger.info(`🖼️ 画像URL受信: ${imageUrls.length}件`);

      await this.waitForInitialization();

      // Step 1: URL検出と内容取得（url-content-loader使用）
      const urlContents = await urlContentLoader.extractAndFetchUrls(userQuery);
      
      if (urlContents.length > 0) {
        const stats = urlContentLoader.getStats(urlContents);
        logger.info(`📊 URL取得統計: 合計${stats.total}件、成功${stats.success}件、失敗${stats.failed}件、総文字数${stats.totalChars}文字`);
      }

      // Step 2: クエリ最適化
      const { optimizedQuery, lessonNumber, originalQuery } = this._optimizeSearchQuery(userQuery);
      
      logger.info(`🔍 検索クエリ最適化:`);
      logger.info(`  元のクエリ: "${originalQuery}"`);
      logger.info(`  最適化後: "${optimizedQuery}"`);
      if (lessonNumber) {
        logger.info(`  レッスン番号: ${lessonNumber}`);
      }

      // Step 3: 知識ベース検索
      logger.info('🔍 知識ベース検索開始（ミッション資料）...');
      
      const knowledgeResults = await this._searchKnowledge(optimizedQuery, {
        maxResults: 50,
        minScore: 0.005,
        includeMetadata: true
      });

      logger.info(`✅ 検索完了: ${knowledgeResults.length}件ヒット`);

      if (knowledgeResults.length > 0) {
        logger.info('\n🔍 ===== 検索結果サンプル（最初の10件） =====');
        knowledgeResults.slice(0, 10).forEach((result, index) => {
          logger.info(`📄 [${index + 1}] ${result.source} - スコア:${result.score.toFixed(3)} - 分類:${result.metadata?.classification || 'なし'} - 例:${result.metadata?.goodBadExample || 'なし'}`);
        });
        logger.info('==========================================\n');
      }

      // Step 4: ミッション資料のフィルタリング
      const missionDocs = knowledgeResults.filter(result => {
        const source = result.source || '';
        const metadata = result.metadata || {};
        const classification = metadata.classification || '';
        
        return classification === 'ミッション' || source.includes('ミッション');
      });

      logger.info(`📊 ミッション分類の資料: ${missionDocs.length}件`);

      let filteredMissionDocs = missionDocs;
      if (lessonNumber) {
        const lessonSpecificDocs = missionDocs.filter(doc => {
          const source = doc.source || '';
          const content = doc.content || '';
          
          return source.includes(`レッスン${lessonNumber}`) || 
                 content.includes(`レッスン${lessonNumber}`);
        });
        
        if (lessonSpecificDocs.length > 0) {
          logger.info(`📚 レッスン${lessonNumber}専用のミッション: ${lessonSpecificDocs.length}件`);
          filteredMissionDocs = lessonSpecificDocs;
        } else {
          logger.warn(`⚠️ レッスン${lessonNumber}専用のミッションが見つかりませんでした。全ミッション資料を使用します。`);
        }
      }

      if (filteredMissionDocs.length === 0) {
        logger.warn('⚠️ ミッション資料が見つかりませんでした');
        
        const classificationCounts = knowledgeResults.reduce((acc, r) => {
          const cls = r.metadata?.classification || '未分類';
          acc[cls] = (acc[cls] || 0) + 1;
          return acc;
        }, {});
        
        logger.info('🔍 検索結果の分類別集計:', classificationCounts);
        
        return `📝 **ミッション提出を受け付けました**

「${userQuery}」

現在、該当するミッションの評価基準が見つかりませんでした。

**🔍 検索情報:**
• 検索結果: ${knowledgeResults.length}件
• ミッション分類: ${missionDocs.length}件
• 検索クエリ: "${optimizedQuery}"

**📋 考えられる原因:**
• 知識ベースにミッション資料が登録されていない
• ミッション資料の分類が正しく設定されていない

📞 **次のステップ**:
• \`②プライベート相談\` で個別フィードバックを受ける
• 担任の先生に直接確認する

引き続きサポートさせていただきます！✨`;
      }

      // Step 5: 良い例・悪い例の抽出
      const goodExamples = filteredMissionDocs.filter(doc => {
        const metadata = doc.metadata || {};
        const exampleType = metadata.goodBadExample || metadata.exampleType || '';
        return exampleType === '良い例' || doc.source.includes('良い例');
      });

      const badExamples = filteredMissionDocs.filter(doc => {
        const metadata = doc.metadata || {};
        const exampleType = metadata.goodBadExample || metadata.exampleType || '';
        return exampleType === '悪い例' || doc.source.includes('悪い例');
      });

      logger.info(`📊 良い例: ${goodExamples.length}件、悪い例: ${badExamples.length}件`);

      let missionCategory = '不明';
      if (filteredMissionDocs.length > 0 && filteredMissionDocs[0].metadata) {
        missionCategory = filteredMissionDocs[0].metadata.category || '不明';
      }

      logger.info(`📁 ミッションカテゴリ: ${missionCategory}`);

      // Step 6: 評価基準コンテキスト構築
      let missionContext = '【ミッション評価基準】\n\n';
      
      if (goodExamples.length > 0) {
        missionContext += '## ✅ 良い例の特徴\n';
        goodExamples.slice(0, 5).forEach((doc, index) => {
          const content = doc.answer || doc.content.substring(0, 800);
          missionContext += `${index + 1}. ${doc.source}\n${content}\n\n`;
        });
      }

      if (badExamples.length > 0) {
        missionContext += '## ❌ 悪い例（避けるべきポイント）\n';
        badExamples.slice(0, 5).forEach((doc, index) => {
          const content = doc.answer || doc.content.substring(0, 800);
          missionContext += `${index + 1}. ${doc.source}\n${content}\n\n`;
        });
      }

      // Step 7: URL資料を評価基準に追加
      if (urlContents.length > 0) {
        const urlContext = urlContentLoader.formatUrlContentsForContext(urlContents);
        missionContext += urlContext;
        logger.info('✅ URL資料を評価基準コンテキストに追加しました');
      }

      // Step 8: 画像コンテキスト
      let imageContext = '';
      if (imageUrls.length > 0) {
        imageContext = `\n\n【添付画像】\nユーザーが${imageUrls.length}枚の画像を添付しています。\n画像の内容を確認して、ミッション評価に反映してください。\n`;
        logger.info('🖼️ 画像情報をシステムプロンプトに追加');
      }

      // Step 9: システムプロンプト構築（教育的文脈強化版 + キャラクター設定）
      const systemPrompt = `${WANAMI_CHARACTER}

あなたはVTuber育成スクールの講師として、ミッション提出を評価します。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎓 重要な教育的文脈
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

これは**教育目的のVTuberスクールのミッション課題評価**です。

【教育活動の性質】
• 生徒が提出したデザイン作品（サムネイル、ポスト画像、動画作品など）を評価
• 学習成果物に対する建設的なフィードバック提供
• 教育的・学術的な目的での画像分析
• プライバシー保護を前提とした教材評価

【画像の取り扱い】
添付されている画像は以下のいずれかです：
• 生徒自身が作成したデザイン作品（オリジナル作品）
• 学習目的で参考にしたデザインサンプル
• VTuber活動用の教育教材

これらは教育カリキュラムの一部として、適切な評価とフィードバックを必要としています。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【あなたの役割】
1. 提出されたミッション内容を教育的観点から評価する
2. 良い例と悪い例を参考に、**合格か不合格かを明確に判定する**
3. 提出されたURL資料（ある場合）も評価の参考にする
4. 具体的で建設的な改善ポイントを提示する
5. 励ましの言葉で次のステップを示す

【ミッションのカテゴリ】
${missionCategory}

【評価基準】
${missionContext}
${imageContext}

【提出されたミッション】
${userQuery}

【画像評価の観点】
添付されている画像は教育目的のデザイン作品です。以下の観点で客観的に評価してください：

📐 **デザインの基本原則**
• 近接（Proximity）: 関連要素の適切な配置
• 整列（Alignment）: 情報の整理と視覚的統一感
• 強弱（Contrast）: 重要度に応じた視覚的メリハリ
• 反復（Repetition）: デザイン要素の一貫性

🎨 **視覚的要素**
• 配色とカラーバランス
• テキストの可読性とフォント選択
• 画像やグラフィック要素の適切な使用
• 全体的な視覚的調和

✨ **完成度と実用性**
• VTuber活動における実用性
• ターゲット視聴者への訴求力
• プロフェッショナルな仕上がり

**重要な注意事項**:
• 画像に人物が写っている場合でも、これは教育目的の作品評価です
• デザインの技術的側面に焦点を当てて客観的に評価してください
• 個人を特定する情報ではなく、デザイン要素を分析してください

【回答フォーマット】
🎯 **判定結果**: 【✅ 合格】または【❌ 不合格（要修正）】

📊 **評価ポイント**:
• 良い点: （具体的に）
• 改善が必要な点: （具体的に）

💡 **改善アドバイス**:
（不合格の場合、どこをどう修正すべきか具体的に。合格の場合は更なる向上のヒント）

✨ **次のステップ**:
（合格の場合は次のミッションへ、不合格の場合は修正の進め方）

**評価の重要指針**:
- 必ず「✅ 合格」または「❌ 不合格（要修正）」のどちらかを最初に明示すること
- 評価は厳格に、でも建設的なフィードバックを提供
- 教育的観点から具体的で実践的なアドバイスを提供
- 添付画像がある場合は、画像の内容も評価に含める
- 提出されたURL資料がある場合は、その内容も評価に活用する
- 生のスライドやドキュメント内容をコピペせず、要約して説明`;

      // Step 10: AI応答生成
      const imageMessages = imageUrls.map(url => ({ url }));
      logger.info(`🖼️ OpenAI APIに渡す画像: ${imageMessages.length}件`);

      const aiResponse = await generateAIResponse(
        systemPrompt,
        userQuery,
        imageMessages,
        context,
        { maxTokens: 3000, temperature: 0.7 }
      );

      logger.info('✅ ミッション提出応答生成完了');
      
      const isPassed = this._detectPassFailStatus(aiResponse);
      logger.info(`🎯 判定結果: ${isPassed ? '合格' : '不合格または要改善'}`);
      
      // URL取得情報をログに記録
      if (urlContents.length > 0) {
        const stats = urlContentLoader.getStats(urlContents);
        logger.info(`📊 URL資料最終統計: 成功${stats.success}/${stats.total}件、総文字数${stats.totalChars}文字`);
      }
      
      logger.info('📝 ===== ミッション評価処理完了 (v2.11.0) =====\n');

      return aiResponse;

    } catch (error) {
      logger.errorDetail('❌ ミッション提出応答エラー:', error);
      return '申し訳ございません。現在ミッション評価システムにアクセスできません。しばらく待ってから再度お試しください。';
    }
  }

  _detectPassFailStatus(responseText) {
    if (responseText.includes('✅ 合格') || responseText.includes('評価結果: 合格')) {
      return true;
    }

    if (responseText.includes('❌ 不合格') || responseText.includes('評価結果: 不合格')) {
      return false;
    }

    const passKeywords = ['合格', '素晴らしい', 'よくできました', '基準を満たして'];
    const failKeywords = ['不合格', '改善が必要', '再提出', '要修正'];

    const hasPass = passKeywords.some(kw => responseText.includes(kw));
    const hasFail = failKeywords.some(kw => responseText.includes(kw));

    return hasPass && !hasFail;
  }

  // ✨ v2.11.0: 厳格な知識ベース限定応答（挨拶検出機能追加版）
  async generateKnowledgeOnlyResponse(userQuery, context = {}) {
    try {
      logger.ai('知識ベース限定応答生成開始（v2.11.0）');

      // ✨ v2.11.0: 挨拶検出（最優先）
      const greetingResponse = detectGreeting(userQuery);
      if (greetingResponse) {
        logger.info('✅ 挨拶パターン検出 → 挨拶応答を返します');
        return greetingResponse;
      }

      const knowledgeResults = await this._searchKnowledge(userQuery, {
        maxResults: 5,
        minScore: 0.05,
        includeMetadata: true
      });

      logger.info(`🔍 検索結果: ${knowledgeResults.length}件`);

      // 検索結果0件の場合は即座にリターン
      if (knowledgeResults.length === 0) {
        logger.warn('⚠️ 知識ベースに情報なし → 即座に「情報なし」メッセージを返す');
        return `🤖 **わなみです！**

申し訳ございません。「${userQuery}」に関する情報が知識ベースに見つかりませんでした。

**🔍 他の質問方法を試してみてください：**
• より具体的なキーワードで質問
• 関連する別の表現で質問
• \`/soudan\` コマンドから該当するカテゴリを選択

**📚 現在の知識ベースには以下の情報が含まれています：**
• VTuber活動の基本
• 配信技術と機材設定
• Live2Dモデルの扱い方
• SNS運用とマーケティング
• デザインとブランディング

---
📚 *知識ベースに情報がありませんでした*`;
      }

      // 参照資料を明確にマークアップ
      let knowledgeContext = '=' + '='.repeat(59) + '\n';
      knowledgeContext += '📚 参照資料（これだけを使って回答してください）\n';
      knowledgeContext += '=' + '='.repeat(59) + '\n\n';
      
      knowledgeResults.forEach((result, index) => {
        const sourceTitle = result.title || result.source;
        const content = result.answer || result.content.substring(0, 1200);
        
        knowledgeContext += `【資料${index + 1}】${sourceTitle}\n`;
        knowledgeContext += '-'.repeat(60) + '\n';
        knowledgeContext += `${content}\n\n`;
      });
      
      knowledgeContext += '=' + '='.repeat(59) + '\n';
      knowledgeContext += '以上が参照資料です。この内容だけを使って回答してください。\n';
      knowledgeContext += '=' + '='.repeat(59) + '\n';

      // Few-shot 例を追加したプロンプト
      const fewShotExample = `━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 回答の良い例・悪い例
━━━━━━━━━━━━━━━━━━━━━━━━━━

【良い例】✅
質問: 「配信の準備で必要なことは？」
参照資料: 「配信前には機材チェック、照明調整、音声テストが必要」
正しい回答: 「配信の準備として、機材チェック、照明調整、音声テストが必要です✨ これらを事前に確認することで...（参照資料の内容を展開）」

【悪い例】❌
質問: 「配信の準備で必要なことは？」
参照資料: （上記と同じ）
間違った回答: 「配信の準備では、機材チェックや照明調整はもちろん、配信スケジュールの告知やサムネイル作成も重要です」
→ ❌ 「スケジュール告知」「サムネイル作成」は参照資料にない情報！

━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      const systemPrompt = `${WANAMI_CHARACTER}

━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 絶対に守るべき3つのルール 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ **以下の【参照資料】に書かれている内容だけを使う**
   → 参照資料の文章を理解し、要約・整理して説明する
   
2️⃣ **参照資料にない情報は絶対に答えない**
   → あなたの学習データや一般知識は完全に無視する
   
3️⃣ **情報がない場合は正直に「資料にありません」と答える**
   → 推測や想像で補完しない

━━━━━━━━━━━━━━━━━━━━━━━━━━

${fewShotExample}

${knowledgeContext}

【重要なスクールルール】
- コラボ配信禁止
- 生徒同士の横つながり禁止
- YouTube: 週4回以上配信（1回1.5時間以上）
- X: 1日2回以上投稿（画像付き、ハッシュタグ2つまで）
- XのDMは案件のみ

【質問】
${userQuery}

【回答の要件】
✅ 参照資料の内容を理解し、わかりやすく要約・説明する
✅ 800文字以上の詳細な説明（参照資料の内容が許す限り）
✅ 絵文字で見やすく（🎯📝💡など）
✅ 具体例は参照資料内のものだけを使う
✅ 最後に「📚 **出典**: [資料1][資料2]...」と明記

❌ 参照資料にない情報を追加しない
❌ 一般知識で補足しない
❌ 推測や想像で答えない
❌ 生のスライド内容をコピペしない

━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 最終確認: 今から書く回答は、すべて上記の参照資料に基づいていますか？
━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      const aiResponse = await generateAIResponse(
        systemPrompt,
        userQuery,
        [],
        context,
        { 
          maxTokens: 3000,
          temperature: 0.3
        }
      );

      logger.info('✅ 知識ベース限定応答生成完了（v2.11.0）');
      
      // フッター追加
      const footer = `\n\n---\n📚 *知識ベースからの回答（${knowledgeResults.length}件の資料を参照）*`;
      
      return aiResponse + footer;

    } catch (error) {
      logger.errorDetail('知識ベース限定応答エラー:', error);
      return '申し訳ございません。現在知識ベースにアクセスできません。しばらく待ってから再度お試しください。';
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      initialized: this.initialized,
      initializing: this.isInitializing,
      maxContextTokens: this.maxContextTokens,
      service: 'RAG System',
      version: '2.11.0',  // 🆕 バージョン更新
      characterSettings: 'わなみさん（23歳、新人マネージャー、おっちょこちょい、熱意と情熱）',
      greetingPatterns: GREETING_PATTERNS.length,
      urlLoader: urlContentLoader.getStatus()
    };
  }
}

const ragSystem = new RAGSystem();

async function initializeRAG() {
  await ragSystem.initialize();
}

async function generateKnowledgeOnlyResponse(userQuery, context = {}) {
  return await ragSystem.generateKnowledgeOnlyResponse(userQuery, context);
}

async function generateMissionResponse(userQuery, imageUrls = [], context = {}) {
  return await ragSystem.generateMissionResponse(userQuery, imageUrls, context);
}

module.exports = {
  ragSystem,
  initializeRAG,
  generateKnowledgeOnlyResponse,
  generateMissionResponse,
  initializeRAGSystem: initializeRAG
};
