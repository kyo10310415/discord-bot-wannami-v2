// services/rag-system.js - RAG(Retrieval-Augmented Generation)システム v2.7.1 (出典表示改善版)
// Version: 2.7.1
// 更新日: 2025-11-14
// 変更内容: 出典表示を明確に指示、フォーマット統一

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

  _optimizeSearchQuery(userQuery) {
    const stopWords = [
      'について', '教えて', 'ください', 'どうすれば', 'どうやって',
      'どのように', 'ですか', 'でしょうか', 'なんですか', 'とは',
      'を知りたい', 'を教えて', 'したい', 'したいです', 'です',
      'ます', 'ですか？', 'でしょうか？', 'ありますか', 'ありますか？',
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

      const systemPrompt = `あなたは「わなみさん」というVTuber育成スクールのアシスタントです。

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

  async generateMissionResponse(userQuery, imageUrls = [], context = {}) {
    try {
      logger.ai('📝 ===== ミッション提出専用処理開始 =====');
      logger.info('📝 ユーザー入力:', userQuery);
      logger.info(`🖼️ 画像URL受信: ${imageUrls.length}件`);

      await this.waitForInitialization();

      const { optimizedQuery, lessonNumber, originalQuery } = this._optimizeSearchQuery(userQuery);
      
      logger.info(`🔍 検索クエリ最適化:`);
      logger.info(`  元のクエリ: "${originalQuery}"`);
      logger.info(`  最適化後: "${optimizedQuery}"`);
      if (lessonNumber) {
        logger.info(`  レッスン番号: ${lessonNumber}`);
      }

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
4. 励ましの言葉で次のステップを示す。**励ましの言葉というワードは入れない**

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

      const imageMessages = imageUrls.map(url => ({ url }));
      logger.info(`🖼️ OpenAI APIに渡す画像: ${imageMessages.length}件`);

      const aiResponse = await generateAIResponse(
        systemPrompt,
        userQuery,
        imageMessages,
        context,
        { maxTokens: 3000 }
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

  // ✨ v2.7.1: 出典表示を明確に指示した知識ベース限定応答
  async generateKnowledgeOnlyResponse(userQuery, context = {}) {
    try {
      logger.ai('知識ベース限定応答生成開始（詳細版・出典表示改善）');

      const knowledgeResults = await this._searchKnowledge(userQuery, {
        maxResults: 5,
        minScore: 0.05,
        includeMetadata: true
      });

      logger.info(`🔍 検索結果: ${knowledgeResults.length}件`);

      if (knowledgeResults.length === 0) {
        return `🤖 **わなみさんです！**\n\n申し訳ございません。「${userQuery}」に関する情報が知識ベースに見つかりませんでした。

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
`;
      }

      // ✨ v2.7.1: 出典リストを明確に作成
      let knowledgeContext = '【参照資料】\n\n';
      let sourcesList = ''; // 出典リスト用
      
      knowledgeResults.forEach((result, index) => {
        const sourceTitle = result.title || result.source;
        
        knowledgeContext += `## 資料${index + 1}: ${sourceTitle} (関連度: ${(result.score * 100).toFixed(0)}%)\n`;
        const content = result.answer || result.content.substring(0, 800);
        knowledgeContext += `${content}\n\n`;
        
        // ✨ 出典リストに追加
        sourcesList += `${index + 1}. ${sourceTitle}\n`;
      });

      // ✨ v2.7.1: 出典表示を強く指示するプロンプト
      const systemPrompt = `あなたは「わなみさん」というVTuber育成スクールの講師です。

【重要なルール】
1. 以下の参照資料の内容**のみ**を使って回答してください
2. 参照資料の生の内容（スライド番号、コピーライトなど）をそのまま貼り付けないでください
3. 内容を理解して、**要約・整理・わかりやすく説明**してください
4. 具体的なアドバイスと実践的な手順を提供してください
5. 親しみやすく、でも専門的な口調で回答してください

【最重要ルール - 絶対に守ること】
1. **以下の【参照資料】の内容だけを使って回答してください**
2. **参照資料に書かれていない情報は、絶対に答えないでください**
3. **あなたの一般知識や学習データは一切使用しないでください**
4. **推測や想像で答えないでください**
5. **参照資料に情報がない場合は、正直に「知識ベースに情報がありません」と答えてください**

【禁止事項】
- **参照資料にない情報を追加しない**
- **一般知識で補足しない**
- **推測や想像で答えない**

【詳細回答の要件（v2.7.0）】
- **段階的な説明**: ステップごとに分けて丁寧に説明
- **具体例の充実**: 可能な限り具体的な例を複数挙げる
- **背景・理由の説明**: 「なぜそうするのか」も説明
- **補足情報**: 関連する情報や注意点も含める
- **実践的なヒント**: すぐに実践できる具体的なアドバイス

【✨✨ 出典表示の要件（v2.7.1 - 重要）】
**必須**: 回答の最後に、参照した資料の出典を以下のフォーマットで明記してください。

**出典フォーマット（必ず使用）**:
---
📚 **出典**: [資料名]

例:
---
📚 **出典**: Xの企画基本編（感動と個性）

**出典表示のルール**:
1. 回答の最後に必ず「---」で区切り線を入れる
2. 📚 絵文字を使って「**出典**: 」と書く
3. 参照した主な資料名を記載（最大2～3件）
4. レッスン名やカテゴリ名を含める

【回答の構成例】
1. **導入** (50～100文字)
   - 質問内容の確認と要点の提示
   
2. **本文** (500～700文字)
   - 詳細な説明（手順、方法、具体例）
   - 各ステップの背景・理由
   - 実践的な具体例（2～3つ）
   
3. **補足情報** (150～200文字)
   - 関連情報、注意点、よくある質問
   - より深く学ぶためのヒント
   
4. **まとめ** (100文字)
   - 重要なポイントの再確認
   - 次のステップの提案

5. **✨✨ 出典表示（必須）** ← これを忘れないこと！
   ---
   📚 **出典**: [資料名]

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

【参照資料】
${knowledgeContext}

【参照可能な資料一覧】
${sourcesList}

【質問】
${userQuery}

【回答の形式】
- 🎯 見出しで要点を明確に
- 📝 箇条書きや番号付きリストで整理
- 💡 具体例を交えて説明（複数の例を提示）
- ✨ 励ましの言葉も添える。**励ましの言葉というワードは使わない**
- ⚠️ 注意点や補足情報も充実させる
- **📚 最後に必ず出典を「---」の後に明記** ← 絶対に忘れないこと！

【最重要ルール - 絶対に守ること】
1. **以下の【参照資料】の内容だけを使って回答してください**
2. **参照資料に書かれていない情報は、絶対に答えないでください**
3. **あなたの一般知識や学習データは一切使用しないでください**
4. **推測や想像で答えないでください**
5. **参照資料に情報がない場合は、正直に「知識ベースに情報がありません」と答えてください**

**絶対に守ること**: 
- "--- スライド X ---"のような生の内容を出力しないでください
- 詳細で丁寧な説明を心がけてください（800文字以上）
- 単に情報を列挙するのではなく、理解しやすいストーリーで説明してください
- **回答の最後に必ず出典を表示してください**`;

      const aiResponse = await generateAIResponse(
        systemPrompt,
        userQuery,
        [],
        context,
        { maxTokens: 3000 }
      );

      logger.info('✅ 知識ベース限定応答生成完了（詳細版・出典表示改善）');
      
      // ✨ v2.7.1: フッターに参照件数を追加
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
      version: '2.7.1'
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
