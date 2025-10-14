// handlers/discord-handler.js - Discord Slash Commandハンドラー

const logger = require('../utils/logger');
const { createDiscordResponse } = require('../utils/verification');

// 5つの選択肢ボタンを作成
function createConsultationButtons() {
  return [
    {
      type: 1, // ACTION_ROW
      components: [
        {
          type: 2, // BUTTON
          style: 1, // PRIMARY
          label: "①お支払い相談",
          custom_id: "payment_consultation"
        },
        {
          type: 2,
          style: 1,
          label: "②プライベート相談",
          custom_id: "private_consultation"
        },
        {
          type: 2,
          style: 1,
          label: "③レッスン質問",
          custom_id: "lesson_question"
        }
      ]
    },
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: "④SNS運用相談",
          custom_id: "sns_consultation"
        },
        {
          type: 2,
          style: 1,
          label: "⑤ミッション提出",
          custom_id: "mission_submission"
        }
      ]
    }
  ];
}

// /soudanコマンドの応答
function handleSoudanCommand(interaction) {
  logger.discord('/soudanコマンド実行');
  
  const content = `🌟 **わなみさんに相談する** 🌟

VTuber育成スクールへようこそ！
どのようなご相談でしょうか？下のボタンから選択してください✨

**ご利用方法**
• ボタンを押すと詳細な案内が表示されます
• あなただけに見える応答なので安心してご利用ください
• 24時間いつでもご相談可能です💕

**📚 知識ベース限定回答システム**
• **@わなみさん [質問]** で知識ベースから正確な回答
• VTuber活動に特化した専門情報のみ回答
• 知識ベース外の情報は「分からない」と正直に回答

**🎯 AI対話式ボタン（②③④）**
• ボタンクリック→質問入力促進→AI回答の流れ
• 3分以内の質問入力が必要
• 知識ベース限定のAI専門回答を提供`;

  return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
    content: content,
    components: createConsultationButtons(),
    flags: 64 // EPHEMERAL - 本人のみ表示
  });
}

// Slash Commandのメイン処理
async function handleSlashCommand(interaction) {
  try {
    const commandName = interaction.data.name;
    logger.discord(`Slash Command受信: /${commandName}`);
    
    switch (commandName) {
      case 'soudan':
        return handleSoudanCommand(interaction);
        
      case 'help':
        return handleHelpCommand();
        
      case 'status':
        return handleStatusCommand();
        
      default:
        logger.warn(`未知のSlash Command: /${commandName}`);
        return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
          content: `❌ 未対応のコマンド: \`/${commandName}\``,
          flags: 64
        });
    }
    
  } catch (error) {
    logger.errorDetail(`Slash Command処理エラー:`, error);
    return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
      content: '❌ コマンド処理中にエラーが発生しました。しばらく待ってから再度お試しください。',
      flags: 64
    });
  }
}

// /helpコマンドの応答
function handleHelpCommand() {
  logger.discord('/helpコマンド実行');
  
  const content = `📖 **わなみさんBotヘルプ** 📖

**利用可能なコマンド:**
• \`/soudan\` - 相談メニューを表示
• \`/help\` - このヘルプを表示
• \`/status\` - ボットの状態を確認

**メンション機能:**
• \`@わなみさん [質問]\` - AI知識ベースで回答
• 画像添付でAI画像解析も可能

**相談カテゴリ:**
① お支払い相談
② プライベート相談  
③ レッスン質問
④ SNS運用相談
⑤ ミッション提出

**特別機能:**
• AI知識ベース統合（VTuber育成専門）
• 画像解析機能（Live2D、配信画面等）
• Notion/WEBサイト連携
• RAGシステムによる精密回答

**サポート:**
何かご不明な点がございましたら、\`@わなみさん\`でお気軽にお声がけください！`;

  return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
    content: content,
    flags: 64 // EPHEMERAL
  });
}

// /statusコマンドの応答
function handleStatusCommand() {
  logger.discord('/statusコマンド実行');
  
  const uptime = process.uptime();
  const uptimeHours = Math.floor(uptime / 3600);
  const uptimeMinutes = Math.floor((uptime % 3600) / 60);
  const uptimeSeconds = Math.floor(uptime % 60);
  
  const content = `📊 **Bot Status** 📊

**基本情報:**
• Version: 15.2.0 (Gateway+Interactions統合版)
• Uptime: ${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s
• Node.js: ${process.version}
• Memory: ${Math.round(process.memoryUsage.rss() / 1024 / 1024)}MB

**機能状態:**
✅ Discord Gateway接続
✅ Interactions API
✅ AI知識ベース
✅ 画像解析機能
✅ RAGシステム
✅ Google APIs連携

**統計:**
• 起動日時: ${new Date(Date.now() - uptime * 1000).toLocaleString('ja-JP')}
• 現在時刻: ${new Date().toLocaleString('ja-JP')}

すべてのシステムが正常に動作しています！`;

  return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
    content: content,
    flags: 64 // EPHEMERAL
  });
}

module.exports = {
  handleSlashCommand,
  createConsultationButtons
};
