/**
 * Discord Bot メッセージ一括削除スクリプト
 * 
 * 使い方:
 * 1. このファイルをプロジェクトルートに配置
 * 2. bot.jsに一時的にrequireする
 * 3. Discordで「!cleanup @Bot名 削除件数」を実行
 * 4. 削除完了後、このrequire文を削除
 * 
 * 注意:
 * - 管理者権限が必要
 * - Rate Limit対策済み（200msごとに1件削除）
 * - 14日以上前のメッセージも削除可能
 */

module.exports = (client) => {
  console.log('🗑️ メッセージ一括削除機能を有効化');

  // コマンド1: 通常削除（すべての期間対応）
  client.on('messageCreate', async (message) => {
    // Bot自身のメッセージは無視
    if (message.author.bot) return;
    
    // 管理者権限チェック
    if (!message.member?.permissions.has('Administrator')) return;
    
    // コマンド: !cleanup @Bot名 削除件数
    if (message.content.startsWith('!cleanup')) {
      const args = message.content.split(' ');
      const mentionedBot = message.mentions.users.first();
      const limit = parseInt(args[2]) || 100;
      
      if (!mentionedBot) {
        return message.reply('❌ 使い方: `!cleanup @Bot名 削除件数`\n例: `!cleanup @わなみさん 200`');
      }
      
      if (!mentionedBot.bot) {
        return message.reply('❌ 指定されたユーザーはBotではありません');
      }
      
      try {
        const statusMsg = await message.reply(`🗑️ ${mentionedBot.username}のメッセージを削除中...\n⏳ 削除件数: 0/${limit}`);
        
        let deletedCount = 0;
        let lastMessageId = null;
        let errorCount = 0;
        
        // メッセージを取得して削除
        while (deletedCount < limit) {
          const fetchOptions = { limit: 100 };
          if (lastMessageId) {
            fetchOptions.before = lastMessageId;
          }
          
          const messages = await message.channel.messages.fetch(fetchOptions);
          if (messages.size === 0) {
            console.log('✅ これ以上メッセージがありません');
            break;
          }
          
          const botMessages = messages.filter(m => m.author.id === mentionedBot.id);
          
          if (botMessages.size === 0) {
            lastMessageId = messages.last()?.id;
            continue;
          }
          
          for (const msg of botMessages.values()) {
            if (deletedCount >= limit) break;
            
            try {
              await msg.delete();
              deletedCount++;
              
              // 進捗表示（10件ごと）
              if (deletedCount % 10 === 0) {
                await statusMsg.edit(`🗑️ ${mentionedBot.username}のメッセージを削除中...\n⏳ 削除件数: ${deletedCount}/${limit}`);
              }
              
              console.log(`✅ 削除済み: ${deletedCount}/${limit} (メッセージID: ${msg.id})`);
              
              // Rate Limit対策（Discord API: 1秒あたり5件まで）
              await new Promise(resolve => setTimeout(resolve, 200));
              
            } catch (err) {
              errorCount++;
              console.error(`❌ 削除エラー (${msg.id}):`, err.message);
              
              // 連続エラーが多い場合は中断
              if (errorCount > 10) {
                throw new Error('連続エラーが多すぎます。処理を中断します。');
              }
            }
          }
          
          lastMessageId = messages.last()?.id;
        }
        
        await statusMsg.edit(`✅ 完了: ${deletedCount}件のメッセージを削除しました\n⚠️ エラー: ${errorCount}件`);
        
      } catch (error) {
        console.error('❌❌❌ 一括削除エラー:', error);
        await message.channel.send(`❌ エラーが発生しました: ${error.message}`);
      }
    }
    
    // コマンド2: バルク削除（14日以内限定・高速）
    if (message.content.startsWith('!bulkdelete')) {
      const args = message.content.split(' ');
      const mentionedBot = message.mentions.users.first();
      const limit = parseInt(args[2]) || 100;
      
      if (!mentionedBot) {
        return message.reply('❌ 使い方: `!bulkdelete @Bot名 削除件数`\n例: `!bulkdelete @わなみさん 100`\n⚠️ 14日以内のメッセージのみ削除可能');
      }
      
      if (!mentionedBot.bot) {
        return message.reply('❌ 指定されたユーザーはBotではありません');
      }
      
      try {
        const statusMsg = await message.reply(`🗑️ 一括削除中（バルクモード）...\n⚠️ 14日以内のメッセージのみ削除`);
        
        let totalDeleted = 0;
        let lastMessageId = null;
        
        while (totalDeleted < limit) {
          const fetchOptions = { limit: Math.min(100, limit - totalDeleted) };
          if (lastMessageId) {
            fetchOptions.before = lastMessageId;
          }
          
          const messages = await message.channel.messages.fetch(fetchOptions);
          if (messages.size === 0) break;
          
          const botMessages = messages.filter(m => m.author.id === mentionedBot.id);
          
          if (botMessages.size > 0) {
            try {
              // バルク削除（14日以内のメッセージのみ）
              const deleted = await message.channel.bulkDelete(botMessages, true);
              totalDeleted += deleted.size;
              
              console.log(`✅ バルク削除: ${deleted.size}件 (合計: ${totalDeleted})`);
              
              if (deleted.size === 0) {
                await statusMsg.edit(`⚠️ 14日以上前のメッセージは削除できません\n削除済み: ${totalDeleted}件\n\n古いメッセージは \`!cleanup\` を使用してください`);
                break;
              }
              
            } catch (bulkError) {
              console.error('バルク削除エラー:', bulkError);
              await statusMsg.edit(`⚠️ バルク削除エラー: ${bulkError.message}\n削除済み: ${totalDeleted}件`);
              break;
            }
          }
          
          lastMessageId = messages.last()?.id;
        }
        
        await statusMsg.edit(`✅ 完了: ${totalDeleted}件のメッセージを削除しました（バルクモード）`);
        
      } catch (error) {
        console.error('❌ バルク削除エラー:', error);
        await message.channel.send(`❌ エラーが発生しました: ${error.message}`);
      }
    }
    
    // ヘルプコマンド
    if (message.content === '!cleanup-help') {
      const helpMessage = `
**🗑️ メッセージ一括削除コマンド**

**1. 通常削除（すべての期間対応）**
\`\`\`
!cleanup @Bot名 削除件数
\`\`\`
例: \`!cleanup @わなみさん 200\`
- すべての期間のメッセージを削除可能
- 200msごとに1件削除（Rate Limit対策）
- 大量削除に時間がかかる

**2. バルク削除（14日以内限定・高速）**
\`\`\`
!bulkdelete @Bot名 削除件数
\`\`\`
例: \`!bulkdelete @わなみさん 100\`
- 14日以内のメッセージのみ削除可能
- 一括削除で高速処理
- 古いメッセージには使用不可

**注意事項:**
⚠️ 管理者権限が必要
⚠️ 削除したメッセージは復元できません
⚠️ 使用後はこのスクリプトを削除してください
`;
      
      await message.reply(helpMessage);
    }
  });
};
