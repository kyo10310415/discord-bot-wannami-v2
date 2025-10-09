// handlers/mention-handler.js - メンション処理

const { BOT_USER_ID, N8N_WEBHOOK_URL } = require('../config/constants');
const { extractContentFromMention, createSuccessResponse } = require('../utils/verification');
const axios = require('axios');

class MentionHandler {
  constructor() {
    this.mentionCount = 0;
  }

  // メインメンション処理
  async handleMention(context) {
    try {
      this.mentionCount++;
      const { content, user, channel, guild, imageUrls, originalBody } = context;

      console.log(`🏷️ メンション処理開始 #${this.mentionCount}`);
      console.log(`📝 ユーザー: ${user?.username}`);

      // メンション部分を除去して質問内容を抽出
      const questionContent = extractContentFromMention(content, BOT_USER_ID);
      const hasImages = imageUrls && imageUrls.length > 0;

      console.log(`💬 質問内容: "${questionContent}"`);
      console.log(`🖼️ 画像添付: ${hasImages ? `${imageUrls.length}個` : 'なし'}`);

      // 質問内容も画像もない場合は選択肢メニューを表示
      if ((!questionContent || questionContent.length < 3) && !hasImages) {
        console.log('📋 選択肢メニュー表示');
        return this.createMentionMenu(user?.id);
      } else {
        // 質問内容または画像がある場合はAI処理
        console.log('🤖 AI処理リクエスト送信');
        return await this.handleMentionAIRequest(questionContent, user, channel, guild, imageUrls);
      }

    } catch (error) {
      console.error('❌ メンション処理エラー:', error);
      return createSuccessResponse(
        `申し訳ございません！メンション処理中にエラーが発生しました🙏\n\nエラー詳細: ${error.message}\n\n担任の先生にご相談ください。`
      );
    }
  }

  // メンション選択肢メニュー作成
  createMentionMenu(userId) {
    return createSuccessResponse(
      `こんにちは <@${userId}>さん！\nどのようなご相談でしょうか？以下から選択してください：`,
      [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: "お支払いに関する相談",
              custom_id: "payment_consultation"
            },
            {
              type: 2,
              style: 2,
              label: "プライベートなご相談",
              custom_id: "private_consultation"
            },
            {
              type: 2,
              style: 3,
              label: "レッスンについての質問",
              custom_id: "lesson_question"
            }
          ]
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: "SNS運用相談",
              custom_id: "sns_consultation"
            },
            {
              type: 2,
              style: 1,
              label: "ミッションの提出",
              custom_id: "mission_submission"
            }
          ]
        }
      ]
    );
  }

  // メンションAI処理リクエスト
  async handleMentionAIRequest(questionContent, user, channel, guild, imageUrls) {
    try {
      // n8nにメンションAI処理を送信
      await this.sendMentionToN8N({
        button_id: 'mention_direct',
        user_id: user?.id,
        username: user?.username,
        guild_id: guild?.id,
        channel_id: channel?.id,
        timestamp: new Date().toISOString(),
        ai_request: true,
        phase: 'mention_direct',
        question_text: questionContent,
        knowledge_base_ready: true,
        trigger_type: 'mention',
        has_images: imageUrls.length > 0,
        image_count: imageUrls.length,
        attachment_images: imageUrls
      });

      // 受付確認メッセージを作成
      return this.createMentionConfirmation(questionContent, imageUrls);

    } catch (error) {
      console.error('❌ メンションAI処理リクエストエラー:', error);
      return createSuccessResponse(
        `申し訳ございません！AI処理の準備中にエラーが発生しました🙏\n\n担任の先生に直接ご相談ください。`
      );
    }
  }

  // メンション受付確認メッセージ作成
  createMentionConfirmation(questionContent, imageUrls) {
    let confirmationMessage = `📝 **ご質問ありがとうございます！**\n\n`;
    
    if (questionContent) {
      confirmationMessage += `「${questionContent}」\n\n`;
    }
    
    if (imageUrls && imageUrls.length > 0) {
      confirmationMessage += `🖼️ **画像 ${imageUrls.length}枚を確認しました**\n\n`;
    }
    
    confirmationMessage += `知識ベース（Google Slides、Docs、Notion、WEBサイト含む）を確認して回答を準備中です。少々お待ちください... 🤖✨`;
    
    return createSuccessResponse(confirmationMessage);
  }

  // n8nにメンションデータ送信
  async sendMentionToN8N(payload) {
    try {
      console.log('🚀 n8nにメンションデータ送信中:', payload);
      
      const response = await axios.post(N8N_WEBHOOK_URL, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ n8nメンションデータ送信成功:', response.status);
    } catch (error) {
      console.error('❌ n8nメンションデータ送信エラー:', error.message);
      // エラーが発生してもメンション処理は継続
    }
  }

  // メンション処理統計
  getStats() {
    return {
      totalMentions: this.mentionCount,
      botUserId: BOT_USER_ID
    };
  }
}

module.exports = new MentionHandler();
