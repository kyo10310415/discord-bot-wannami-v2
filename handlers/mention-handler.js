// handlers/mention-handler.js - メンション処理ハンドラー（logger修正版）

const logger = require('../utils/logger');
const { isBotMentioned, extractContentFromMention } = require('../utils/verification');
const { hasImageAttachments, extractImageUrls } = require('../utils/image-utils');

// Bot User IDを環境変数から取得（フォールバック値も設定）
const BOT_USER_ID = process.env.BOT_USER_ID || '1420328163497607199';

// @わなみさんメンション処理
async function handleMessage(message, client) {
  try {
    // Botメッセージは無視
    if (message.author.bot) return;
    
    // メンション検出
    const mentions = message.mentions?.users?.map(user => ({ id: user.id })) || [];
    const isMentioned = isBotMentioned(message.content, mentions, BOT_USER_ID);
    
    if (!isMentioned) return;
    
    logger.discord(`メンション検出: ${message.author.username} in #${message.channel.name}`);
    
    // メンションからコンテンツを抽出
    const userQuery = extractContentFromMention(message.content, BOT_USER_ID);
    
    // 画像添付の確認
    const attachments = Array.from(message.attachments.values());
    const hasImages = hasImageAttachments(attachments);
    const imageUrls = hasImages ? extractImageUrls(attachments) : [];
    
    logger.image(`画像添付: ${hasImages ? `${imageUrls.length}枚` : 'なし'}`);
    
    // 応答処理開始のタイピング表示
    await message.channel.sendTyping();
    
    // 質問内容が空の場合はボタンメニューを表示
    if (!userQuery || userQuery.trim() === '') {
      await showConsultationMenu(message);
      return;
    }
    
    // ボタンクリック後の質問応答かチェック
    const { handleQuestionResponse, isUserWaitingForQuestion } = require('./button-handler');
    
    if (isUserWaitingForQuestion(message.author.id)) {
      // ボタンクリック後の質問応答処理
      try {
        const buttonResponse = await handleQuestionResponse(message.author.id, userQuery, {
          username: message.author.username,
          channelName: message.channel.name,
          guildName: message.guild?.name || 'DM',
          hasImages: hasImages,
          imageUrls: imageUrls
        });
        
        if (buttonResponse) {
          // ボタン質問の応答を送信
          await sendLongMessage(message.channel, buttonResponse);
          logger.success(`ボタン質問応答送信完了: ${message.author.username}`);
          return;
        }
      } catch (buttonError) {
        logger.errorDetail('ボタン質問応答エラー:', buttonError);
        // 通常の知識ベース応答にフォールバック
      }
    }
    
    // 通常の知識ベース限定応答処理
    try {
      const { generateKnowledgeOnlyResponse } = require('../services/rag-system');
      
      // 知識ベース限定応答生成
      const response = await generateKnowledgeOnlyResponse(userQuery, {
        username: message.author.username,
        channelName: message.channel.name,
        guildName: message.guild?.name || 'DM',
        hasImages: hasImages,
        imageUrls: imageUrls
      });
      
      // 応答送信（2000文字制限対応）
      await sendLongMessage(message.channel, response);
      
      logger.success(`知識ベース限定応答送信完了: ${message.author.username}`);
      
    } catch (knowledgeError) {
      logger.errorDetail('知識ベース応答生成エラー:', knowledgeError);
      
      // 知識ベースが利用できない場合の応答
      const fallbackResponse = generateKnowledgeBaseFallback(userQuery, hasImages);
      await message.reply(fallbackResponse);
    }
    
  } catch (error) {
    logger.errorDetail('メンション処理エラー:', error);
    
    try {
      await message.reply('❌ 申し訳ございません。システムエラーが発生しました。しばらく待ってから再度お試しください。');
    } catch (replyError) {
      logger.error('エラー応答送信失敗:', replyError.message);
    }
  }
}

// 知識ベースフォールバック応答生成（システムエラー時）
function generateKnowledgeBaseFallback(userQuery, hasImages) {
  logger.warn('知識ベースシステムエラー - フォールバック応答生成');
  
  let response = `🤖 **わなみさんです！**\n\n`;
  
  response += `⚠️ 申し訳ございません。現在知識ベースシステムにアクセスできません。\n\n`;
  
  if (!userQuery || userQuery.trim() === '') {
    response += `何かご相談はありますか？\n`;
  } else {
    response += `「${userQuery}」についてのご質問ですね。\n\n`;
    response += `現在、知識ベースからの回答ができない状態です。\n`;
  }
  
  if (hasImages) {
    response += `🖼️ 画像添付を確認しましたが、現在解析できません。\n\n`;
  }
  
  response += `**🔄 再試行のお願い**\n`;
  response += `• しばらく待ってから再度お試しください\n`;
  response += `• \`/soudan\` コマンドで相談メニューを表示\n\n`;
  
  response += `**📞 サポート方法**\n`;
  response += `• ③レッスン質問 - 技術的問題\n`;
  response += `• ④SNS運用相談 - マーケティング\n`;
  response += `• ②プライベート相談 - 個人的な悩み\n\n`;
  response += `システム復旧までお待ちください🙏`;
  
  return response;
}

// 相談メニュー表示（「@わなみさん」だけのメンション時）
async function showConsultationMenu(message) {
  try {
    logger.discord(`相談メニュー表示: ${message.author.username}`);
    
    const content = `🤖 **わなみさんです！**

VTuber育成スクールへようこそ！
どのようなご相談でしょうか？下のボタンから選択してください✨

**📚 知識ベース限定回答システム**
• **@わなみさん [質問]** で知識ベースから正確な回答
• VTuber活動に特化した専門情報のみ回答
• 知識ベース外の情報は「分からない」と正直に回答

**📞 専門サポートメニュー**
下のボタンから選択して、より詳しいサポートを受けられます！`;
    
    const { createConsultationButtons } = require('./discord-handler');
    const buttons = createConsultationButtons();
    
    // ボタン付きメッセージを送信
    await message.reply({
      content: content,
      components: buttons
    });
    
    logger.success(`相談メニュー送信完了: ${message.author.username}`);
    
  } catch (error) {
    logger.errorDetail('相談メニュー表示エラー:', error);
    
    // フォールバック応答
    await message.reply('🤖 **わなみさんです！**\n\n何かご相談はありますか？\n\n**使い方:**\n• **@わなみさん [質問]** で知識ベースから回答\n• \`/soudan\` で相談メニューを表示\n\nお気軽にご相談ください✨');
  }
}

// 長いメッセージを分割して送信
async function sendLongMessage(channel, content, maxLength = 2000) {
  if (content.length <= maxLength) {
    return await channel.send(content);
  }
  
  // メッセージを適切な位置で分割
  const messages = [];
  let currentMessage = '';
  const lines = content.split('\n');
  
  for (const line of lines) {
    if ((currentMessage + line + '\n').length > maxLength) {
      if (currentMessage) {
        messages.push(currentMessage.trim());
        currentMessage = '';
      }
      
      // 1行が長すぎる場合はさらに分割
      if (line.length > maxLength) {
        const chunks = line.match(new RegExp(`.{1,${maxLength - 10}}`, 'g')) || [line];
        messages.push(...chunks);
      } else {
        currentMessage = line + '\n';
      }
    } else {
      currentMessage += line + '\n';
    }
  }
  
  if (currentMessage.trim()) {
    messages.push(currentMessage.trim());
  }
  
  // 分割されたメッセージを順次送信
  const sentMessages = [];
  for (let i = 0; i < messages.length; i++) {
    let messageContent = messages[i];
    
    // 最初のメッセージ以外には続きであることを示す
    if (i > 0) {
      messageContent = `**（続き ${i + 1}/${messages.length}）**\n${messageContent}`;
    }
    
    // 最後のメッセージ以外には続くことを示す  
    if (i < messages.length - 1) {
      messageContent += `\n\n*（続く...）*`;
    }
    
    const sentMessage = await channel.send(messageContent);
    sentMessages.push(sentMessage);
    
    // 連続送信の間隔を空ける
    if (i < messages.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return sentMessages;
}

// ロールメンション処理（将来の拡張用）
async function handleRoleMention(message, client) {
  try {
    // ロールメンションの検出と処理
    const roleMentions = message.mentions?.roles;
    if (!roleMentions || roleMentions.size === 0) return;
    
    logger.discord(`ロールメンション検出: ${roleMentions.size}個`);
    
    // 特定のロールに対する特別な処理を実装可能
    // 例：管理者ロール、生徒ロール、講師ロール等
    
  } catch (error) {
    logger.errorDetail('ロールメンション処理エラー:', error);
  }
}

module.exports = {
  handleMessage,
  handleRoleMention,
  sendLongMessage
};
