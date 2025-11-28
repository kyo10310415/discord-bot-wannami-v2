/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 📋 mention-handler.js v15.5.13
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🎯 主な機能:
 *   - メンション検出とRAGシステム連携
 *   - 無限ループ完全対策（v15.5.11以降）
 *   - @everyone/@here 除外機能（v15.5.12以降）
 *   - 画像URL抽出
 *   - ミッション評価対応（!mission URLパターン検出）
 *   - Q&Aロガー連携（スプレッドシート記録）
 *   - クラシックボタン表示（空メンション時）
 * 
 * 🚨 無限ループ対策 (v15.5.11+)
 *   ✅ Bot自身のメッセージを無視
 *   ✅ Botユーザーのメッセージを無視
 *   ✅ システムメッセージを無視
 *   ✅ Webhookメッセージを無視
 *   ✅ @everyone / @here メンション無視（v15.5.12）
 * 
 * 📝 更新履歴:
 *   - v15.5.11: 無限ループ対策強化（message.author.bot等）
 *   - v15.5.12: @everyone/@here メンション除外追加
 *   - v15.5.13: Q&A記録データ改善（チャンネル名、サーバー名、応答時間などを追加）
 * 
 * 🔗 依存:
 *   - discord.js v14
 *   - services/rag-system.js
 *   - services/qa-logger.js
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

const { PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const ragSystem = require('../services/rag-system');
const logger = require('../utils/logger');

// ユーザーの待機状態を管理するMap
const waitingUsers = new Map();

/**
 * メンション処理のメインハンドラー（Q&Aロギングなし）
 * @param {Message} message - Discord Message オブジェクト
 * @param {string} userQuestion - ユーザーの質問内容
 * @param {Object} options - オプション設定
 * @returns {Promise<void>}
 */
async function handleMessage(message, userQuestion, options = {}) {
  try {
    logger.info('[mention-handler.js v15.5.13] handleMessage開始');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ 無限ループ対策: チェック1 - Botメッセージ検出
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (message.author.bot) {
      logger.info(`[LOOP PREVENTION] Botメッセージ検出 → スキップ (author.id=${message.author.id}, author.bot=true)`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ 無限ループ対策: チェック2 - システムメッセージ除外
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (message.system) {
      logger.info(`[LOOP PREVENTION] システムメッセージ検出 → スキップ`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ 無限ループ対策: チェック3 - Webhookメッセージ除外
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (message.webhookId) {
      logger.info(`[LOOP PREVENTION] Webhookメッセージ検出 → スキップ (webhookId=${message.webhookId})`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ 無限ループ対策: チェック4 - 自分自身のメッセージ除外
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (message.author.id === message.client.user.id) {
      logger.info(`[LOOP PREVENTION] 自分自身のメッセージ検出 → スキップ (clientId=${message.client.user.id})`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ 無限ループ対策: チェック5 - @everyone/@here 除外
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (message.mentions.everyone) {
      logger.info(`[LOOP PREVENTION] @everyone または @here メンション検出 → スキップ`);
      return;
    }

    // ユーザー待機中チェック
    if (waitingUsers.has(message.author.id)) {
      logger.info(`ユーザー ${message.author.username} は既に待機中です。処理をスキップします。`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 📋 メンション処理開始
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logger.info(`🎯 メンション検出: ${message.author.username} からの質問`);
    logger.info(`📝 質問内容: ${userQuestion}`);

    // 空メンション時のボタン表示処理
    if (!userQuestion.trim()) {
      logger.warn('⚠️ 空メンション検出 → クラシックボタンを表示');
      
      const questionButton = new ButtonBuilder()
        .setCustomId('ask_question')
        .setLabel('質問をする')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('❓');
      
      const resourceButton = new ButtonBuilder()
        .setCustomId('view_resources')
        .setLabel('資料を見る')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📚');
      
      const row = new ActionRowBuilder().addComponents(questionButton, resourceButton);
      
      await message.reply({
        content: 'わなみです！✨ 何かお手伝いできることはありますか？',
        components: [row]
      });
      
      return;
    }

    // ユーザーを待機状態に追加
    waitingUsers.set(message.author.id, true);

    try {
      // Typing表示開始
      await message.channel.sendTyping();
      logger.info('⏳ Typing表示を開始しました');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🖼️ 画像URL抽出
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const imageUrls = message.attachments
        .filter(att => att.contentType && att.contentType.startsWith('image/'))
        .map(att => att.url);

      if (imageUrls.length > 0) {
        logger.info(`🖼️ 画像検出: ${imageUrls.length}枚`);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🎯 ミッション評価判定
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const urlPattern = /(https?:\/\/[^\s]+)/;
      const isMissionEvaluation = userQuestion.includes('!mission') && urlPattern.test(userQuestion);

      let response;
      if (isMissionEvaluation) {
        logger.info('🎯 ミッション評価モード検出');
        response = await ragSystem.generateMissionResponse(
          userQuestion,
          imageUrls.length > 0 ? imageUrls : undefined
        );
      } else {
        logger.info('📚 通常の知識ベース検索モード');
        response = await ragSystem.generateKnowledgeOnlyResponse(
          userQuestion,
          imageUrls.length > 0 ? imageUrls : undefined
        );
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 💬 応答送信
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (response && response.trim()) {
        const chunks = splitMessage(response);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
        logger.success('✅ 応答を送信しました');
      } else {
        await message.reply('申し訳ありません。応答を生成できませんでした。🙇‍♀️');
        logger.error('⚠️ 空の応答が返されました');
      }

    } catch (error) {
      logger.error(`❌ メンション処理エラー: ${error.message}`);
      logger.error(error.stack);
      
      try {
        await message.reply('申し訳ありません。エラーが発生しました。しばらく待ってから再度お試しください。🙇‍♀️');
      } catch (replyError) {
        logger.error(`返信送信エラー: ${replyError.message}`);
      }
    } finally {
      // 待機状態を解除
      waitingUsers.delete(message.author.id);
      logger.info(`✅ ユーザー ${message.author.username} の待機状態を解除`);
    }

  } catch (error) {
    logger.error(`handleMessage 致命的エラー: ${error.message}`);
    logger.error(error.stack);
    waitingUsers.delete(message.author.id);
  }
}

/**
 * メンション処理のメインハンドラー（Q&Aロギングあり）
 * @param {Message} message - Discord Message オブジェクト
 * @param {string} userQuestion - ユーザーの質問内容
 * @param {Object} qaLogger - Q&Aロガーインスタンス
 * @param {Object} options - オプション設定
 * @returns {Promise<void>}
 */
async function handleMessageWithQALogging(message, userQuestion, qaLogger, options = {}) {
  const startTime = Date.now();
  
  try {
    logger.info('[mention-handler.js v15.5.13] handleMessageWithQALogging開始');

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ 無限ループ対策: チェック1 - Botメッセージ検出
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (message.author.bot) {
      logger.info(`[LOOP PREVENTION] Botメッセージ検出 → スキップ (author.id=${message.author.id}, author.bot=true)`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ 無限ループ対策: チェック2 - システムメッセージ除外
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (message.system) {
      logger.info(`[LOOP PREVENTION] システムメッセージ検出 → スキップ`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ 無限ループ対策: チェック3 - Webhookメッセージ除外
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (message.webhookId) {
      logger.info(`[LOOP PREVENTION] Webhookメッセージ検出 → スキップ (webhookId=${message.webhookId})`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ 無限ループ対策: チェック4 - 自分自身のメッセージ除外
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (message.author.id === message.client.user.id) {
      logger.info(`[LOOP PREVENTION] 自分自身のメッセージ検出 → スキップ (clientId=${message.client.user.id})`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🛡️ 無限ループ対策: チェック5 - @everyone/@here 除外
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (message.mentions.everyone) {
      logger.info(`[LOOP PREVENTION] @everyone または @here メンション検出 → スキップ`);
      return;
    }

    // ユーザー待機中チェック
    if (waitingUsers.has(message.author.id)) {
      logger.info(`ユーザー ${message.author.username} は既に待機中です。処理をスキップします。`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 📋 メンション処理開始
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logger.info(`🎯 メンション検出: ${message.author.username} からの質問`);
    logger.info(`📝 質問内容: ${userQuestion}`);

    // 空メンション時のボタン表示処理
    if (!userQuestion.trim()) {
      logger.warn('⚠️ 空メンション検出 → クラシックボタンを表示');
      
      const questionButton = new ButtonBuilder()
        .setCustomId('ask_question')
        .setLabel('質問をする')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('❓');
      
      const resourceButton = new ButtonBuilder()
        .setCustomId('view_resources')
        .setLabel('資料を見る')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📚');
      
      const row = new ActionRowBuilder().addComponents(questionButton, resourceButton);
      
      await message.reply({
        content: 'わなみです！✨ 何かお手伝いできることはありますか？',
        components: [row]
      });
      
      return;
    }

    // ユーザーを待機状態に追加
    waitingUsers.set(message.author.id, true);

    try {
      // Typing表示開始
      await message.channel.sendTyping();
      logger.info('⏳ Typing表示を開始しました');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🖼️ 画像URL抽出
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const imageUrls = message.attachments
        .filter(att => att.contentType && att.contentType.startsWith('image/'))
        .map(att => att.url);

      if (imageUrls.length > 0) {
        logger.info(`🖼️ 画像検出: ${imageUrls.length}枚`);
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🎯 ミッション評価判定
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const urlPattern = /(https?:\/\/[^\s]+)/;
      const isMissionEvaluation = userQuestion.includes('!mission') && urlPattern.test(userQuestion);

      let response;
      let questionType = '通常質問';
      
      if (isMissionEvaluation) {
        logger.info('🎯 ミッション評価モード検出');
        response = await ragSystem.generateMissionResponse(
          userQuestion,
          imageUrls.length > 0 ? imageUrls : undefined
        );
        questionType = 'ミッション評価';
      } else {
        logger.info('📚 通常の知識ベース検索モード');
        response = await ragSystem.generateKnowledgeOnlyResponse(
          userQuestion,
          imageUrls.length > 0 ? imageUrls : undefined
        );
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 💬 応答送信
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (response && response.trim()) {
        const chunks = splitMessage(response);
        for (const chunk of chunks) {
          await message.reply(chunk);
        }
        logger.success('✅ 応答を送信しました');
      } else {
        response = '申し訳ありません。応答を生成できませんでした。🙇‍♀️';
        await message.reply(response);
        logger.error('⚠️ 空の応答が返されました');
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 📊 Q&A記録（スプレッドシート書き込み）
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (qaLogger) {
        const endTime = Date.now();
        const processingTime = endTime - startTime;

        const qaData = {
          timestamp: new Date().toISOString(),
          userId: message.author.id,
          username: message.author.username,
          channelId: message.channel.id,
          channelName: message.channel.name || 'DM',
          guildId: message.guild?.id || 'DM',
          guildName: message.guild?.name || 'ダイレクトメッセージ',
          question: userQuestion,
          response: response,
          responseLength: response.length,
          processingTime: processingTime,
          questionType: questionType,
          hasImage: imageUrls.length > 0
        };

        logger.info(`[DEBUG] Q&A記録データ準備完了:`);
        logger.info(`[DEBUG] - タイムスタンプ: ${qaData.timestamp}`);
        logger.info(`[DEBUG] - ユーザー: ${qaData.username} (${qaData.userId})`);
        logger.info(`[DEBUG] - チャンネル: ${qaData.channelName} (${qaData.channelId})`);
        logger.info(`[DEBUG] - サーバー: ${qaData.guildName} (${qaData.guildId})`);
        logger.info(`[DEBUG] - 質問タイプ: ${qaData.questionType}`);
        logger.info(`[DEBUG] - 応答長: ${qaData.responseLength}文字`);
        logger.info(`[DEBUG] - 処理時間: ${qaData.processingTime}ms`);

        try {
          await qaLogger.logQA(qaData);
          logger.success('✅ Q&A記録をスプレッドシートに書き込みました');
        } catch (logError) {
          logger.error(`❌ Q&A記録エラー: ${logError.message}`);
          logger.error(logError.stack);
        }
      }

    } catch (error) {
      logger.error(`❌ メンション処理エラー: ${error.message}`);
      logger.error(error.stack);
      
      try {
        await message.reply('申し訳ありません。エラーが発生しました。しばらく待ってから再度お試しください。🙇‍♀️');
      } catch (replyError) {
        logger.error(`返信送信エラー: ${replyError.message}`);
      }
    } finally {
      // 待機状態を解除
      waitingUsers.delete(message.author.id);
      logger.info(`✅ ユーザー ${message.author.username} の待機状態を解除`);
    }

  } catch (error) {
    logger.error(`handleMessageWithQALogging 致命的エラー: ${error.message}`);
    logger.error(error.stack);
    waitingUsers.delete(message.author.id);
  }
}

/**
 * メッセージ分割（Discord 2000文字制限対策）
 * @param {string} text - 分割するテキスト
 * @param {number} maxLength - 最大文字数（デフォルト: 1900）
 * @returns {string[]} 分割されたメッセージ配列
 */
function splitMessage(text, maxLength = 1900) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let currentChunk = '';

  const lines = text.split('\n');
  for (const line of lines) {
    if ((currentChunk + line + '\n').length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      if (line.length > maxLength) {
        for (let i = 0; i < line.length; i += maxLength) {
          chunks.push(line.substring(i, i + maxLength));
        }
      } else {
        currentChunk = line + '\n';
      }
    } else {
      currentChunk += line + '\n';
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

module.exports = {
  handleMessage,
  handleMessageWithQALogging
};
