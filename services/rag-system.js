// services/rag-system.js - RAG（Retrieval-Augmented Generation）システム

const logger = require('../utils/logger');
const { searchKnowledge } = require('./knowledge-base');
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

  // RAG応答生成
  async generateRAGResponse(userQuery, images = [], context = {}) {
    try {
      logger.ai('RAG応答生成開始');

      // 1. 知識ベース検索
      const knowledgeResults = searchKnowledge(userQuery, {
        maxResults: 5,
        minScore: 0.1
      });

      logger.ai(`知識ベース検索結果: ${knowledgeResults.length}件`);

      // 2. コンテキスト構築
      const ragPrompt = this.buildRAGPrompt(userQuery, knowledgeResults, context);

      // 3. AI応答生成
      const response = await generateAIResponse(ragPrompt, images, context);

      logger.info('✅ RAG応答生成完了');
      return response;

    } catch (error) {
      logger.errorDetail('RAG応答生成エラー:', error);
      // フォールバック: 知識ベースなしでAI応答
      return await generateAIResponse(userQuery, images, context);
    }
  }

  // RAG用プロンプト構築
  buildRAGPrompt(userQuery, knowledgeResults, context = {}) {
    let prompt = `あなたはVTuber育成スクールの専門アシスタント「わなみさん」です。

【基本設定】
• VTuber活動に関する専門知識を持っています
• 優しく丁寧な口調で回答します
• 提供された知識ベースを活用して正確な情報を提供します
• 知識ベースにない情報については、一般的な知識で補完します
• 日本語で回答します`;

    // 知識ベース情報の追加
    if (knowledgeResults.length > 0) {
      prompt += `\n\n【関連する知識ベース情報】`;
      
      knowledgeResults.forEach((result, index) => {
        prompt += `\n\n**参考情報 ${index + 1}** (関連度: ${(result.score * 100).toFixed(1)}%)`;
        prompt += `\n質問: ${result.question}`;
        prompt += `\n回答: ${result.answer}`;
        
        if (result.extended) {
          prompt += `\n追加情報: ${result.extended}`;
        }
      });
      
      prompt += `\n\n**※ 上記の知識ベース情報を参考にして、ユーザーの質問に適切に回答してください**`;
    } else {
      prompt += `\n\n【知識ベース検索結果】\n関連する情報が見つかりませんでした。一般的な知識で回答します。`;
    }

    // ユーザー情報
    if (context.username || context.channelName) {
      prompt += `\n\n【ユーザー情報】`;
      if (context.username) prompt += `\n• ユーザー名: ${context.username}`;
      if (context.channelName) prompt += `\n• チャンネル: ${context.channelName}`;
      if (context.guildName) prompt += `\n• サーバー: ${context.guildName}`;
    }

    // 質問内容
    prompt += `\n\n【ユーザーの質問】\n${userQuery}`;

    // 画像解析指示
    if (context.hasImages) {
      prompt += `\n\n【画像解析指示】
• 添付された画像を詳しく分析してください
• 技術的な問題があれば具体的に指摘してください
• 知識ベースの情報と組み合わせて改善点を提案してください`;
    }

    prompt += `\n\n【回答指示】
• 知識ベースの情報を最優先で活用してください
• 分からない場合は「分からない」と正直に答えてください
• 具体的で実用的なアドバイスを心がけてください
• 必要に応じて段階的な説明を行ってください`;

    return this.truncatePromptIfNeeded(prompt);
  }

  // プロンプト長制限
  truncatePromptIfNeeded(prompt) {
    // 簡易的なトークン数推定（1トークン≈4文字として計算）
    const estimatedTokens = Math.ceil(prompt.length / 4);
    
    if (estimatedTokens <= this.maxContextTokens) {
      return prompt;
    }

    logger.warn(`プロンプトが長すぎます (推定${estimatedTokens}トークン), 切り詰めます`);
    
    // 知識ベース部分を短縮
    const maxLength = this.maxContextTokens * 4 * 0.8; // 安全マージン
    const truncatedPrompt = prompt.substring(0, maxLength) + '\n\n...（長いコンテンツのため一部省略）';
    
    return truncatedPrompt;
  }

  // 知識ベース限定応答
  async generateKnowledgeOnlyResponse(userQuery, context = {}) {
    try {
      logger.ai('知識ベース限定応答生成開始');

      const knowledgeResults = searchKnowledge(userQuery, {
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

  // システム状態取得
  getStatus() {
    return {
      initialized: this.initialized,
      maxContextTokens: this.maxContextTokens
    };
  }
}

// シングルトンインスタンス
const ragSystem = new RAGSystem();

module.exports = {
  ragSystem,
  generateRAGResponse: (userQuery, images, context) => 
    ragSystem.generateRAGResponse(userQuery, images, context),
  generateKnowledgeOnlyResponse: (userQuery, context) =>
    ragSystem.generateKnowledgeOnlyResponse(userQuery, context),
  initializeRAG: () => ragSystem.initialize()
};
