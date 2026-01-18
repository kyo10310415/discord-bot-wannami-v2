// utils/verification.js - Discord署名検証ユーティリティ

const nacl = require('tweetnacl');
const logger = require('./logger'); // ✅ 追加: loggerをインポート

// Discord署名検証関数
function verifyDiscordSignature(signature, timestamp, body, publicKey) {
  try {
    const timestampBuffer = Buffer.from(timestamp, 'utf8');
    const bodyBuffer = Buffer.from(body);
    const message = Buffer.concat([timestampBuffer, bodyBuffer]);
    
    const signatureBuffer = Buffer.from(signature, 'hex');
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    
    const isValid = nacl.sign.detached.verify(message, signatureBuffer, publicKeyBuffer);
    
    logger.info(`🔒 Discord署名検証: ${isValid ? '成功' : '失敗'}`);
    return isValid;
  } catch (error) {
    logger.error('❌ 署名検証エラー:', error.message);
    return false;
  }
}

// リクエストボディのパース
function parseDiscordBody(rawBody) {
  try {
    return JSON.parse(rawBody.toString());
  } catch (error) {
    logger.error('❌ Discord JSONパースエラー:', error.message);
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

// ✅ 修正: Bot IDの検証（詳細ログ付き）
function isBotMentioned(content, mentions, botUserId) {
  // ✅ 追加: 入力パラメータのデバッグログ
  logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.debug('🔍 isBotMentioned() 呼び出し');
  logger.debug(`  content: "${content}"`);
  logger.debug(`  mentions配列: ${JSON.stringify(mentions.map(m => m.id))}`);
  logger.debug(`  botUserId: ${botUserId}`);
  
  if (!content || !mentions || !botUserId) {
    logger.debug('  ❌ 必須パラメータが不足しています');
    logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return false;
  }
  
  // メンション配列からBot IDを検索
  const botMentioned = mentions.some(mention => mention.id === botUserId);
  logger.debug(`  mentions配列チェック: ${botMentioned ? '✅ 一致' : '❌ 不一致'}`);
  
  // コンテンツ内でのメンション文字列チェック（バックアップ）
  const mentionPattern1 = `<@${botUserId}>`;
  const mentionPattern2 = `<@!${botUserId}>`;
  const hasMentionPattern1 = content.includes(mentionPattern1);
  const hasMentionPattern2 = content.includes(mentionPattern2);
  const mentionInContent = hasMentionPattern1 || hasMentionPattern2;
  
  logger.debug(`  コンテンツチェック (${mentionPattern1}): ${hasMentionPattern1 ? '✅ 含む' : '❌ 含まない'}`);
  logger.debug(`  コンテンツチェック (${mentionPattern2}): ${hasMentionPattern2 ? '✅ 含む' : '❌ 含まない'}`);
  
  const mentioned = botMentioned || mentionInContent;
  
  // ✅ 修正: loggerを使用
  logger.info(`🏷️ Bot メンション検出: ${mentioned ? 'あり' : 'なし'}`);
  logger.debug(`  最終判定: ${mentioned ? '✅ メンション検出' : '❌ メンションなし'}`);
  logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return mentioned;
}

// ✅ 修正: メンションからコンテンツを抽出（詳細ログ付き）
function extractContentFromMention(content, botUserId) {
  if (!content) {
    logger.debug('📝 メンション除去: コンテンツが空です');
    return '';
  }
  
  logger.debug(`📝 メンション除去前: "${content}"`);
  
  // Bot IDのメンション部分を除去
  let cleanContent = content
    .replace(new RegExp(`<@!?${botUserId}>`, 'g'), '')
    .trim();
  
  // ✅ 修正: loggerを使用
  logger.info(`📝 メンション除去後: "${cleanContent}"`);
  logger.debug(`  除去パターン: <@!?${botUserId}>`);
  
  return cleanContent;
}

// リクエストの妥当性チェック
function validateDiscordRequest(signature, timestamp, body, publicKey) {
  // 署名が存在するかチェック
  if (!signature) {
    logger.warn('⚠️ Discord署名ヘッダーが存在しません');
    return false;
  }
  
  // タイムスタンプが存在するかチェック
  if (!timestamp) {
    logger.warn('⚠️ Discordタイムスタンプヘッダーが存在しません');
    return false;
  }
  
  // 公開鍵が設定されているかチェック
  if (!publicKey) {
    logger.warn('⚠️ Discord公開鍵が設定されていません');
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
