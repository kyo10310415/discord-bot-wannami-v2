// handlers/button-handler.js - ボタン処理

const { AI_TARGET_BUTTONS, N8N_WEBHOOK_URL } = require('../config/constants');
const { createSuccessResponse, createErrorResponse } = require('../utils/verification');
const promptTemplates = require('../ai/prompt-templates');
const axios = require('axios');

class ButtonHandler {
  constructor() {
    this.buttonClickCount = 0;
  }

  // メインボタン処理
  async handleButton(context) {
    try {
      this.buttonClickCount++;
      const { buttonId, user, channel, guild, originalBody } = context;

      console.log(`🔘 ボタン処理開始: ${buttonId} (クリック数: ${this.buttonClickCount})`);

      // AI対象ボタンかチェック
      if (AI_TARGET_BUTTONS[buttonId]) {
        return await this.handleAIButton(buttonId, context);
      } else {
        return await this.handleStaticButton(buttonId, context);
      }

    } catch (error) {
      console.error('❌ ボタン処理エラー:', error);
      return createErrorResponse('ボタン処理中にエラーが発生しました');
    }
  }

  // AI対象ボタン処理
  async handleAIButton(buttonId, context) {
    console.log(`🤖 AI対象ボタン処理: ${buttonId}`);

    try {
      // n8nにWebhook送信
      await this.sendToN8N({
        button_id: buttonId,
        user_id: context.user?.id,
        username: context.user?.username,
        guild_id: context.guild?.id,
        channel_id: context.channel?.id,
        timestamp: new Date().toISOString(),
        ai_request: true,
        phase: '1.5_prompt_only',
        knowledge_base_ready: true
      });

      // 質問入力プロンプトを取得
      const promptData = promptTemplates.getQuestionPrompt(buttonId);
      
      if (!promptData) {
        throw new Error(`未知のAIボタン: ${buttonId}`);
      }

      return createSuccessResponse(`✨ **${promptData.title}** ✨\n\n${promptData.content}`);

    } catch (error) {
      console.error(`❌ AI対象ボタン処理エラー (${buttonId}):`, error);
      return createErrorResponse('AI処理の準備中にエラーが発生しました');
    }
  }

  // 静的ボタン処理
  async handleStaticButton(buttonId, context) {
    console.log(`📝 静的ボタン処理: ${buttonId}`);

    switch (buttonId) {
      case 'payment_consultation':
        return createSuccessResponse(
          "申し訳ございません。お支払いに関してはここでは相談できません。\n💡 **管理者の方へ**：ここに適切な担当者のメンションを設定してください。\n\n例：<@USER_ID>にご相談ください。"
        );

      case 'private_consultation':
        return createSuccessResponse(
          "申し訳ございません。プライベートなご相談については\nここでは回答できません。\n\n🎓 **担任の先生に直接ご相談ください。**"
        );

      default:
        console.log(`❓ 未知の静的ボタン: ${buttonId}`);
        return createErrorResponse(
          "❌ 申し訳ございません。認識できない選択肢です。\n再度メニューから選択してください。"
        );
    }
  }

  // n8nにWebhook送信
  async sendToN8N(payload) {
    try {
      console.log('🚀 n8nにボタンデータ送信中:', payload);
      
      const response = await axios.post(N8N_WEBHOOK_URL, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ n8nボタンデータ送信成功:', response.status);
    } catch (error) {
      console.error('❌ n8nボタンデータ送信エラー:', error.message);
      // エラーが発生してもボタン処理は継続
    }
  }

  // ボタン処理統計
  getStats() {
    return {
      totalButtonClicks: this.buttonClickCount,
      aiButtonIds: Object.keys(AI_TARGET_BUTTONS).filter(key => AI_TARGET_BUTTONS[key]),
      staticButtonIds: ['payment_consultation', 'private_consultation']
    };
  }
}

module.exports = new ButtonHandler();
