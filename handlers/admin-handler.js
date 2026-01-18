// handlers/admin-handler.js - 管理者用コマンドハンドラー

const logger = require('../utils/logger');
const { createDiscordResponse } = require('../utils/verification');
const { knowledgeScheduler } = require('../services/knowledge-scheduler');
const { knowledgeBaseService } = require('../services/knowledge-base');

// 管理者権限チェック（管理者ユーザーIDを環境変数から取得）
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '').split(',').filter(id => id.trim());

function isAdmin(userId) {
  return ADMIN_USER_IDS.includes(userId);
}

// 知識ベース管理コマンド処理
async function handleKnowledgeCommand(interaction) {
  try {
    const user = interaction.user || interaction.member?.user;
    
    if (!isAdmin(user?.id)) {
      return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
        content: '❌ このコマンドは管理者のみ実行可能です。',
        flags: 64 // EPHEMERAL
      });
    }

    const subcommand = interaction.data.options?.[0]?.name;
    
    switch (subcommand) {
      case 'status':
        return await handleKnowledgeStatus();
        
      case 'update':
        return await handleKnowledgeUpdate();
        
      case 'schedule':
        return await handleKnowledgeSchedule();
        
      default:
        return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
          content: '❌ 不明なサブコマンドです。',
          flags: 64
        });
    }
    
  } catch (error) {
    logger.errorDetail('知識ベース管理コマンドエラー:', error);
    
    return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
      content: '❌ コマンド処理中にエラーが発生しました。',
      flags: 64
    });
  }
}

// 知識ベース状態確認
async function handleKnowledgeStatus() {
  try {
    const schedulerStatus = knowledgeScheduler.getStatus();
    const kbStats = knowledgeBaseService.getStats();
    
    let content = `📊 **知識ベース状態**\n\n`;
    
    // 知識ベース統計
    content += `**📚 知識ベース統計:**\n`;
    content += `• 文書数: ${kbStats.totalDocuments || 0}個\n`;
    content += `• 総文字数: ${(kbStats.totalCharacters || 0).toLocaleString()}文字\n`;
    content += `• 画像数: ${kbStats.totalImages || 0}枚\n\n`;
    
    // スケジューラー状態
    content += `**⏰ 自動更新スケジューラー:**\n`;
    content += `• 状態: ${schedulerStatus.isRunning ? '✅ 稼働中' : '❌ 停止中'}\n`;
    content += `• 更新中: ${schedulerStatus.updateInProgress ? '🔄 更新中' : '⭕ 待機中'}\n`;
    content += `• スケジュール: 毎週月曜日 午前3時 (JST)\n\n`;
    
    // 更新履歴
    if (schedulerStatus.lastUpdate) {
      content += `• 最終更新: ${schedulerStatus.lastUpdate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n`;
    }
    
    if (schedulerStatus.nextUpdate) {
      content += `• 次回更新: ${schedulerStatus.nextUpdate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\n`;
    }
    
    return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
      content: content,
      flags: 64 // EPHEMERAL
    });
    
  } catch (error) {
    logger.errorDetail('知識ベース状態確認エラー:', error);
    
    return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
      content: '❌ 状態確認中にエラーが発生しました。',
      flags: 64
    });
  }
}

// 手動知識ベース更新
async function handleKnowledgeUpdate() {
  try {
    const schedulerStatus = knowledgeScheduler.getStatus();
    
    if (schedulerStatus.updateInProgress) {
      return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
        content: '⚠️ 知識ベース更新が既に進行中です。しばらくお待ちください。',
        flags: 64
      });
    }
    
    // 更新開始の通知
    const startResponse = createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
      content: '🔄 手動知識ベース更新を開始します...\n\n更新完了まで数分かかる場合があります。',
      flags: 64
    });
    
    // バックグラウンドで更新実行
    knowledgeScheduler.performManualUpdate().then(() => {
      logger.info('✅ 手動知識ベース更新完了');
    }).catch((error) => {
      logger.errorDetail('手動知識ベース更新エラー:', error);
    });
    
    return startResponse;
    
  } catch (error) {
    logger.errorDetail('手動知識ベース更新エラー:', error);
    
    return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
      content: '❌ 手動更新開始中にエラーが発生しました。',
      flags: 64
    });
  }
}

// スケジューラー管理
async function handleKnowledgeSchedule() {
  try {
    const schedulerStatus = knowledgeScheduler.getStatus();
    
    let content = `⏰ **知識ベース自動更新スケジューラー**\n\n`;
    content += `**現在の状態:** ${schedulerStatus.isRunning ? '✅ 稼働中' : '❌ 停止中'}\n`;
    content += `**スケジュール:** 毎週月曜日 午前3時 (日本時間)\n`;
    content += `**タイムゾーン:** Asia/Tokyo\n\n`;
    
    if (schedulerStatus.nextUpdate) {
      content += `**次回実行予定:**\n${schedulerStatus.nextUpdate.toLocaleString('ja-JP', { 
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit'
      })}\n\n`;
    }
    
    content += `**機能:**\n`;
    content += `• 知識データベーススプレッドシートから最新情報を自動取得\n`;
    content += `• Google Docs、Slides、Notion等の更新を反映\n`;
    content += `• 更新結果をログに記録\n`;
    content += `• エラー発生時の自動通知\n\n`;
    
    content += `**手動操作:**\n`;
    content += `• \`/knowledge update\` - 即座に手動更新実行\n`;
    content += `• \`/knowledge status\` - 現在の状態確認`;
    
    return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
      content: content,
      flags: 64
    });
    
  } catch (error) {
    logger.errorDetail('スケジューラー情報取得エラー:', error);
    
    return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
      content: '❌ スケジューラー情報取得中にエラーが発生しました。',
      flags: 64
    });
  }
}

module.exports = {
  handleKnowledgeCommand,
  isAdmin
};
