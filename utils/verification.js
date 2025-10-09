// utils/verification.js - Discord署名検証ユーティリティ

const nacl = require('tweetnacl');

// Discord署名検証関数
function verifyDiscordSignature(signature, timestamp, body, publicKey) {
  try {
    const timestampBuffer = Buffer.from(timestamp, 'utf8');
    const bodyBuffer = Buffer.from(body);
    const message = Buffer.concat([timestampBuffer, bodyBuffer]);
    
    const signatureBuffer = Buffer.from(signature, 'hex');
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    
    const isValid = nacl.sign.detached.verify(message, signatureBuffer, publicKeyBuffer);
    
    console.log(`🔒 Discord署名検証: ${isValid ? '成功' : '失敗'}`);
    return isValid;
  } catch (error) {
    console.error('❌ 署名検証エラー:', error.message);
    return false;
  }
}

// リクエストボディのパース
function parseDiscordBody(rawBody) {
  try {
    return JSON.parse(rawBody.toString());
  } catch (error) {
    console.error('❌ Discord JSONパースエラー:', error.message);
    throw new Error('Invalid JSON in request body');
  }
}

// Discordインタラクションタイプの判定
function getInteractionType(body) {
  const types = {
    1: 'PING',
    2: 'APPLICATION_COMMAND',
    3: 'MESSAGE_COMPONENT',
    4: 'APPLICATION_COMMAND_AUTOCOMPLETE',
    5: 'MODAL_SUBMIT'
  };
  
  return types[body.type] || 'UNKNOWN';
}

// ユーザー情報の抽出
function extractUserInfo(body) {
  const user = body.user || body.member?.user;
  
  if (!user) {
    return null;
  }
  
  return {
    id: user.id,
    username: user.username,
    discriminator: user.discriminator,
    avatar: user.avatar,
    displayName: body.member?.nick || user.global_name || user.username
  };
}

// チャンネル情報の抽出
function extractChannelInfo(body) {
  return {
    id: body.channel_id,
    type: body.channel?.type,
    name: body.channel?.name
  };
}

// ギルド情報の抽出
function extractGuildInfo(body) {
  return {
    id: body.guild_id,
    name: body.guild?.name
  };
}

// メッセージ情報の抽出
function extractMessageInfo(body) {
  if (body.type === 0) { // MESSAGE タイプ
    return {
      content: body.content,
      attachments: body.attachments || [],
      mentions: body.mentions || [],
      author: body.author,
      timestamp: body.timestamp,
      edited_timestamp: body.edited_timestamp
    };
  }
  
  return null;
}

// インタラクション情報の完全抽出
function extractInteractionInfo(body) {
  return {
    id: body.id,
    type: getInteractionType(body),
    token: body.token,
    version: body.version,
    application_id: body.application_id,
    user: extractUserInfo(body),
    channel: extractChannelInfo(body),
    guild: extractGuildInfo(body),
    message: extractMessageInfo(body),
    data: body.data,
    timestamp: new Date().toISOString()
  };
}

// Discord応答形式の作成
function createDiscordResponse(type, data) {
  const responseTypes = {
    PONG: 1,
    CHANNEL_MESSAGE_WITH_SOURCE: 4,
    DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
    DEFERRED_UPDATE_MESSAGE: 6,
    UPDATE_MESSAGE: 7
  };
  
  return {
    type: responseTypes[type] || type,
    data: data
  };
}

// エラー応答の作成
function createErrorResponse(message) {
  return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
    content: `❌ エラーが発生しました: ${message}`,
    flags: 64 // EPHEMERAL flag
  });
}

// 成功応答の作成
function createSuccessResponse(content, components = null) {
  const data = { content };
  
  if (components) {
    data.components = components;
  }
  
  return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', data);
}

// Bot IDの検証
function isBotMentioned(content, mentions, botUserId) {
  if (!content || !mentions || !botUserId) return false;
  
  // メンション配列からBot IDを検索
  const botMentioned = mentions.some(mention => mention.id === botUserId);
  
  // コンテンツ内でのメンション文字列チェック（バックアップ）
  const mentionInContent = content.includes(`<@${botUserId}>`) || content.includes(`<@!${botUserId}>`);
  
  const mentioned = botMentioned || mentionInContent;
  console.log(`🏷️ Bot メンション検出: ${mentioned ? 'あり' : 'なし'}`);
  
  return mentioned;
}

// メンションからコンテンツを抽出
function extractContentFromMention(content, botUserId) {
  if (!content) return '';
  
  // Bot IDのメンション部分を除去
  let cleanContent = content
    .replace(new RegExp(`<@!?${botUserId}>`, 'g'), '')
    .trim();
  
  console.log(`📝 メンション除去後: "${cleanContent}"`);
  return cleanContent;
}

// リクエストの妥当性チェック
function validateDiscordRequest(signature, timestamp, body, publicKey) {
  // 署名が存在するかチェック
  if (!signature) {
    console.warn('⚠️ Discord署名ヘッダーが存在しません');
    return false;
  }
  
  // タイムスタンプが存在するかチェック
  if (!timestamp) {
    console.warn('⚠️ Discordタイムスタンプヘッダーが存在しません');
    return false;
  }
  
  // 公開鍵が設定されているかチェック
  if (!publicKey) {
    console.warn('⚠️ Discord公開鍵が設定されていません');
    return false;
  }
  
  // 署名検証
  return verifyDiscordSignature(signature, timestamp, body, publicKey);
}

module.exports = {
  verifyDiscordSignature,
  parseDiscordBody,
  getInteractionType,
  extractUserInfo,
  extractChannelInfo,
  extractGuildInfo,
  extractMessageInfo,
  extractInteractionInfo,
  createDiscordResponse,
  createErrorResponse,
  createSuccessResponse,
  isBotMentioned,
  extractContentFromMention,
  validateDiscordRequest
};
