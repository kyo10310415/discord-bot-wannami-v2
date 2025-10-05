const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

const BOT_USER_ID = '1420328163497607199';
const ROLE_ID = '1420336261817831464'; // わなみさんロールID

client.on('ready', () => {
  console.log(`✅ ${client.user.tag} メッセージ監視開始`);
});

client.on('messageCreate', async (message) => {
  console.log(`📨 メッセージ受信: ${message.author.username} - "${message.content}"`);
  
  // Bot自身のメッセージは無視
  if (message.author.bot) {
    console.log('🤖 Bot投稿のためスキップ');
    return;
  }
  
  // メンション検出（ユーザーメンション + ロールメンション）
  const botUserMentioned = message.mentions.users.has(BOT_USER_ID) || 
                          message.content.includes(`<@${BOT_USER_ID}>`) ||
                          message.content.includes(`<@!${BOT_USER_ID}>`);
  
  const roleMentioned = message.mentions.roles.has(ROLE_ID);
  
  const isMentioned = botUserMentioned || roleMentioned;
  
  if (isMentioned) {
    // ログ出力を詳細化
    if (botUserMentioned) {
      console.log(`👤 Bot直接メンション検出: ${message.author.username} - "${message.content}"`);
    } else if (roleMentioned) {
      console.log(`🎭 ロールメンション検出: ${message.author.username} - "${message.content}"`);
    }
    
    try {
      // Discord APIで選択肢メニューを直接送信
      await message.channel.send({
        content: `こんにちは <@${message.author.id}>さん！\nどのようなご相談でしょうか？以下から選択してください：`,
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
      });
      
      console.log('✅ 選択肢メニュー送信完了');
      
    } catch (error) {
      console.error('❌ メニュー送信エラー:', error.message);
      console.error('詳細:', error);
    }
  } else {
    console.log('🔍 メンションなし - 処理スキップ');
  }
});

// エラーハンドリング
client.on('error', error => {
  console.error('❌ Discord Client エラー:', error);
});

// Discord Botログイン（デバッグ付き）
const token = process.env.DISCORD_TOKEN;
console.log('🔑 Discord Token確認:', token ? `設定済み (${token.length}文字)` : '未設定');

if (!token) {
  console.error('❌ DISCORD_TOKEN環境変数が設定されていません');
  process.exit(1);
}

client.login(token);
