// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🗑️ メッセージ一括削除スクリプト（緊急用・一時的）
// 無限ループで発生した大量メッセージを削除するための専用スクリプト
// ⚠️ 使用後は必ずindex.jsから削除すること
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const { PermissionsBitField } = require('discord.js');

module.exports = (client) => {
  const logger = require('./utils/logger');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ユーティリティ関数
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * メンションからUser IDを抽出
   */
  function extractUserId(mention) {
    // <@123456789> または <@!123456789> 形式
    const userMatch = mention.match(/^<@!?(\d+)>$/);
    if (userMatch) return userMatch[1];
    
    // <@&123456789> 形式（ロールメンション - 無効）
    const roleMatch = mention.match(/^<@&(\d+)>$/);
    if (roleMatch) return null;
    
    // 数字のみ（生のID）
    if (/^\d+$/.test(mention)) return mention;
    
    return null;
  }

  /**
   * Rate Limit対策版：メッセージを1件ずつ削除
   */
  async function deleteMessagesWithRateLimit(channel, targetUserId, maxCount, statusMsg) {
    let deletedCount = 0;
    let lastMessageId = null;
    const startTime = Date.now();

    logger.info(`🗑️ 削除開始: チャンネル=${channel.name}, 対象=${targetUserId}, 最大=${maxCount}件`);

    while (deletedCount < maxCount) {
      try {
        // メッセージ取得オプション
        const fetchOptions = { limit: 100 };
        if (lastMessageId) {
          fetchOptions.before = lastMessageId;
        }

        // メッセージ取得
        const messages = await channel.messages.fetch(fetchOptions);
        if (messages.size === 0) {
          logger.info('✅ これ以上メッセージがありません');
          break;
        }

        // 対象ユーザーのメッセージをフィルタリング
        const targetMessages = messages.filter(msg => msg.author.id === targetUserId);
        logger.info(`📊 取得: ${messages.size}件中 ${targetMessages.size}件が対象`);

        if (targetMessages.size === 0) {
          // 対象メッセージなし → 次のバッチへ
          lastMessageId = messages.last().id;
          continue;
        }

        // 1件ずつ削除（Rate Limit対策: 200ms間隔）
        for (const [id, message] of targetMessages) {
          if (deletedCount >= maxCount) break;

          try {
            await message.delete();
            deletedCount++;

            // 進捗更新（10件ごと）
            if (deletedCount % 10 === 0 && statusMsg) {
              const progress = ((deletedCount / maxCount) * 100).toFixed(1);
              const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
              await statusMsg.edit(
                `🗑️ 削除中...\n` +
                `削除済み: ${deletedCount}/${maxCount} (${progress}%)\n` +
                `経過時間: ${elapsed}秒`
              );
            }

            // Rate Limit対策: 200ms待機
            await new Promise(resolve => setTimeout(resolve, 200));

          } catch (deleteError) {
            logger.warn(`⚠️ メッセージ削除失敗: ${deleteError.message}`);
          }
        }

        // 次のバッチのための最終メッセージID更新
        lastMessageId = messages.last().id;

      } catch (fetchError) {
        logger.error(`❌ メッセージ取得エラー: ${fetchError.message}`);
        break;
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.success(`✅ 削除完了: ${deletedCount}件 (${totalTime}秒)`);

    return deletedCount;
  }

  /**
   * Discord Bulk Delete API版：14日以内のメッセージを高速削除
   */
  async function bulkDeleteMessages(channel, targetUserId, maxCount, statusMsg) {
    let deletedCount = 0;
    let lastMessageId = null;
    const startTime = Date.now();
    const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

    logger.info(`🗑️ 一括削除開始: チャンネル=${channel.name}, 対象=${targetUserId}, 最大=${maxCount}件`);

    while (deletedCount < maxCount) {
      try {
        const fetchOptions = { limit: 100 };
        if (lastMessageId) {
          fetchOptions.before = lastMessageId;
        }

        const messages = await channel.messages.fetch(fetchOptions);
        if (messages.size === 0) {
          logger.info('✅ これ以上メッセージがありません');
          break;
        }

        // 対象ユーザー + 14日以内のメッセージをフィルタリング
        const targetMessages = messages.filter(msg => {
          const isTargetUser = msg.author.id === targetUserId;
          const isWithin14Days = msg.createdTimestamp > twoWeeksAgo;
          return isTargetUser && isWithin14Days;
        });

        logger.info(`📊 取得: ${messages.size}件中 ${targetMessages.size}件が対象（14日以内）`);

        if (targetMessages.size === 0) {
          lastMessageId = messages.last().id;
          
          // 最古メッセージが14日より古い場合は終了
          if (messages.last().createdTimestamp < twoWeeksAgo) {
            logger.info('⚠️ 14日より古いメッセージに到達しました');
            break;
          }
          continue;
        }

        // 削除するメッセージ数を制限
        const toDelete = Array.from(targetMessages.values()).slice(0, maxCount - deletedCount);

        // Bulk Delete（最大100件）
        try {
          await channel.bulkDelete(toDelete, true); // filterOld=true で14日以上古いものをスキップ
          deletedCount += toDelete.length;

          // 進捗更新
          if (statusMsg) {
            const progress = ((deletedCount / maxCount) * 100).toFixed(1);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            await statusMsg.edit(
              `🗑️ 一括削除中...\n` +
              `削除済み: ${deletedCount}/${maxCount} (${progress}%)\n` +
              `経過時間: ${elapsed}秒`
            );
          }

        } catch (bulkError) {
          logger.warn(`⚠️ 一括削除失敗: ${bulkError.message}`);
          // フォールバック: 1件ずつ削除
          for (const msg of toDelete) {
            try {
              await msg.delete();
              deletedCount++;
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (e) {
              logger.warn(`⚠️ 個別削除失敗: ${e.message}`);
            }
          }
        }

        lastMessageId = messages.last().id;

        // Rate Limit対策: 1秒待機
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (fetchError) {
        logger.error(`❌ メッセージ取得エラー: ${fetchError.message}`);
        break;
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.success(`✅ 一括削除完了: ${deletedCount}件 (${totalTime}秒)`);

    return deletedCount;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // コマンドハンドラー
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  client.on('messageCreate', async (message) => {
    // Botメッセージは無視
    if (message.author.bot) return;

    const content = message.content.trim();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // !cleanup-help
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (content === '!cleanup-help') {
      const helpMessage = 
        `🗑️ **メッセージ一括削除コマンド**\n\n` +
        `**【コマンド一覧】**\n` +
        `\`!cleanup @Bot名 削除件数\` - すべての期間対応（遅い: 200ms/件）\n` +
        `\`!bulkdelete @Bot名 削除件数\` - 14日以内限定（高速）\n` +
        `\`!cleanup-help\` - このヘルプを表示\n\n` +
        `**【使用例】**\n` +
        `\`!cleanup @わなみさん 500\` - わなみさんのメッセージを500件削除\n` +
        `\`!bulkdelete @わなみさん 100\` - 14日以内のメッセージを100件削除\n\n` +
        `**【注意事項】**\n` +
        `⚠️ 管理者権限が必要です\n` +
        `⚠️ \`!cleanup\`は時間がかかります（500件=約100秒）\n` +
        `⚠️ \`!bulkdelete\`は14日以上古いメッセージは削除できません\n` +
        `⚠️ 削除後は復元できません\n\n` +
        `**【権限チェック】**\n` +
        `このコマンドを実行するには以下の権限が必要です：\n` +
        `• 管理者 (Administrator)\n` +
        `• メッセージ管理 (Manage Messages)`;

      await message.reply(helpMessage);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // !cleanup @Bot名 削除件数
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const cleanupMatch = content.match(/^!cleanup\s+(<@!?\d+>|\d+)\s+(\d+)$/);
    if (cleanupMatch) {
      const targetMention = cleanupMatch[1];
      const deleteCount = parseInt(cleanupMatch[2], 10);

      // 権限チェック
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await message.reply('❌ このコマンドは管理者のみ実行できます。');
        return;
      }

      // User ID抽出
      const targetUserId = extractUserId(targetMention);
      if (!targetUserId) {
        await message.reply('❌ 無効なメンション形式です。正しい形式: `!cleanup @Bot名 削除件数`');
        return;
      }

      // 削除件数チェック
      if (deleteCount < 1 || deleteCount > 10000) {
        await message.reply('❌ 削除件数は1〜10000の範囲で指定してください。');
        return;
      }

      // ユーザー確認
      let targetUser;
      try {
        targetUser = await client.users.fetch(targetUserId);
      } catch (error) {
        await message.reply('❌ 指定されたユーザーが見つかりません。');
        return;
      }

      // 確認メッセージ
      const confirmMsg = await message.reply(
        `🗑️ **削除を開始します**\n` +
        `対象: ${targetUser.tag} (\`${targetUserId}\`)\n` +
        `削除件数: 最大 ${deleteCount}件\n` +
        `方式: 1件ずつ削除（すべての期間対応）\n` +
        `推定時間: 約${Math.ceil(deleteCount * 0.2)}秒\n\n` +
        `処理を開始します...`
      );

      // 削除実行
      const deletedCount = await deleteMessagesWithRateLimit(
        message.channel,
        targetUserId,
        deleteCount,
        confirmMsg
      );

      // 完了メッセージ
      await confirmMsg.edit(
        `✅ **削除完了**\n` +
        `対象: ${targetUser.tag}\n` +
        `削除件数: ${deletedCount}件`
      );

      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // !bulkdelete @Bot名 削除件数
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const bulkMatch = content.match(/^!bulkdelete\s+(<@!?\d+>|\d+)\s+(\d+)$/);
    if (bulkMatch) {
      const targetMention = bulkMatch[1];
      const deleteCount = parseInt(bulkMatch[2], 10);

      // 権限チェック
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await message.reply('❌ このコマンドは管理者のみ実行できます。');
        return;
      }

      // User ID抽出
      const targetUserId = extractUserId(targetMention);
      if (!targetUserId) {
        await message.reply('❌ 無効なメンション形式です。正しい形式: `!bulkdelete @Bot名 削除件数`');
        return;
      }

      // 削除件数チェック
      if (deleteCount < 1 || deleteCount > 10000) {
        await message.reply('❌ 削除件数は1〜10000の範囲で指定してください。');
        return;
      }

      // ユーザー確認
      let targetUser;
      try {
        targetUser = await client.users.fetch(targetUserId);
      } catch (error) {
        await message.reply('❌ 指定されたユーザーが見つかりません。');
        return;
      }

      // 確認メッセージ
      const confirmMsg = await message.reply(
        `🗑️ **一括削除を開始します**\n` +
        `対象: ${targetUser.tag} (\`${targetUserId}\`)\n` +
        `削除件数: 最大 ${deleteCount}件\n` +
        `方式: 一括削除（14日以内限定）\n` +
        `⚠️ 14日より古いメッセージは削除されません\n\n` +
        `処理を開始します...`
      );

      // 削除実行
      const deletedCount = await bulkDeleteMessages(
        message.channel,
        targetUserId,
        deleteCount,
        confirmMsg
      );

      // 完了メッセージ
      await confirmMsg.edit(
        `✅ **一括削除完了**\n` +
        `対象: ${targetUser.tag}\n` +
        `削除件数: ${deletedCount}件\n` +
        `⚠️ 14日より古いメッセージは削除されていません`
      );

      return;
    }
  });

  logger.info('🗑️ メッセージ一括削除コマンド登録完了');
  logger.info('   利用可能コマンド: !cleanup, !bulkdelete, !cleanup-help');
};
