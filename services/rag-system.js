// services/rag-system.js - RAG（Retrieval-Augmented Generation）システム

const logger = require('../utils/logger');
const knowledgeBase = require('./knowledge-base');
const { generateAIResponse } = require('./openai-service');
const { LIMITS } = require('../utils/constants');

class RAGSystem {
  constructor() {
    this.initialized = false;
    this.maxContextTokens = LIMITS.MAX_CONTEXT_LENGTH || 25000;
  }

  // RAGシステム初期化
  async initialize() {
    try {
      this.initialized = true;
      logger.info('✅ RAGシステム初期化完了');
    } catch (error) {
      logger.errorDetail('RAGシステム初期化エラー:', error);
      throw error;
    }
  }

  // 知識ベース検索のヘルパーメソッド（3段階フォールバック）
  _searchKnowledge(query, options) {
    try {
      // 方法1: knowledgeBaseServiceプロパティ経由
      if (knowledgeBase.knowledgeBaseService && typeof knowledgeBase.knowledgeBaseService.searchKnowledge === 'function') {
        logger.info('📚 検索方法: knowledgeBaseService経由');
        return knowledgeBase.knowledgeBaseService.searchKnowledge(query, options);
      }
      // 方法2: 直接エクスポートされた関数
      else if (typeof knowledgeBase.searchKnowledge === 'function') {
        logger.info('📚 検索方法: 直接関数呼び出し');
        return knowledgeBase.searchKnowledge(query, options);
      }
      // 方法3: エラー詳細をログ出力
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

  // RAG応答生成
  async generateRAGResponse(userQuery, images = [], context = {}) {
    try {
      logger.ai('RAG応答生成開始');

      // 1. 知識ベース検索（修正版）
      const knowledgeResults = this._searchKnowledge(userQuery, {
        maxResults: 5,
        minScore: 0.1
      });

      logger.info(`知識ベース検索結果: ${knowledgeResults.length}件`);

      // 2. コンテキスト構築
      let knowledgeContext = '';
      if (knowledgeResults.length > 0) {
        knowledgeContext = '【知識ベースからの関連情報】\n\n';
        knowledgeResults.forEach((result, index) => {
          knowledgeContext += `${index + 1}. ${result.title}\n`;
          knowledgeContext += `${result.content}\n`;
          knowledgeContext += `(関連度: ${(result.score * 100).toFixed(1)}%)\n\n`;
        });
      }

      // 3. システムプロンプト作成
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

【知識ベース情報】
${knowledgeContext || '関連する知識ベース情報が見つかりませんでした。'}

上記の知識ベース情報を参考に、ユーザーの質問に答えてください。`;

      // 4. AI応答生成
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

  // 画像解析統合RAG応答
  async generateRAGResponseWithVision(userQuery, imageUrls = [], context = {}) {
    try {
      logger.ai('画像解析統合RAG応答生成開始');

      // 知識ベース検索（修正版）
      const knowledgeResults = this._searchKnowledge(userQuery, {
        maxResults: 3,
        minScore: 0.15
      });

      // 画像コンテキスト追加
      let visionContext = '';
      if (imageUrls.length > 0) {
        visionContext = `\n【添付画像】\nユーザーが${imageUrls.length}枚の画像を添付しています。画像の内容を確認して、適切なアドバイスを提供してください。`;
      }

      // コンテキスト構築
      let knowledgeContext = '';
      if (knowledgeResults.length > 0) {
        knowledgeContext = '【知識ベース情報】\n';
        knowledgeResults.forEach(result => {
          knowledgeContext += `- ${result.title}: ${result.content}\n`;
        });
      }

      const systemPrompt = `あなたは「わなみさん」というVTuber育成スクールのアシスタントです。

${knowledgeContext}
${visionContext}

ユーザーの質問と添付画像を確認して、適切なアドバイスを提供してください。`;

      const response = await generateAIResponse(
        systemPrompt,
        userQuery,
        imageUrls.map(url => ({ url })),
        context
      );

      logger.success('画像解析統合RAG応答生成完了');
      return response;

    } catch (error) {
      logger.errorDetail('画像解析統合RAG応答エラー:', error);
      throw error;
    }
  }

  // 知識ベース限定応答
  async generateKnowledgeOnlyResponse(userQuery, context = {}) {
    try {
      logger.ai('知識ベース限定応答生成開始');

      // 知識ベース検索（修正版）
      const knowledgeResults = this._searchKnowledge(userQuery, {
        maxResults: 3,
        minScore: 0.2 // より高い関連度を要求
      });

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

📞 **より詳しいサポートが必要な場合:**
\`/soudan\` で相談メニューを表示し、専門サポートをご利用ください✨`;
      }

      // 知識ベースの回答を組み合わせて返答
      let response = `🤖 **わなみさんです！**\n\n`;
      response += `「**${userQuery}**」について、知識ベースからお答えします！\n\n`;
      
      knowledgeResults.forEach((result, index) => {
        if (index === 0) {
          response += `📚 **主な回答:**\n${result.answer}\n\n`;
        } else {
          response += `🔗 **関連情報:**\n${result.answer}\n\n`;
        }
      });

      response += `---\n🎯 *知識ベースからの回答 (関連度: ${(knowledgeResults[0].score * 100).toFixed(0)}%) - 更新済みデータ*\n\n`;
      response += `📞 **さらに詳しいサポートが必要な場合:** \`/soudan\` で専門相談をご利用ください✨`;

      logger.info('✅ 知識ベース限定応答生成完了');
      return response;

    } catch (error) {
      logger.errorDetail('知識ベース限定応答エラー:', error);
      return '申し訳ございません。現在知識ベースにアクセスできません。しばらく待ってから再度お試しください。';
    }
  }

  // ステータス取得
  getStatus() {
    return {
      initialized: this.initialized,
      maxContextTokens: this.maxContextTokens,
      service: 'RAG System',
      version: '2.0.0'
    };
  }
}

// シングルトンインスタンス
const ragSystem = new RAGSystem();

// 初期化関数
async function initializeRAG() {
  await ragSystem.initialize();
}

// generateKnowledgeOnlyResponse関数をエクスポート
async function generateKnowledgeOnlyResponse(userQuery, context = {}) {
  return await ragSystem.generateKnowledgeOnlyResponse(userQuery, context);
}

module.exports = {
  ragSystem,
  initializeRAG,
  generateKnowledgeOnlyResponse
};
