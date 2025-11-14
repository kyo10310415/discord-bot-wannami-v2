// services/openai-service.js - OpenAI サービス（詳細回答版 v2.7.0）
// Version: 2.7.0
// 更新日: 2025-11-13
// 変更内容: max_tokensのデフォルト値を増加、詳細回答に対応

const OpenAI = require('openai');
const { OPENAI_MODELS } = require('../config/constants');
const environment = require('../config/environment');

class OpenAIService {
  constructor() {
    this.client = null;
    this.isInitialized = false;
    // ✨ v2.7.0: デフォルトmax_tokensを増加
    this.defaultMaxTokens = 3000; // 旧: 2000 → 新: 3000
  }

  // OpenAI初期化
  initialize() {
    if (this.isInitialized) {
      return true;
    }

    try {
      if (!environment.OPENAI_API_KEY) {
        console.error('❌ OpenAI API Key not found');
        return false;
      }

      this.client = new OpenAI({ apiKey: environment.OPENAI_API_KEY });
      this.isInitialized = true;
      
      console.log('🤖 OpenAI初期化成功（詳細回答モード）');
      console.log(`📊 デフォルトmax_tokens: ${this.defaultMaxTokens}`);
      return true;
      
    } catch (error) {
      console.error('❌ OpenAI初期化失敗:', error.message);
      this.isInitialized = false;
      return false;
    }
  }

  // テキスト埋め込み生成
  async createEmbeddings(texts) {
    if (!this.isInitialized) {
      throw new Error('OpenAI service not initialized');
    }

    try {
      const response = await this.client.embeddings.create({
        model: OPENAI_MODELS.EMBEDDING,
        input: texts
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('❌ 埋め込み生成エラー:', error.message);
      throw error;
    }
  }

  // ✨ v2.7.0: チャット完了（テキストのみ）- デフォルトmax_tokens増加
  async createChatCompletion(messages, options = {}) {
    if (!this.isInitialized) {
      throw new Error('OpenAI service not initialized');
    }

    try {
      // ✨ max_tokensのデフォルト値を3000に変更
      const maxTokens = options.max_tokens || options.maxTokens || this.defaultMaxTokens;
      
      const response = await this.client.chat.completions.create({
        model: options.model || OPENAI_MODELS.TEXT,
        messages: messages,
        max_tokens: maxTokens,
        temperature: options.temperature || 0.7,
        ...options
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('❌ Chat completion エラー:', error.message);
      throw error;
    }
  }

  // ✨ v2.7.0: Visionモデル用チャット完了 - デフォルトmax_tokens増加
  async createVisionCompletion(messages, options = {}) {
    if (!this.isInitialized) {
      throw new Error('OpenAI service not initialized');
    }

    try {
      // ✨ max_tokensのデフォルト値を3000に変更
      const maxTokens = options.max_tokens || options.maxTokens || this.defaultMaxTokens;
      
      const response = await this.client.chat.completions.create({
        model: OPENAI_MODELS.VISION,
        messages: messages,
        max_tokens: maxTokens,
        temperature: options.temperature || 0.7,
        ...options
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('❌ Vision completion エラー:', error.message);
      throw error;
    }
  }

  // ✨ v2.7.0: AI応答生成（RAGシステム用）- オプションパラメータ対応強化
  async generateAIResponse(systemPrompt, userQuery, images = [], context = {}, extraOptions = {}) {
    if (!this.isInitialized) {
      // 初期化されていない場合は自動初期化を試みる
      this.initialize();
      if (!this.isInitialized) {
        throw new Error('OpenAI service not initialized and auto-initialization failed');
      }
    }

    try {
      // ✨ max_tokensの優先順位: extraOptions > context > デフォルト
      const maxTokens = extraOptions.maxTokens || 
                        extraOptions.max_tokens || 
                        context.maxTokens || 
                        context.max_tokens || 
                        this.defaultMaxTokens;
      
      const temperature = extraOptions.temperature || 
                          context.temperature || 
                          0.7;
      
      console.log(`📊 OpenAI API呼び出し設定:`);
      console.log(`  - max_tokens: ${maxTokens}`);
      console.log(`  - temperature: ${temperature}`);
      console.log(`  - 画像数: ${images && images.length ? images.length : 0}`);
      
      // 画像がある場合はVisionモデルを使用
      if (images && images.length > 0) {
        const visionMessage = this.buildVisionMessage(
          `${systemPrompt}\n\n【ユーザーの質問】\n${userQuery}`,
          images
        );

        const response = await this.createVisionCompletion([
          { role: "system", content: systemPrompt },
          visionMessage
        ], {
          max_tokens: maxTokens,
          temperature: temperature
        });

        console.log(`✅ Vision応答生成完了（文字数: ${response.length}）`);
        return response;
      }

      // テキストのみの場合
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userQuery }
      ];

      const response = await this.createChatCompletion(messages, {
        temperature: temperature,
        max_tokens: maxTokens
      });

      console.log(`✅ テキスト応答生成完了（文字数: ${response.length}）`);
      return response;

    } catch (error) {
      console.error('❌ AI応答生成エラー:', error.message);
      throw error;
    }
  }

  // 画像分析メッセージ構築
  buildVisionMessage(textContent, imageUrls) {
    const content = [
      {
        type: "text",
        text: textContent
      }
    ];

    // 画像URLを追加
    imageUrls.forEach(imageInfo => {
      content.push({
        type: "image_url",
        image_url: {
          url: typeof imageInfo === 'string' ? imageInfo : imageInfo.url,
          detail: imageInfo.detail || "high"
        }
      });
    });

    return { role: "user", content };
  }

  // トークン数概算（粗い計算）
  estimateTokens(text) {
    // 日本語の場合: 1トークン ≈ 0.5～1文字
    // 英語の場合: 1トークン ≈ 4文字
    // 保守的に1文字=1トークンとして計算
    return Math.ceil(text.length);
  }

  // ✨ v2.7.0: max_tokens設定変更メソッド
  setDefaultMaxTokens(tokens) {
    if (tokens < 100 || tokens > 4096) {
      console.warn(`⚠️ max_tokensは100～4096の範囲で設定してください（指定値: ${tokens}）`);
      return false;
    }
    
    this.defaultMaxTokens = tokens;
    console.log(`✅ デフォルトmax_tokensを${tokens}に変更しました`);
    return true;
  }

  // 初期化状態確認
  getStatus() {
    return {
      initialized: this.isInitialized,
      client_ready: !!this.client,
      api_key_set: !!environment.OPENAI_API_KEY,
      default_max_tokens: this.defaultMaxTokens,
      version: '2.7.0'
    };
  }
}

// シングルトンインスタンス作成
const openAIService = new OpenAIService();

// エクスポート（rag-system.js互換性のため）
module.exports = {
  openAIService,
  // generateAIResponse関数をエクスポート（✨ 第5引数追加）
  generateAIResponse: (systemPrompt, userQuery, images, context, extraOptions) => 
    openAIService.generateAIResponse(systemPrompt, userQuery, images, context, extraOptions),
  // 後方互換性のため
  default: openAIService
};
