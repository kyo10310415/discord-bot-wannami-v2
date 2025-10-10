// Discord Bot for わなみさん - VTuber育成スクール相談システム
// Version: 15.2.0 - Gateway+Interactions統合版（メンション機能統合）

const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');

// 設定とサービスのインポート
const env = require('./config/environment');
const logger = require('./utils/logger');
const discordHandler = require('./handlers/discord-handler');
const mentionHandler = require('./handlers/mention-handler');
const buttonHandler = require('./handlers/button-handler');
const { initializeServices } = require('./services/google-apis');

const app = express();

// Discord Client初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// JSONパース用ミドルウェア
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// Discord署名検証関数
function verifySignature(req) {
  const publicKey = env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    logger.error('DISCORD_PUBLIC_KEY環境変数が設定されていません');
    return false;
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  
  if (!signature || !timestamp) {
    logger.error('必要なヘッダーが見つかりません');
    return false;
  }

  const body = req.rawBody || '';
  
  try {
    const isValid = crypto.verify(
      'ed25519',
      Buffer.concat([Buffer.from(timestamp), body]),
      Buffer.from(publicKey, 'hex'),
      Buffer.from(signature, 'hex')
    );
    
    logger.info('署名検証結果:', isValid);
    return isValid;
  } catch (error) {
    logger.error('署名検証エラー:', error);
    return false;
  }
}

// Discord Bot Events
client.once('ready', async () => {
  logger.info(`✅ Discord Bot準備完了: ${client.user.tag}`);
  logger.info(`🔗 サーバー数: ${client.guilds.cache.size}`);
  
  try {
    // Google APIs初期化
    await initializeServices();
    logger.info('✅ Google APIs初期化完了');
  } catch (error) {
    logger.error('❌ Google APIs初期化失敗:', error.message);
  }
  
  // ステータス設定
  client.user.setActivity('VTuber育成スクールサポート', { type: 'WATCHING' });
});

// メンション対応
client.on('messageCreate', async (message) => {
  try {
    await mentionHandler.handleMessage(message, client);
  } catch (error) {
    logger.error('メッセージ処理エラー:', error);
  }
});

// Discord Interactions エンドポイント
app.post('/interactions', async (req, res) => {
  logger.info('=== Discord Interaction受信 ===');
  
  // 署名検証
  if (!verifySignature(req)) {
    logger.error('署名検証失敗');
    return res.status(401).send('署名が無効です');
  }

  const interaction = req.body;

  try {
    // PING応答
    if (interaction.type === 1) {
      logger.info('PING受信 - PONG応答');
      return res.json({ type: 1 });
    }

    // APPLICATION_COMMAND
    if (interaction.type === 2) {
      const response = await discordHandler.handleSlashCommand(interaction);
      return res.json(response);
    }

    // MESSAGE_COMPONENT - ボタンクリック
    if (interaction.type === 3) {
      const response = await buttonHandler.handleButtonClick(interaction, client);
      return res.json(response);
    }

    // その他のInteraction
    logger.warn('未対応のInteractionタイプ:', interaction.type);
    return res.status(400).json({ error: '未対応のInteractionです' });

  } catch (error) {
    logger.error('Interaction処理エラー:', error);
    return res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ヘルスチェックエンドポイント
app.get('/', (req, res) => {
  const status = env.getStatus();
  
  res.json({
    status: 'Discord Bot for わなみさん - Running',
    version: '15.2.0',
    timestamp: new Date().toISOString(),
    environment: {
      node_env: process.env.NODE_ENV || 'development',
      port: env.PORT
    },
    discord: {
      bot_connected: client.isReady(),
      guilds: client.guilds?.cache.size || 0,
      user: client.user?.tag || 'Not connected'
    },
    services: status,
    features: [
      '✅ Discord Gateway接続',
      '✅ Discord Interactions API',
      '✅ @わなみさんメンション対応',
      '✅ /soudanスラッシュコマンド',
      '✅ AI知識ベース統合',
      '✅ 画像解析機能',
      '✅ RAGシステム',
      '✅ モジュール化アーキテクチャ'
    ]
  });
});

// エラーハンドリング
app.use((error, req, res, next) => {
  logger.error('Express エラー:', error);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Discord Client エラーハンドリング
client.on('error', (error) => {
  logger.error('Discord Client エラー:', error);
});

client.on('warn', (warning) => {
  logger.warn('Discord Client 警告:', warning);
});

// サーバー起動
async function startServer() {
  try {
    // Discord Bot接続
    await client.login(env.DISCORD_BOT_TOKEN);
    logger.info('✅ Discord Bot接続完了');
    
    // Express サーバー起動
    app.listen(env.PORT, () => {
      logger.info(`=== Discord Bot Server Started ===`);
      logger.info(`Port: ${env.PORT}`);
      logger.info(`Version: 15.2.0`);
      logger.info(`Node.js: ${process.version}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Discord Token: ${env.DISCORD_BOT_TOKEN ? '設定済み' : '未設定'}`);
      logger.info(`Public Key: ${env.DISCORD_PUBLIC_KEY ? '設定済み' : '未設定'}`);
      logger.info(`Time: ${new Date().toISOString()}`);
      logger.info('=====================================');
    });
    
  } catch (error) {
    logger.error('サーバー起動エラー:', error);
    process.exit(1);
  }
}

// プロセス終了時の処理
process.on('SIGTERM', async () => {
  logger.info('SIGTERM受信 - サーバーを停止します');
  if (client.isReady()) {
    await client.destroy();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT受信 - サーバーを停止します');
  if (client.isReady()) {
    await client.destroy();
  }
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未処理のPromise拒否:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('未処理の例外:', error);
  process.exit(1);
});

// サーバー起動実行
startServer();
