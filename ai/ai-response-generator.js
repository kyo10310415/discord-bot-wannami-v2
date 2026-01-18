// ai/ai-response-generator.js - AI回答生成（修正版）

const openaiService = require('../services/openai-service');
const ragSystem = require('../services/rag-system');
const promptTemplates = require('./prompt-templates');
const { filterAndLimitImages } = require('../utils/image-utils');

class AIResponseGenerator {
  constructor() {
    this.responseCount = 0;
  }

  // メインAI回答生成（RAG対応）
  async generateResponse(question, options = {}) {
    try {
      this.responseCount++;
      const {
        buttonType = null,
        userInfo = {},
        imageUrls = [],
        useRAG = true,
        maxImages = 5
      } = options;

      console.log(`🤖 AI回答生成開始 #${this.responseCount}: ${buttonType || 'mention'}`);
      console.log(`📝 ユーザー: ${userInfo.username || 'unknown'}`);
      console.log(`💬 質問: ${question}`);
      console.log(`🖼️ 画像数: ${imageUrls.length}`);

      // RAGを使用する場合
      if (useRAG) {
        return await this.generateRAGResponse(question, buttonType, userInfo, imageUrls, maxImages);
      } else {
        // 従来の方式（RAG無し）
        return await this.generateTraditionalResponse(question, buttonType, userInfo, imageUrls, maxImages);
      }

    } catch (error) {
      console.error('❌ AI回答生成エラー:', error);
      return {
        response: promptTemplates.getErrorResponse('ai_processing', error.message),
        metadata: { error: error.message, responseGenerated: false }
      };
    }
  }

  // RAG対応AI回答生成
  async generateRAGResponse(question, buttonType, userInfo, imageUrls, maxImages) {
    try {
      // 1. RAGシステムが初期化されているかチェック
      if (!ragSystem.isInitialized) {
        throw new Error('RAGシステムが初期化されていません');
      }

      // 2. 関連チャンクを検索
      const relevantChunks = await ragSystem.searchRelevantChunks(question);
      
      if (relevantChunks.length === 0) {
        return {
          response: promptTemplates.getErrorResponse('no_relevant_content'),
          metadata: { ragUsed: true, chunksUsed: 0, responseGenerated: true }
        };
      }

      // 3. RAG回答構築
      const ragResult = await ragSystem.generateAnswer(question, relevantChunks, { maxImages });

      // 4. システムプロンプト構築
      let systemPrompt = promptTemplates.buildSystemPrompt(ragResult.context, buttonType);

      // 5. 画像がある場合は画像分析指示を追加
      const filteredImages = filterAndLimitImages(imageUrls, maxImages);
      const allImages = [...filteredImages, ...ragResult.selectedImages];
      
      if (allImages.length > 0) {
        systemPrompt = promptTemplates.addImageAnalysisInstructions(systemPrompt);
      }

      // 6. AI回答生成
      const aiResponse = await this.callOpenAI(systemPrompt, question, allImages);

      return {
        response: aiResponse,
        metadata: {
          ragUsed: true,
          chunksUsed: ragResult.metadata.chunksUsed,
          imagesUsed: allImages.length,
          userImagesUsed: filteredImages.length,
          documentImagesUsed: ragResult.metadata.imagesUsed,
          contextLength: ragResult.metadata.totalContextLength,
          averageSimilarity: ragResult.metadata.averageSimilarity,
          responseGenerated: true
        }
      };

    } catch (error) {
      console.error('❌ RAG回答生成エラー:', error);
      throw error;
    }
  }

  // 従来の方式（RAG無し）
  async generateTraditionalResponse(question, buttonType, userInfo, imageUrls, maxImages) {
    try {
      // 簡易システムプロンプト（知識ベース無し）
      const systemPrompt = `あなたはVTuber育成スクール「わなみさん」のAIアシスタントです。
一般的な知識とVTuber活動に関する基本的なアドバイスを提供してください。

専門的な内容や詳細な情報については「担任の先生にご相談ください」と案内してください。

丁寧で親しみやすい口調で、500文字以内で回答してください。`;

      const filteredImages = filterAndLimitImages(imageUrls, maxImages);
      const aiResponse = await this.callOpenAI(systemPrompt, question, filteredImages);

      return {
        response: aiResponse,
        metadata: {
          ragUsed: false,
          imagesUsed: filteredImages.length,
          responseGenerated: true,
          fallbackMode: true
        }
      };

    } catch (error) {
      console.error('❌ 従来方式回答生成エラー:', error);
      throw error;
    }
  }

  // OpenAI API呼び出し
  async callOpenAI(systemPrompt, question, imageUrls = []) {
    const messages = [{ role: "system", content: systemPrompt }];

    // 画像がある場合はVisionモデルを使用
    if (imageUrls && imageUrls.length > 0) {
      const userMessage = openaiService.buildVisionMessage(
        question || "この画像について教えてください",
        imageUrls
      );
      messages.push(userMessage);

      return await openaiService.createVisionCompletion(messages, {
        max_tokens: 2000, // 🔧 修正: maxTokens → max_tokens
        temperature: 0.7
      });
    } else {
      // テキストのみの場合
      messages.push({ role: "user", content: question });
      
      return await openaiService.createChatCompletion(messages, {
        max_tokens: 1500, // 🔧 修正: maxTokens → max_tokens
        temperature: 0.7
      });
    }
  }

  // バッチ処理（複数質問の同時処理）
  async generateBatchResponses(requests) {
    const results = [];
    
    for (const request of requests) {
      try {
        const result = await this.generateResponse(request.question, request.options);
        results.push({
          id: request.id,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          id: request.id,
          success: false,
          error: error.message,
          response: promptTemplates.getErrorResponse('ai_processing', error.message)
        });
      }
    }
    
    return results;
  }

  // 統計情報
  getStats() {
    return {
      totalResponses: this.responseCount,
      ragSystemStats: ragSystem.getStats(),
      openaiServiceStats: openaiService.getStatus()
    };
  }

  // 応答品質の分析（デバッグ用）
  analyzeResponse(response, metadata) {
    return {
      responseLength: response.length,
      hasEmojis: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(response),
      mentionsTeacher: response.includes('担任の先生'),
      ragEfficiency: metadata.ragUsed ? {
        chunksUsed: metadata.chunksUsed,
        averageSimilarity: metadata.averageSimilarity,
        contextEfficiency: metadata.contextLength / (metadata.contextLength + response.length)
      } : null
    };
  }
}

module.exports = new AIResponseGenerator();
