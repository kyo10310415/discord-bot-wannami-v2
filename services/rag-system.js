// services/rag-system.js - RAG(Retrieval-Augmented Generation)システム v2.16.0 (Phase 16: トップ2戦略)

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

  // ✅ v2.12.0: クエリ最適化ロジックを大幅改善
  _extractKeyKeywords(query) {
    const queryLower = query.toLowerCase();
    
    // ✅ Phase 11: G列（備考）に記載されている重要フレーズを優先的に抽出
    const topicKeywords = [
      // ============================================
      // 📌 G列の重要フレーズ（長いフレーズを優先）
      // ============================================
      
      // レッスン13専用
      '誰に向けての配信か',
      '誰に向けて',
      
      // レッスン14専用
      'テスト配信',
      '配信タイトル',
      '概要欄',
      
      // その他のレッスン
      'YouTubeチャンネル作成',
      '配信機材',
      'アナリティクス',
      'ヒットコンテンツ',
      
      // ============================================
      // 📌 複数単語の組み合わせ（優先度高）
      // ============================================
      '初配信', '配信準備', '配信手順', '配信機材',
      'チャンネル作成', '配信設定', '配信企画', '配信ルール',
      'VTuber名', 'チャンネル名', 'ハンドルネーム', 'キャラ設定',
      '良い例', '悪い例', 'NG例', 'OK例',
      
      // ============================================
      // 📌 単一単語（基本キーワード）
      // ============================================
      'VTuber', 'vtuber', '名前', 'ブランド', '配信', 'YouTube', 'X', 
      'デザイン', 'サムネイル', 'ミッション', '課題', 'レッスン', 
      '3H', 'HERO', 'HUB', 'HELP', 'マーケティング', '企画', 
      'コンセプト', 'ターゲット', '差別化', 'コラボ', 'SNS', 
      'イラスト', 'Live2D', 'モデリング', '音声', 'ボイスチェンジャー', 
      'OBS', 'BGM', '告知', 'プロモーション', '視聴者', 'リスナー', 
      'ファン', '収益化', 'スパチャ', 'メンバーシップ', 'グッズ', 
      '案件', 'トラブル', '炎上', 'アンチ', 'メンタル', 'モチベーション',
      '目標', '戦略', '分析', '改善', 'フィードバック', 'キャラクター', 
      'ペルソナ', '世界観', 'ストーリー', 'スクール', 'ルール', 
      '禁止', '推奨', 'テスト', '手順', '注意点', '機材', '準備'
    ];
    
    const foundKeywords = [];
    
    // ✅ 改善: 長いフレーズから順に検索（短いフレーズに飲み込まれないように）
    const sortedKeywords = topicKeywords.sort((a, b) => b.length - a.length);
    
    sortedKeywords.forEach(keyword => {
      if (queryLower.includes(keyword.toLowerCase())) {
        // ✅ 重複チェック: 既に含まれている場合はスキップ
        const isDuplicate = foundKeywords.some(found => 
          found.includes(keyword) || keyword.includes(found)
        );
        
        if (!isDuplicate) {
          foundKeywords.push(keyword);
        }
      }
    });
    
    if (foundKeywords.length > 0) {
      logger.info(`🔍 クエリ最適化: ${foundKeywords.length}個の重要キーワードを抽出`);
      logger.info(`   元のクエリ: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`);
      logger.info(`   抽出されたキーワード: "${foundKeywords.join(', ')}"`);
      
      // ✅ 改善: 重要度順にソート（長いフレーズを優先）
      const sortedFound = foundKeywords.sort((a, b) => b.length - a.length);
      logger.info(`   最適化後: "${sortedFound.join(' ')}"`);
      
      return sortedFound.join(' ');
    }
    
    logger.info('🔍 重要キーワードが見つからなかったため、元のクエリを使用');
    return query;
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

  /**
   * ✨✨ Phase 16: トップ2戦略 ✨✨
   * - 1位を5回繰り返す（優先度を確保）
   * - 2位を3回繰り返す（補足情報を確保）
   * - 3位以降を排除（ノイズを削減）
   * - コンテンツは全文を使用（Phase 15bの利点を維持）
   */
  _buildPrioritizedContext(knowledgeResults) {
    if (knowledgeResults.length === 0) {
      return { context: '', topResult: null, secondResult: null };
    }

    const topResult = knowledgeResults[0];
    const secondResult = knowledgeResults.length >= 2 ? knowledgeResults[1] : null;
    let context = '';

    // 🚀 Phase 16: トップ2戦略を適用
    logger.info(`🚀 Phase 16: トップ2戦略を適用（1位5回 + 2位3回）`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1位の資料を5回繰り返す
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logger.info(`📄 Phase 16: 1位「${topResult.source}」の全文を使用（文字数: ${topResult.content?.length || 0}文字）`);
    
    for (let i = 1; i <= 5; i++) {
      context += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      context += `🥇 【最重要資料（1位）・${i}回目: ${topResult.title || topResult.source}】\n`;
      context += `🎯 検索スコア: ${(topResult.score * 100).toFixed(0)}% （第1位）\n`;
      if (topResult.metadata && topResult.metadata.category) {
        context += `📂 カテゴリ: ${topResult.metadata.category}\n`;
      }
      if (topResult.metadata && topResult.metadata.remarks) {
        context += `🏷️ 備考: ${topResult.metadata.remarks}\n`;
      }
      context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      // ✨ Phase 16: コンテンツ全文を使用（Phase 15bの利点を維持）
      const topContent = topResult.answer || topResult.content;
      context += `${topContent}\n\n`;
      
      logger.info(`✅ Phase 16: 1位の資料を${i}回目に追加（スコア: ${topResult.score.toFixed(3)}）`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2位の資料を3回繰り返す（存在する場合）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (secondResult) {
      logger.info(`📄 Phase 16: 2位「${secondResult.source}」の全文を使用（文字数: ${secondResult.content?.length || 0}文字）`);
      
      for (let i = 1; i <= 3; i++) {
        context += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        context += `🥈 【重要資料（2位）・${i}回目: ${secondResult.title || secondResult.source}】\n`;
        context += `🎯 検索スコア: ${(secondResult.score * 100).toFixed(0)}% （第2位）\n`;
        if (secondResult.metadata && secondResult.metadata.category) {
          context += `📂 カテゴリ: ${secondResult.metadata.category}\n`;
        }
        if (secondResult.metadata && secondResult.metadata.remarks) {
          context += `🏷️ 備考: ${secondResult.metadata.remarks}\n`;
        }
        context += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        
        // ✨ Phase 16: コンテンツ全文を使用
        const secondContent = secondResult.answer || secondResult.content;
        context += `${secondContent}\n\n`;
        
        logger.info(`✅ Phase 16: 2位の資料を${i}回目に追加（スコア: ${secondResult.score.toFixed(3)}）`);
      }
    } else {
      logger.info('ℹ️ Phase 16: 2位の資料が存在しないため、1位のみを使用');
    }

    // ✨ Phase 16: 3位以降は排除
    logger.info(`✨ Phase 16: 3位以降の資料は排除（1位+2位のみを使用）`);

    const totalChars = context.length;
    logger.info(`📊 Phase 16: 構築したコンテキストの総文字数: ${totalChars.toLocaleString()}文字`);

    return { context, topResult, secondResult };
  }

  _checkIfResponseUsesKnowledgeBase(response, knowledgeResults) {
    const sourceNames = knowledgeResults.map(r => r.source || r.title);
    const hasSourceReference = sourceNames.some(name => 
      response.includes(name) || 
      response.includes('レッスン') || 
      response.includes('出典') ||
      response.includes('参照') ||
      response.includes('資料')
    );

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

  // ✅ v2.16.0: Phase 16 トップ2戦略（1位5回 + 2位3回）
  async generateKnowledgeOnlyResponse(userQuery, context = {}) {
    try {
      logger.ai('🔒 知識ベース強制限定モード: 応答生成開始（v2.16.0 Phase 16: トップ2戦略）');
      
      const imageUrls = context.imageUrls || [];
      logger.info(`🖼️ 画像URL受信: ${imageUrls.length}件`);
      if (imageUrls.length > 0) {
        logger.info('🖼️ 画像URL詳細:', imageUrls);
      }

      const originalQuery = userQuery;
      const optimizedQuery = this._extractKeyKeywords(userQuery);
      
      logger.info(`🔍 クエリ最適化適用:`);
      logger.info(`   元のクエリ: "${originalQuery}"`);
      logger.info(`   最適化後: "${optimizedQuery}"`);

      const knowledgeResults = await this._searchKnowledge(optimizedQuery, {
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

申し訳ございません。「**${originalQuery}**」に関する情報が知識ベースに見つかりませんでした。

**🔍 検索情報:**
• 元の検索キーワード: "${originalQuery}"
• 最適化後のキーワード: "${optimizedQuery}"
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

      // ✨ Phase 16: トップ2戦略でコンテキスト構築
      const { context: knowledgeContext, topResult, secondResult } = this._buildPrioritizedContext(knowledgeResults);

      // ✨ Phase 16: レッスン13専用のキーワードチェック（Phase 15aから継続）
      const lesson13Keywords = ['3H', 'HERO', 'HUB', 'HELP', '外向き', '内向き', 'デビュー配信', '高頻度', '長尺'];
      const lesson13Match = lesson13Keywords.filter(keyword => knowledgeContext.includes(keyword));
      
      if (lesson13Match.length >= 3) {
        logger.info(`✅ Phase 15a: レッスン13の重要キーワードがコンテキストに含まれています: ${lesson13Match.join(', ')}`);
      }

      // ✨ Phase 16: レッスン4専用のキーワードチェック（Phase 15bから継続）
      const lesson4Keywords = ['3分のズレ', '22時03分', '予約投稿', 'タイムラインの波'];
      const lesson4Match = lesson4Keywords.filter(keyword => knowledgeContext.includes(keyword));
      
      if (lesson4Match.length >= 2) {
        logger.info(`✅ Phase 15b: レッスン4の重要キーワードがコンテキストに含まれています: ${lesson4Match.join(', ')}`);
      }

      // ✨ Phase 16: レッスン8専用のキーワードチェック（個性、感動）
      const lesson8Keywords = ['個性', '感動', '企画の型', '共感'];
      const lesson8Match = lesson8Keywords.filter(keyword => knowledgeContext.includes(keyword));
      
      if (lesson8Match.length >= 2) {
        logger.info(`✅ Phase 16: レッスン8の重要キーワードがコンテキストに含まれています: ${lesson8Match.join(', ')}`);
      }

      // ✨ Phase 16: レッスン15専用のキーワードチェック（予約投稿の手順）
      const lesson15Keywords = ['予約投稿', 'やり方', '手順', '設定'];
      const lesson15Match = lesson15Keywords.filter(keyword => knowledgeContext.includes(keyword));
      
      if (lesson15Match.length >= 2) {
        logger.info(`✅ Phase 16: レッスン15の重要キーワードがコンテキストに含まれています: ${lesson15Match.join(', ')}`);
      }

      let imageContext = '';
      if (imageUrls.length > 0) {
        imageContext = `\n\n【添付画像】\nユーザーが${imageUrls.length}枚の画像を添付しています。\n`;
        logger.info('🖼️ 画像情報をシステムプロンプトに追加');
      }

      // ✨✨ Phase 16: Phase 15a+15bのプロンプト強化を完全維持 + トップ2戦略 ✨✨
      const systemPrompt = `あなたはVTuber育成スクール「わなみさん」の講師です。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 【絶対厳守ルール - Phase 16 トップ2戦略版】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【最重要指示】
以下の「検索結果（1位と2位）」に記載された情報**のみ**を使用して回答してください。

❌ 禁止事項（絶対に守ること）:
1. 一般知識や学習データの使用を**完全に禁止**
2. 検索結果にない情報を**絶対に追加しない**
3. 「一般的には」「通常は」などの一般論を**使用しない**
4. 抽象的な説明を**使用しない**
5. 検索結果の内容を勝手に要約・簡略化しない

✅ 必須事項（必ず守ること）:
1. 検索結果の**具体的な内容を使用**
2. 検索結果に書かれている**固有名詞・用語を使用**（例: 3H、HERO、HUB、HELP、外向き、内向き）
3. 検索結果の**具体例を引用**
4. 検索結果から取得できた内容を**読みやすくまとめて回答**
4. 検索結果にない情報が必要な場合は「検索結果には記載されていません」と明記
5. **1位と2位の両方の情報を統合して回答する**（Phase 16の重要ポイント）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 【Few-shot Examples - 正しい応答の学習】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

例1: レッスン13に関する質問
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

質問: 「誰に向けての配信か」を考えることは重要ですか？

検索結果: 「レッスン13では、誰に向けての配信かを把握することを教えます。配信には「外向きの配信」と「内向きの配信」があります。外向きの配信はまだあなたを知らない新規視聴者向けで、内向きの配信は既存のファン向けです。新人VTuberは特に外向きの配信をすべきです。また、3Hフレームワーク（HERO、HUB、HELP）を使って配信を分類します。HEROは話題性のあるコンテンツ（トレンド、突飛な企画、癒し系）、HUBはファンとの関係構築コンテンツ、HELPはHow to系コンテンツ（ライフハック、美容、健康、考察）です。」

✅ 良い回答（検索結果の具体的な内容を使用）:
はい、非常に重要です！✨

レッスン13では、「誰に向けての配信か」を把握することを教えています。

配信には大きく分けて2種類あります：

1. **外向きの配信** 📢
   - まだあなたを知らない新規視聴者向け
   - 新人VTuberは特にこちらをすべき

2. **内向きの配信** 💝
   - 既存のファン向け
   - ファンとの関係を深める配信

また、配信を分類する**3Hフレームワーク**という考え方があります：

🦸 **HERO（ヒーロー）**: 話題性のあるコンテンツ
   - トレンドに乗った企画
   - 突飛な企画
   - 癒し系コンテンツ

🤝 **HUB（ハブ）**: ファンとの関係構築コンテンツ
   - 雑談配信
   - ゲーム配信など

📖 **HELP（ヘルプ）**: How to系コンテンツ
   - ライフハック
   - 美容・健康
   - 考察系

このフレームワークを使うことで、戦略的に配信を企画できます！

📚 出典: [レッスン13]

❌ 悪い回答（一般知識を使用している）:
「配信のターゲットを明確にすることは重要です。視聴者のニーズを理解し、適切なコンテンツを提供することで、チャンネルの成長を促進できます。ターゲット層を明確にすることで、配信内容の方向性が定まり、効果的なマーケティングが可能になります。」

（❌ 理由: 「ターゲットの明確化」「視聴者のニーズ」「マーケティング」などの一般的な用語を使用し、検索結果の具体的な内容（外向き/内向き、3H、HERO/HUB/HELP）を使用していない）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

例2: レッスン4に関する質問
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

質問: 初ポストをする際の3分のズレはどういった理由がありますか？

検索結果: 「初ポストの投稿時間は、22時03分です！なぜ、22時03分なのかにも、ちゃんと理由があります！それは、Xが活発に使用される時間が、22時〜25時だからです！ただし、気になるのは、3分のズレですね！笑 これは、予約投稿をする人が22:00、23:00など、ぴったりの時間に投稿を予約する場合が多いので、せっかくの初ポストがタイムラインの波に飲まれないように、あえて3分のズレを作っているんです！他の投稿が、ある程度、投稿されきったタイミングで投稿するということです！」

✅ 良い回答（検索結果の具体的な内容を使用）:
初ポストの3分のズレには、しっかりとした理由があります！✨

**初ポストの投稿時間: 22時03分** 🕒

この3分のズレの理由は：

📌 **タイムラインの波に飲まれないため**

多くの人が予約投稿を使う際、22:00、23:00など、**ぴったりの時間**に投稿を予約する傾向があります。

そのため、ちょうど22:00になると、多くの投稿が一斉にタイムラインに流れてきます。

**あえて3分ズラすことで：**
- 他の投稿が、ある程度投稿されきったタイミングで投稿できる
- せっかくの初ポストが埋もれずに済む
- より多くの人の目に留まりやすくなる

つまり、戦略的な時間調整なんです！💡

ちなみに、Xが活発に使用される時間帯は**22時〜25時**です。

📚 出典: [レッスン4]

❌ 悪い回答（一般知識を使用している）:
「投稿時間をずらすのは、タイムラインの混雑を避けるためです。ピークタイムを少しずらすことで、投稿の視認性が向上します。」

（❌ 理由: 検索結果の具体的な説明（「予約投稿をする人が22:00、23:00など、ぴったりの時間に投稿を予約する場合が多い」「他の投稿が、ある程度、投稿されきったタイミング」）を使わず、一般的な回答をしている）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

例3: レッスン6+8に関する質問（Phase 16: トップ2戦略の例）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

質問: Xの企画をする時に個性を使って感動させるためにはどのような考え方をすれば良いですか？

検索結果（1位）: レッスン6「Xの企画には型があります。企画の基本的な型を理解することで、効果的なコンテンツを作ることができます。」
検索結果（2位）: レッスン8「Xの企画で個性を使って感動させるには、自分の強みを活かした企画の型を見つけることが重要です。個性とは、自分らしさを保ちながら視聴者の心を動かすことです。感動を生む要素には、ストーリー性、驚き、共感があります。」

✅ 良い回答（1位と2位の情報を統合）:
Xの企画で個性を使って感動させるには、以下の考え方が重要です！✨

1. **企画の型を理解する**（レッスン6）
   - Xの企画には基本的な型がある
   - 型を理解することで効果的なコンテンツが作れる

2. **個性を活かした型を見つける**（レッスン8）
   - 自分の強みを活かした企画の型を見つける
   - 個性とは、自分らしさを保ちながら視聴者の心を動かすこと

3. **感動を生む3つの要素**（レッスン8）
   - **ストーリー性**: 視聴者が共感できる物語
   - **驚き**: 予想を超える展開
   - **共感**: 視聴者の感情に寄り添う

企画の型を理解した上で、自分の個性を活かすことで、感動的なコンテンツを作ることができます！💡

📚 出典: [レッスン6, レッスン8]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🥇🥈 【検索上位2件の最重要資料】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🥇 **1位の資料**: ${topResult.source}
   🎯 検索スコア: ${(topResult.score * 100).toFixed(0)}% （第1位）
   📊 繰り返し回数: 5回
${topResult.metadata && topResult.metadata.category ? `   📂 カテゴリ: ${topResult.metadata.category}\n` : ''}${topResult.metadata && topResult.metadata.remarks ? `   🏷️ 備考: ${topResult.metadata.remarks}\n` : ''}
${secondResult ? `
🥈 **2位の資料**: ${secondResult.source}
   🎯 検索スコア: ${(secondResult.score * 100).toFixed(0)}% （第2位）
   📊 繰り返し回数: 3回
${secondResult.metadata && secondResult.metadata.category ? `   📂 カテゴリ: ${secondResult.metadata.category}\n` : ''}${secondResult.metadata && secondResult.metadata.remarks ? `   🏷️ 備考: ${secondResult.metadata.remarks}\n` : ''}` : ''}
⚠️ **Phase 16: 1位と2位の両方の具体的な内容を統合して使用してください！**

🚀 **Phase 16: トップ2戦略（1位5回 + 2位3回）**
📊 **コンテキスト総文字数: ${knowledgeContext.length.toLocaleString()}文字**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 【提供された資料（1位+2位）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${knowledgeContext}
${imageContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❓ 【ユーザーの質問】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${originalQuery}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 【回答手順 - Phase 16 トップ2戦略版】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ステップ1: 🥇 **1位「${topResult.source}」の全文を熟読する**
ステップ2: 🥈 **2位「${secondResult ? secondResult.source : 'なし'}」の全文を熟読する**${secondResult ? '' : '（2位なし）'}
ステップ3: **1位と2位の両方から具体的な用語・固有名詞を特定する**
          （例: 3H、HERO、個性、感動、企画の型など）
ステップ4: **1位と2位の具体例や具体的な説明を特定する**
ステップ5: **特定した用語・具体例を使って、1位と2位の情報を統合した回答を作成する**
ステップ6: **一般的な表現（「ターゲットの明確化」など）は使わない**
ステップ7: 絵文字を使って親しみやすく説明する
ステップ8: 最後に必ず「📚 出典: [${topResult.source}${secondResult ? `, ${secondResult.source}` : ''}]」を書く

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 【自己チェック項目 - 回答前に必ず確認】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

回答を作成したら、送信前に以下を確認してください：

□ 1位の資料に書かれている**具体的な用語**を使っているか？
□ 2位の資料に書かれている**具体的な用語**を使っているか？${secondResult ? '' : '（2位なし）'}
□ 1位と2位の**具体例や具体的な説明**を統合しているか？
□ 一般的な表現を使っていないか？
□ 「一般的には」「通常は」などの一般論を使っていないか？
□ 資料にない情報を追加していないか？

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 【今すぐ回答してください】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🥇🥈 **1位「${topResult.source}」と2位「${secondResult ? secondResult.source : 'なし'}」の具体的な内容を統合して**、
上記のFew-shot Examplesの「良い回答」のように回答してください。

**Phase 16: 1位を5回、2位を3回繰り返しているので、両方の情報を確実に参照できます。**

必ず「📚 出典: [${topResult.source}${secondResult ? `, ${secondResult.source}` : ''}]」を最後に書いてください。`;

      const imageMessages = imageUrls && imageUrls.length > 0
        ? imageUrls.map(imgUrl => ({
            url: typeof imgUrl === 'string' ? imgUrl : imgUrl.url,
            detail: "high"
          }))
        : [];

      logger.info(`🖼️ OpenAI APIに渡す画像メッセージ: ${imageMessages.length}件`);
      logger.info('🤖 AI応答生成中（v2.16.0 Phase 16: トップ2戦略）...');

      const aiResponse = await generateAIResponse(
        systemPrompt,
        originalQuery,
        imageMessages,
        { ...context, temperature: 0.1 }  // ✨ Phase 15a: Temperatureを0.1に調整
      );

      const check = this._checkIfResponseUsesKnowledgeBase(aiResponse, knowledgeResults);
      logger.info(`🔍 AI応答チェック: 知識ベース使用=${check.usesKnowledgeBase}, 一般知識使用=${check.usesGeneralKnowledge}`);

      // ✨ Phase 15a/16: レッスン13の具体的な用語が含まれているかチェック
      const lesson13KeywordsCheck = ['3H', 'HERO', 'HUB', 'HELP', '外向き', '内向き', 'ザイオンス効果', '茹でガエル'];
      const foundKeywords13 = lesson13KeywordsCheck.filter(kw => aiResponse.includes(kw));
      if (topResult.source.includes('レッスン13') && foundKeywords13.length > 0) {
        logger.info(`✅ Phase 15a: レッスン13の具体的な用語を検出 (${foundKeywords13.length}個): ${foundKeywords13.join(', ')}`);
      } else if (topResult.source.includes('レッスン13')) {
        logger.info(`⚠️ Phase 15a: レッスン13が1位だが、具体的な用語が検出されませんでした`);
      }

      // ✨ Phase 15b/16: レッスン4の具体的な用語が含まれているかチェック
      const lesson4KeywordsCheck = ['3分のズレ', '22時03分', '予約投稿', 'タイムラインの波'];
      const foundKeywords4 = lesson4KeywordsCheck.filter(kw => aiResponse.includes(kw));
      if (topResult.source.includes('レッスン4') && foundKeywords4.length > 0) {
        logger.info(`✅ Phase 15b: レッスン4の具体的な用語を検出 (${foundKeywords4.length}個): ${foundKeywords4.join(', ')}`);
      } else if (topResult.source.includes('レッスン4')) {
        logger.info(`⚠️ Phase 15b: レッスン4が1位だが、具体的な用語が検出されませんでした`);
      }

      logger.info('✅ 知識ベース強制限定モード: 応答生成完了（v2.16.0 Phase 16）');
      
      const sources = secondResult 
        ? `${topResult.source}, ${secondResult.source}`
        : topResult.source;
      const footer = `\n\n---\n📚 *知識ベースからの回答（Phase 16トップ2戦略: ${sources}）*`;
      
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
      version: '2.16.0'  // Phase 16: トップ2戦略（1位5回 + 2位3回）
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
