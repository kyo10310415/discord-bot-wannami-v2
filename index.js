// Discord Bot for わなみさん - VTuber育成スクール相談システム
// Version: 15.3.0 - 動作確認用シンプル統合版

const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const crypto = require('crypto');

// 基本設定
const app = express();
const PORT = process.env.PORT || 3000;

// Discord設定
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const DISCORD_APP_ID = process.env.DISCORD_APPLICATION_ID;
const BOT_USER_ID = process.env.BOT_USER_ID || DISCORD_APP_ID;

// Discord Client初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// JSONパース用ミドルウェア
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ログ関数
function log(level, message, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} [${level.toUpperCase()}] ${message}`, ...args);
}

// Discord署名検証
function verifySignature(req) {
  if (!DISCORD_PUBLIC_KEY) {
    log('error', 'DISCORD_PUBLIC_KEY環境変数が設定されていません');
    return false;
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  
  if (!signature || !timestamp) {
    log('error', '必要なヘッダーが見つかりません');
    return false;
  }

  try {
    const body = req.rawBody || '';
    const isValid = crypto.verify(
      'ed25519',
      Buffer.concat([Buffer.from(timestamp), body]),
      Buffer.from(DISCORD_PUBLIC_KEY, 'hex'),
      Buffer.from(signature, 'hex')
    );
    
    log('info', '署名検証結果:', isValid);
    return isValid;
  } catch (error) {
    log('error', '署名検証エラー:', error.message);
    return false;
  }
}

// 応答作成関数
function createResponse(content, components = null) {
  const response = {
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      content: content,
      flags: 64 // EPHEMERAL
    }
  };
  
  if (components) {
    response.data.components = components;
  }
  
  return response;
}

// ボタン作成
function createButtons() {
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

// ボタン応答定義
const buttonResponses = {
  payment_consultation: `💰 **お支払い相談**

**お支払いに関するご相談を承ります**

🔹 **ご相談内容**
• 分割払いのご希望
• お支払い方法の変更
• 請求書に関するお問い合わせ

🔹 **お急ぎの場合**
LINE: @wannami-school
メール: support@wannami-school.com

わなみさんがサポートします✨`,

  private_consultation: `💬 **プライベート相談**

**プライベートなご相談承ります**

🔹 **ご相談内容**
• VTuber活動への不安や悩み
• 配信内容について
• 活動継続に関する悩み

🔹 **相談時間**
平日 10:00-18:00 / 土日 14:00-20:00

一緒に解決策を見つけましょう💕`,

  lesson_question: `📚 **レッスン質問**

**レッスンに関するご質問をどうぞ！**

🔹 **よくある質問**
• 配信ソフトの設定方法
• Live2Dの操作方法
• 技術的な問題

🔹 **AI知識ベース対応**
✨ **@わなみさん [質問]** でAI回答

技術的な質問も大歓迎です📱`,

  sns_consultation: `📱 **SNS運用相談**

**SNS運用のお悩み解決！**

🔹 **サポート内容**
• Twitter/X の効果的な投稿
• YouTube ショート動画
• ファン獲得戦略

✨ **@わなみさん [相談]** でAI回答

一緒にバズる投稿を作りましょう🚀`,

  mission_submission: `🎯 **ミッション提出**

**ミッション提出お疲れさまです！**

🔹 **提出方法**
• ファイル添付
• URL添付
• テキスト報告

✨ **@わなみさん [内容]** でAIフィードバック

あなたの成長を応援します✨`
};

// Discord Bot Events
client.once('ready', () => {
  log('info', `✅ Discord Bot準備完了: ${client.user.tag}`);
  log('info', `🔗 サーバー数: ${client.guilds.cache.size}`);
  client.user.setActivity('VTuber育成スクールサポート', { type: 'WATCHING' });
});

// メンション対応
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    
    // @わなみさん メンション検出
    const isMentioned = message.mentions.users.has(BOT_USER_ID) || 
                       message.content.includes(`<@${BOT_USER_ID}>`) ||
                       message.content.includes(`<@!${BOT_USER_ID}>`);
    
    if (!isMentioned) return;
    
    log('info', `メンション検出: ${message.author.username}`);
    
    // メンション部分を除去してクエリを抽出
    let userQuery = message.content
      .replace(new RegExp(`<@!?${BOT_USER_ID}>`, 'g'), '')
      .trim();
    
    await message.channel.sendTyping();
    
    let response = `🤖 **わなみさんです！**\n\n`;
    
    if (!userQuery) {
      response += `何かご相談はありますか？\n\`/soudan\` コマンドで相談メニューを表示できます！`;
    } else {
      response += `「${userQuery}」についてのご相談ですね！\n\n`;
      
      // 簡単なキーワード判定
      const query = userQuery.toLowerCase();
      if (query.includes('配信') || query.includes('obs')) {
        response += `🎥 **配信関連のご相談**\n• OBS設定の確認\n• 音声レベルの調整\n• Live2Dの動作確認`;
      } else if (query.includes('live2d')) {
        response += `🎨 **Live2D関連のご相談**\n• モデルの表情設定\n• パラメータ調整\n• VTube Studioとの連携`;
      } else if (query.includes('sns') || query.includes('twitter')) {
        response += `📱 **SNS運用のご相談**\n• 投稿内容の企画\n• フォロワー獲得戦略\n• バズる投稿のコツ`;
      } else {
        response += `ご質問ありがとうございます！\n\`/soudan\` で詳しいサポートメニューをご利用ください。`;
      }
      
      response += `\n\n**詳しいサポート**\n\`/soudan\` で専門的な相談メニューを表示`;
    }
    
    response += `\n\nわなみさんが全力でサポートします！✨`;
    
    await message.reply(response);
    log('info', `応答送信完了: ${message.author.username}`);
    
  } catch (error) {
    log('error', 'メンション処理エラー:', error.message);
    try {
      await message.reply('❌ エラーが発生しました。しばらく待ってから再度お試しください。');
    } catch (replyError) {
      log('error', 'エラー応答送信失敗:', replyError.message);
    }
  }
});

// Discord Interactions エンドポイント
app.post('/interactions', async (req, res) => {
  log('info', '=== Discord Interaction受信 ===');
  
  if (!verifySignature(req)) {
    log('error', '署名検証失敗');
    return res.status(401).send('署名が無効です');
  }

  const interaction = req.body;

  try {
    // PING応答
    if (interaction.type === 1) {
      log('info', 'PING受信 - PONG応答');
      return res.json({ type: 1 });
    }

    // APPLICATION_COMMAND
    if (interaction.type === 2 && interaction.data.name === 'soudan') {
      log('info', '/soudanコマンド実行');
      
      const response = createResponse(
        `🌟 **わなみさんに相談する** 🌟

わなみさんへようこそ！
どのようなご相談でしょうか？

**ご利用方法**
• ボタンを押すと詳細案内が表示されます
• @わなみさん メンションでAI回答も利用可能
• 24時間いつでもご相談ください💕`,
        createButtons()
      );
      
      return res.json(response);
    }

    // MESSAGE_COMPONENT - ボタンクリック
    if (interaction.type === 3) {
      const buttonId = interaction.data.custom_id;
      log('info', `ボタンクリック: ${buttonId}`);
      
      const buttonContent = buttonResponses[buttonId];
      if (buttonContent) {
        const response = createResponse(buttonContent);
        log('info', `ボタン応答送信: ${buttonId}`);
        return res.json(response);
      }
      
      const response = createResponse(
        "申し訳ございません。このボタンは準備中です🙏\n" +
        "他のボタンまたは @わなみさん メンションをお試しください✨"
      );
      return res.json(response);
    }

    log('warn', '未対応のInteractionタイプ:', interaction.type);
    return res.status(400).json({ error: '未対応のInteractionです' });

  } catch (error) {
    log('error', 'Interaction処理エラー:', error.message);
    return res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ヘルスチェックエンドポイント
app.get('/', (req, res) => {
  res.json({
    status: 'Discord Bot for わなみさん - Running',
    version: '15.3.0',
    timestamp: new Date().toISOString(),
    discord: {
      connected: client.isReady(),
      guilds: client.guilds?.cache.size || 0,
      user: client.user?.tag || 'Not connected'
    },
    environment: {
      node_env: process.env.NODE_ENV || 'development',
      port: PORT,
      discord_token: !!DISCORD_TOKEN,
      discord_public_key: !!DISCORD_PUBLIC_KEY
    },
    features: [
      '✅ Discord Gateway接続',
      '✅ Discord Interactions API',
      '✅ @わなみさんメンション対応',
      '✅ /soudanスラッシュコマンド',
      '✅ 5つの相談ボタン',
      '⚡ シンプル統合版（動作確認用）'
    ]
  });
});

// エラーハンドリング
client.on('error', (error) => {
  log('error', 'Discord Client エラー:', error.message);
});

process.on('unhandledRejection', (reason) => {
  log('error', '未処理のPromise拒否:', reason);
});

// サーバー起動
async function startServer() {
  try {
    // 環境変数チェック
    if (!DISCORD_TOKEN) {
      throw new Error('DISCORD_BOT_TOKEN環境変数が設定されていません');
    }
    if (!DISCORD_PUBLIC_KEY) {
      throw new Error('DISCORD_PUBLIC_KEY環境変数が設定されていません');
    }

    // Discord Bot接続
    await client.login(DISCORD_TOKEN);
    log('info', '✅ Discord Bot接続完了');
    
    // Express サーバー起動
    app.listen(PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log('🚀 Discord Bot Server Started Successfully!');
      console.log(`📦 Version: 15.3.0 (Simple Integration)`);
      console.log(`🌐 Port: ${PORT}`);
      console.log(`🕐 Time: ${new Date().toISOString()}`);
      console.log(`🔧 Node.js: ${process.version}`);
      console.log(`🎯 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(50) + '\n');
    });
    
  } catch (error) {
    log('error', 'サーバー起動エラー:', error.message);
    process.exit(1);
  }
}

// プロセス終了処理
process.on('SIGTERM', async () => {
  log('info', 'SIGTERM受信 - サーバーを停止します');
  if (client.isReady()) await client.destroy();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log('info', 'SIGINT受信 - サーバーを停止します');
  if (client.isReady()) await client.destroy();
  process.exit(0);
});

// サーバー起動実行
startServer();
