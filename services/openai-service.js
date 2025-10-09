// services/openai-service.js - OpenAI サービス（修正版）

const OpenAI = require('openai');
const { OPENAI_MODELS } = require('../config/constants');
const environment = require('../config/environment');

class OpenAIService {
  constructor() {
    this.client = null;
    this.isInitialized = false;
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
      
      console.log('🤖 OpenAI初期化成功');
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

  // チャット完了（テキストのみ）
  async createChatCompletion(messages, options = {}) {
    if (!this.isInitialized) {
      throw new Error('OpenAI service not initialized');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: options.model || OPENAI_MODELS.TEXT,
        messages: messages,
        max_tokens: options.max_tokens || 2000, // 🔧 修正: maxTokens → max_tokens
        temperature: options.temperature || 0.7,
        ...options
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('❌ Chat completion エラー:', error.message);
      throw error;
    }
  }

  // Visionモデル用チャット完了
  async createVisionCompletion(messages, options = {}) {
    if (!this.isInitialized) {
      throw new Error('OpenAI service not initialized');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: OPENAI_MODELS.VISION,
        messages: messages,
        max_tokens: options.max_tokens || 2000, // 🔧 修正: maxTokens → max_tokens
        temperature: options.temperature || 0.7,
        ...options
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('❌ Vision completion エラー:', error.message);
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
    // 1トークン ≈ 4文字の概算
    return Math.ceil(text.length / 4);
  }

  // 初期化状態確認
  getStatus() {
    return {
      initialized: this.isInitialized,
      client_ready: !!this.client,
      api_key_set: !!environment.OPENAI_API_KEY
    };
  }
}

module.exports = new OpenAIService();
