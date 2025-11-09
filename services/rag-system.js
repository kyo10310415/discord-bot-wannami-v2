// services/rag-system.js - RAG(Retrieval-Augmented Generation)システム v2.8.0 (強制知識ベース限定版)

const logger = require('../utils/logger');
const knowledgeBase = require('./knowledge-base');
const { generateAIResponse } = require('./openai-service');
const { LIMITS } = require('../utils/constants');

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

  // ✅ 追加: AI応答が知識ベース外の情報を含むかチェック
  _checkIfResponseUsesKnowledgeBase(response, knowledgeResults) {
    // 知識ベースの資料名がAI応答に含まれているかチェック
    const sourceNames = knowledgeResults.map(r => r.source || r.title);
    const hasSourceReference = sourceNames.some(name => 
      response.includes(name) || 
      response.includes('レッスン') || 
      response.includes('出典') ||
      response.includes('参照') ||
      response.includes('資料')
    );

    // 一般知識を示すフレーズをチェック
    const generalKnowledgePhrases = [
      '一般的に',
      '通常は',
      '基本的には',
      'よく知られている',
      '一般論として',
      '世間では'
    ];
    
    const hasGeneralKnowledge = generalKnowledgePhrases.some(phrase => 
      response.includes(phrase)
    );

    return {
      usesKnowledgeBase: hasSourceReference,
      usesGeneralKnowledge: hasGeneralKnowledge,
      sourceNames: sourceNames
    };
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

      const systemPrompt = `あなたは「わなみさん」という名前のVTuber育成スクールのアシスタントです。

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

【重要なスクールのルール】
- **コラボ配信の禁止**
- **活動者や生徒同士の横のつながり禁止**
- **コミュニティへの参加禁止**
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

【知識ベース情報】
${knowledgeContext || '関連する知識ベース情報が見つかりませんでした。'}

上記の知識ベース情報を参考に、ユーザーの質問に答えてください。
**重要**: スライドの生の内容（"--- スライド X ---"など）をそのまま出力せず、内容を理解して要約・整理してください。`;

      const aiResponse = await generateAIResponse(
        systemPrompt,
        userQuery,
        images,
        context
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

      const systemPrompt = `あなたは「わなみさん」というVTuber育成スクールのアシスタントです。

${knowledgeContext}
${visionContext}

ユーザーの質問と添付画像を確認して、適切なアドバイスを提供してください。
**重要**: 知識ベースの内容を要約・整理して、わかりやすく説明してください。`;

      const response = await generateAIResponse(
        systemPrompt,
        userQuery,
        imageUrls.map(url => ({ url })),
        { ...context, temperature: 0 } 
      );

      logger.success('画像解析統合RAG応答生成完了');
      return response;

    } catch (error) {
      logger.errorDetail('画像解析統合RAG応答エラー:', error);
      throw error;
    }
  }

  // ミッション提出専用応答生成（変更なし）
  async generateMissionResponse(userQuery, imageUrls = [], context = {}) {
    try {
      logger.ai('📝 ===== ミッション提出専用処理開始 =====');
      logger.info('📝 ユーザー入力:', userQuery);
      logger.info(`🖼️ 画像URL受信: ${imageUrls.length}件`);
      
      if (imageUrls.length > 0) {
        logger.info('🖼️ 画像URL詳細:', imageUrls);
      }

      await this.waitForInitialization();

      let searchQuery = userQuery;
      
      const lessonMatch = userQuery.match(/レッスン(\d+)/);
      if (lessonMatch) {
        const lessonNumber = lessonMatch[1];
        logger.info(`📚 レッスン番号を検出: ${lessonNumber}`);
        
        searchQuery = userQuery.replace(/レッスン\d+の?/g, '').trim();
        
        if (!searchQuery || searchQuery.length < 2) {
          searchQuery = 'ミッション';
        }
        
        logger.info(`🔍 最適化された検索クエリ: "${userQuery}" → "${searchQuery}"`);
      }

      logger.info('🔍 知識ベース検索開始（ミッション資料）...');
      
      const knowledgeResults = await this._searchKnowledge(searchQuery, {
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

      const missionDocs = knowledgeResults.filter(result => {
        const source = result.source || '';
        const metadata = result.metadata || {};
        const classification = metadata.classification || '';
        
        return classification === 'ミッション' || source.includes('ミッション');
      });

      logger.info(`📊 ミッション分類の資料: ${missionDocs.length}件`);

      let filteredMissionDocs = missionDocs;
      if (lessonMatch) {
        const lessonNumber = lessonMatch[1];
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
• 検索クエリ: "${searchQuery}"

**📋 考えられる原因:**
• スプレッドシートにミッション資料のURLが設定されていない
• ミッション資料の内容が読み込まれていない

📞 **次のステップ**:
• \`②プライベート相談\` で個別フィードバックを受ける
• 担任の先生に直接確認する

引き続きサポートさせていただきます！✨`;
      }

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

      let imageContext = '';
      if (imageUrls.length > 0) {
        imageContext = `\n\n【添付画像】\nユーザーが${imageUrls.length}枚の画像を添付しています。\n画像の内容を確認して、ミッション評価に反映してください。\n`;
        logger.info('🖼️ 画像情報をシステムプロンプトに追加');
      }

      const systemPrompt = `あなたは「わなみさん」というVTuber育成スクールの講師で、ミッション提出を評価します。

【あなたの役割】
1. 提出されたミッション内容を評価する
2. 良い例と悪い例を参考に、**合格か不合格かを明確に判定する**
3. 具体的な改善ポイントを提示する
4. 励ましの言葉で次のステップを示す

【ミッションのカテゴリ】
${missionCategory}

【評価基準】
${missionContext}
${imageContext}

【提出されたミッション】
${userQuery}

【回答フォーマット】
🎯 **判定結果**: 【✅ 合格】または【❌ 不合格（要修正）】

📊 **評価ポイント**:
• 良い点: （具体的に）
• 改善が必要な点: （具体的に）

💡 **改善アドバイス**:
（不合格の場合、どこをどう修正すべきか具体的に。合格の場合は更なる向上のヒント）

✨ **次のステップ**:
（合格の場合は次のミッションへ、不合格の場合は修正の進め方）

**重要な指示**:
- 必ず「✅ 合格」または「❌ 不合格（要修正）」のどちらかを最初に明示すること
- 評価は厳格に、でも励ましの言葉も忘れずに
- スライドやドキュメントの生テキストをコピペしない
- 具体的で実践的なアドバイスを提供
- 添付画像がある場合は、画像の内容も評価に含める`;

      const imageMessages = imageUrls && imageUrls.length > 0
        ? imageUrls.map(imgUrl => ({
            url: typeof imgUrl === 'string' ? imgUrl : imgUrl.url,
            detail: "high"
          }))
        : [];

      logger.info(`🖼️ OpenAI APIに渡す画像メッセージ: ${imageMessages.length}件`);
      if (imageMessages.length > 0) {
        logger.info('🖼️ 画像メッセージ詳細:', imageMessages);
      }

      const aiResponse = await generateAIResponse(
        systemPrompt,
        userQuery,
        imageMessages,
        { ...context, temperature: 0 } 
      );

      logger.info('✅ ミッション提出応答生成完了');
      
      const isPassed = this._detectPassFailStatus(aiResponse);
      logger.info(`🎯 判定結果: ${isPassed ? '合格' : '不合格または要改善'}`);
      logger.info('📝 ===== ミッション評価処理完了 =====\n');

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

  // ✅ 完全修正: 知識ベース外の回答を強制的にブロック（v2.8.0）
  async generateKnowledgeOnlyResponse(userQuery, context = {}) {
    try {
      logger.ai('🔒 知識ベース強制限定モード: 応答生成開始');
      
      const imageUrls = context.imageUrls || [];
      logger.info(`🖼️ 画像URL受信: ${imageUrls.length}件`);
      if (imageUrls.length > 0) {
        logger.info('🖼️ 画像URL詳細:', imageUrls);
      }

      const knowledgeResults = await this._searchKnowledge(userQuery, {
        maxResults: 10,
        minScore: 0.01,
        includeMetadata: true
      });

      logger.info(`🔍 検索結果: ${knowledgeResults.length}件`);

      if (knowledgeResults.length > 0) {
        logger.info('\n📊 ===== 検索結果詳細（上位5件） =====');
        knowledgeResults.slice(0, 5).forEach((result, index) => {
          logger.info(`[${index + 1}] ${result.source} (スコア: ${result.score.toFixed(3)})`);
        });
        logger.info('======================================\n');
      }

      if (knowledgeResults.length === 0) {
        logger.warn('⚠️ 知識ベースに関連情報が見つかりませんでした');
        
        return `🤖 **わなみさんです！**

申し訳ございません。「**${userQuery}**」に関する情報が知識ベースに見つかりませんでした。

**🔍 検索情報:**
• 検索キーワード: "${userQuery}"
• 検索結果: 0件

**💡 より良い検索結果を得るためのヒント:**
• レッスン番号を指定: 「レッスン5の内容を教えて」
• カテゴリを含める: 「デザインの基本について」
• 具体的なキーワード: 「コラボ配信は禁止？」

**📚 知識ベースに含まれる主なカテゴリ:**
• VTuber活動の基本ルール
• YouTube配信の運用方法
• SNS（X/Twitter）運用
• 配信技術と機材設定
• デザインとブランディング

もう一度、違う言葉で質問してみてくださいね！✨`;
      }

      if (knowledgeResults.length < 3) {
        logger.warn(`⚠️ 検索結果が少ない: ${knowledgeResults.length}件`);
      }

      // ✅ 重要: 知識ベースの内容を大量に含める
      let knowledgeContext = '';
      knowledgeResults.forEach((result, index) => {
        knowledgeContext += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        knowledgeContext += `【資料${index + 1}】${result.title || result.source}\n`;
        knowledgeContext += `関連度: ${(result.score * 100).toFixed(0)}%\n`;
        knowledgeContext += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        // ✅ より多くの内容を渡す（1000 → 1500文字）
        const content = result.answer || result.content.substring(0, 1500);
        knowledgeContext += `${content}\n\n`;
      });

      let imageContext = '';
      if (imageUrls.length > 0) {
        imageContext = `\n\n【添付画像】\nユーザーが${imageUrls.length}枚の画像を添付しています。\n`;
        logger.info('🖼️ 画像情報をシステムプロンプトに追加');
      }

      // ✅ 最終手段: 非常にシンプルで明確なプロンプト
      const systemPrompt = `あなたはVTuber育成スクール「わなみさん」の講師です。

【絶対厳守】
以下の資料の内容だけを使って回答してください。資料にない情報は一切使わないでください。

【資料】
${knowledgeContext}
${imageContext}

【質問】
${userQuery}

【回答方法】
1. 上記の資料内容を読む
2. 資料の内容を自分の言葉で要約する
3. 絵文字を使って分かりやすく説明する
4. 最後に「📚 出典: [資料名]」を必ず書く

【指示】
上記の資料1〜10の内容だけを使って、回答してください。
必ず「📚 出典: [資料名]」を最後に書いてください。

資料を必ず使って回答してください。`;

      const imageMessages = imageUrls && imageUrls.length > 0
        ? imageUrls.map(imgUrl => ({
            url: typeof imgUrl === 'string' ? imgUrl : imgUrl.url,
            detail: "high"
          }))
        : [];

      logger.info(`🖼️ OpenAI APIに渡す画像メッセージ: ${imageMessages.length}件`);
      logger.info('🤖 AI応答生成中（知識ベース強制限定モード）...');

      const aiResponse = await generateAIResponse(
        systemPrompt,
        userQuery,
        imageMessages,
        { ...context, temperature: 0 } 
      );

      // ✅ 追加: AI応答のチェック
      const check = this._checkIfResponseUsesKnowledgeBase(aiResponse, knowledgeResults);
      logger.info(`🔍 AI応答チェック: 知識ベース使用=${check.usesKnowledgeBase}, 一般知識使用=${check.usesGeneralKnowledge}`);

      logger.info('✅ 知識ベース強制限定モード: 応答生成完了');
      
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
      version: '2.8.0'  // ✅ バージョン更新（強制知識ベース限定版）
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
  generateMissionResponse
};
