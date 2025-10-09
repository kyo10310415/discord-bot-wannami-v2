// handlers/discord-handler.js - Discord Webhook処理

const { DISCORD_PUBLIC_KEY, BOT_USER_ID } = require('../config/constants');
const { 
  validateDiscordRequest, 
  parseDiscordBody, 
  getInteractionType,
  extractInteractionInfo,
  createDiscordResponse,
  createErrorResponse,
  createSuccessResponse,
  isBotMentioned,
  extractContentFromMention
} = require('../utils/verification');
const { hasImageAttachments, extractImageUrls } = require('../utils/image-utils');
const buttonHandler = require('./button-handler');
const mentionHandler = require('./mention-handler');

class DiscordHandler {
  constructor() {
    this.interactionCount = 0;
  }

  // メインDiscord Webhook処理
  async handleWebhook(req, res) {
    try {
      this.interactionCount++;
      console.log(`=== Discord Interaction #${this.interactionCount} 受信 ===`);
      console.log('Time:', new Date().toISOString());
      
      const signature = req.headers['x-signature-ed25519'];
      const timestamp = req.headers['x-signature-timestamp'];
      
      // 署名検証
      if (!validateDiscordRequest(signature, timestamp, req.body, DISCORD_PUBLIC_KEY)) {
        console.log('❌ 署名検証失敗');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // JSONパース
      let body;
      try {
        body = parseDiscordBody(req.body);
      } catch (error) {
        console.log('❌ JSONパースエラー');
        return res.status(400).json({ error: 'Invalid JSON' });
      }

      // インタラクション情報抽出
      const interactionInfo = extractInteractionInfo(body);
      console.log('Type:', interactionInfo.type);
      console.log('User:', interactionInfo.user?.username);
      console.log('Channel:', interactionInfo.channel?.id);

      // インタラクションタイプ別処理
      const response = await this.routeInteraction(body, interactionInfo);
      
      if (response) {
        console.log('✅ Discord応答送信');
        return res.json(response);
      } else {
        console.log('⚠️ 応答なし');
        return res.status(200).json({ message: 'No response' });
      }

    } catch (error) {
      console.error('❌ Discord Webhook処理エラー:', error);
      const errorResponse = createErrorResponse('内部エラーが発生しました');
      return res.status(500).json(errorResponse);
    }
  }

  // インタラクションタイプ別ルーティング
  async routeInteraction(body, interactionInfo) {
    switch (interactionInfo.type) {
      case 'PING':
        console.log('🏓 PING認証');
        return { type: 1 };

      case 'MESSAGE':
        return await this.handleMessage(body, interactionInfo);

      case 'APPLICATION_COMMAND':
        return await this.handleSlashCommand(body, interactionInfo);

      case 'MESSAGE_COMPONENT':
        return await this.handleButton(body, interactionInfo);

      default:
        console.log('❓ 未対応のInteractionタイプ:', interactionInfo.type);
        return null;
    }
  }

  // メッセージ処理（メンション検出）
  async handleMessage(body, interactionInfo) {
    console.log('💬 メッセージ受信 - メンション確認中...');
    
    const messageInfo = interactionInfo.message;
    if (!messageInfo) {
      console.log('📝 メッセージ情報なし');
      return null;
    }

    const content = messageInfo.content;
    const mentions = messageInfo.mentions || [];
    const attachments = messageInfo.attachments || [];

    // 画像添付チェック
    const hasImages = hasImageAttachments(attachments);
    const imageUrls = hasImages ? extractImageUrls(attachments) : [];

    if (hasImages) {
      console.log(`🖼️ 画像添付検出: ${imageUrls.length}個`);
    }

    // メンション検出
    if (isBotMentioned(content, mentions, BOT_USER_ID)) {
      console.log('🏷️ @わなみさん メンション検出！');
      
      return await mentionHandler.handleMention({
        content: content,
        user: interactionInfo.user,
        channel: interactionInfo.channel,
        guild: interactionInfo.guild,
        imageUrls: imageUrls,
        originalBody: body
      });
    } else {
      console.log('📝 通常メッセージ（メンションなし）- 処理スキップ');
      return null;
    }
  }

  // スラッシュコマンド処理
  async handleSlashCommand(body, interactionInfo) {
    const commandName = body.data?.name;
    console.log(`⚡ スラッシュコマンド: /${commandName}`);

    switch (commandName) {
      case 'soudan':
        return await this.handleSoudanCommand(body, interactionInfo);
      
      default:
        console.log(`❓ 未知のコマンド: /${commandName}`);
        return createErrorResponse(`未知のコマンド: /${commandName}`);
    }
  }

  // /soudan コマンド処理
  async handleSoudanCommand(body, interactionInfo) {
    console.log('⚡ /soudan コマンド処理');

    const userId = interactionInfo.user?.id;
    const menuResponse = this.createConsultationMenu(userId);

    return createSuccessResponse(menuResponse.content, menuResponse.components);
  }

  // ボタン処理
  async handleButton(body, interactionInfo) {
    const buttonId = body.data?.custom_id;
    console.log(`🔘 ボタンクリック: ${buttonId}`);

    return await buttonHandler.handleButton({
      buttonId: buttonId,
      user: interactionInfo.user,
      channel: interactionInfo.channel,
      guild: interactionInfo.guild,
      originalBody: body
    });
  }

  // 相談メニュー作成
  createConsultationMenu(userId) {
    return {
      content: `こんにちは <@${userId}>さん！\nどのようなご相談でしょうか？以下から選択してください：`,
      components: [
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
    };
  }

  // 統計情報取得
  getStats() {
    return {
      totalInteractions: this.interactionCount,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };
  }
}

module.exports = new DiscordHandler();
