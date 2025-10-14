// handlers/mention-handler.js - メンション処理ハンドラー

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
    
    // 知識ベース限定応答処理
    try {
      const { generateKnowledgeOnlyResponse } = require('../services/rag-system');
      
      // 知識ベース限定応答生成
      const response = await generateKnowledgeOnlyResponse(userQuery, {
        username: message.author.username,
        channelName: message.channel.name,
        guildName: message.guild?.name || 'DM',
        hasImages: hasImages
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
    const msg = messages[i];
    
    if (i === 0) {
      // 最初のメッセージ
      sentMessages.push(await channel.send(msg));
    } else {
      // 続きのメッセージ（少し間隔を空ける）
      await new Promise(resolve => setTimeout(resolve, 500));
      sentMessages.push(await channel.send(`**続き ${i + 1}/${messages.length}:**\n${msg}`));
    }
  }
  
  return sentMessages[0]; // 最初のメッセージを返す
}

// テスト用エクスポート（開発時のみ）
if (process.env.NODE_ENV === 'test') {
  module.exports = {
    handleMessage,
    generateKnowledgeBaseFallback,
    sendLongMessage
  };
} else {
  module.exports = {
    handleMessage
  };
}
