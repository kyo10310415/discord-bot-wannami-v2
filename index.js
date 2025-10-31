// Discord Bot for わなみさん - VTuber育成スクール相談システム
// Version: 15.3.0 - 重複表示・インタラクションエラー修正版

const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType } = require('discord.js');
const crypto = require('crypto');

// 設定とサービスのインポート
const env = require('./config/environment');
const logger = require('./utils/logger');
const discordHandler = require('./handlers/discord-handler');
const mentionHandler = require('./handlers/mention-handler');
const buttonHandler = require('./handlers/button-handler');
const { initializeServices } = require('./services/google-apis');
const { initializeKnowledgeBase } = require('./services/knowledge-base');
const { initializeRAG } = require('./services/rag-system');

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
  logger.startup('Discord Bot for わなみさん', '15.3.0', env.PORT);
  logger.info(`🔗 サーバー数: ${client.guilds.cache.size}`);
  
  try {
    // 各種サービス初期化
    logger.info('🔄 サービス初期化開始...');
    
    // Google APIs初期化
    await initializeServices();
    logger.success('✅ Google APIs初期化完了');
    
    // 知識ベース初期化
    await initializeKnowledgeBase();
    logger.success('✅ 知識ベース初期化完了');
    
    // RAGシステム初期化
    await initializeRAG();
    logger.success('✅ RAGシステム初期化完了');
    
    logger.success('🎉 全サービス初期化完了！');
    
  } catch (error) {
    logger.errorDetail('❌ サービス初期化失敗:', error);
    logger.warn('⚠️ 一部機能が制限される可能性があります');
  }
  
  // ステータス設定
  client.user.setActivity('VTuber育成スクールサポート 🎥✨', { type: 'WATCHING' });
});

// メンション対応（AI知識ベース統合）
client.on('messageCreate', async (message) => {
  try {
    await mentionHandler.handleMessage(message, client);
  } catch (error) {
    logger.errorDetail('メッセージ処理エラー:', error);
  }
});

// ボタンインタラクション対応（Gateway経由）
client.on('interactionCreate', async (interaction) => {
  try {
    // MESSAGE_COMPONENTタイプの判定（Discord.js v14では .isMessageComponent() メソッドを使用）
    if (interaction.isMessageComponent()) {
      logger.discord(`インタラクション受信: ${interaction.customId} by ${interaction.user.username}`);
      
      const response = await buttonHandler.handleButtonClickGateway(interaction, client);
      
      // Gateway経由の場合は直接reply
      if (response && response.data) {
        await interaction.reply({
          content: response.data.content,
          ephemeral: response.data.flags === 64
        });
      }
    }
  } catch (error) {
    logger.errorDetail('インタラクション処理エラー:', error);
    
    // エラーレスポンス
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ 処理中にエラーが発生しました。再度お試しください。',
          ephemeral: true
        });
      }
    } catch (replyError) {
      logger.error('エラー応答送信失敗:', replyError.message);
    }
  }
});

// Discord Interactions エンドポイント
app.post('/interactions', async (req, res) => {
  logger.discord('Discord Interaction受信');
  
  // 署名検証
  if (!verifySignature(req)) {
    logger.security('署名検証失敗');
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

    // MESSAGE_COMPONENT - ボタンクリック（AI統合対応）
    if (interaction.type === 3) {
      const response = await buttonHandler.handleButtonClick(interaction, client);
      return res.json(response);
    }

    // その他のInteraction
    logger.warn('未対応のInteractionタイプ:', interaction.type);
    return res.status(400).json({ error: '未対応のInteractionです' });

  } catch (error) {
    logger.errorDetail('Interaction処理エラー:', error);
    return res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 知識ベース管理エンドポイント
app.get('/api/knowledge-base/status', (req, res) => {
  try {
    const { knowledgeBaseService } = require('./services/knowledge-base');
    const stats = knowledgeBaseService.getStats();
    res.json(stats);
  } catch (error) {
    logger.errorDetail('知識ベース状態取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// 知識ベース手動更新エンドポイント
app.post('/api/knowledge-base/refresh', async (req, res) => {
  try {
    const { knowledgeBaseService } = require('./services/knowledge-base');
    const success = await knowledgeBaseService.forceUpdate();
    res.json({ success, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.errorDetail('知識ベース更新エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// ヘルスチェックエンドポイント（完全版）
app.get('/', (req, res) => {
  try {
    const status = env.getStatus();
    
    // 各サービスの状態取得
    let servicesStatus = {};
    try {
      const { googleAPIsService } = require('./services/google-apis');
      const { openAIService } = require('./services/openai-service');
      const { knowledgeBaseService } = require('./services/knowledge-base');
      const { ragSystem } = require('./services/rag-system');
      
      servicesStatus = {
        google_apis: googleAPIsService.getStatus(),
        openai: openAIService.getStatus(),
        knowledge_base: knowledgeBaseService.getStatus(),
        rag_system: ragSystem.getStatus()
      };
    } catch (serviceError) {
      logger.warn('サービス状態取得エラー:', serviceError.message);
    }
    
    res.json({
      status: 'Discord Bot for わなみさん - Running (Full Version)',
      version: '15.3.0',
      timestamp: new Date().toISOString(),
      environment: {
        node_env: process.env.NODE_ENV || 'development',
        port: env.PORT,
        uptime: Math.floor(process.uptime())
      },
      discord: {
        bot_connected: client.isReady(),
        guilds: client.guilds?.cache.size || 0,
        user: client.user?.tag || 'Not connected',
        latency: client.ws.ping || 0
      },
      environment_vars: status,
      services: servicesStatus,
      features: [
        '✅ Discord Gateway接続',
        '✅ Discord Interactions API',
        '✅ @わなみさんメンション対応（AI統合）',
        '✅ /soudanスラッシュコマンド',
        '✅ AI知識ベース統合（スプレッドシートA-G列対応）',
        '✅ 画像検出・抽出・Vision解析機能',
        '✅ RAGシステム（OpenAI統合）',
        '✅ Notion/WEBサイト読み込み',
        '✅ 文書内画像抽出・AI解析',
        '✅ ロールメンション対応',
        '✅ 知識ベース限定回答システム',
        '✅ 回答不能システム',
        '✅ ミッション特別処理',
        '✅ モジュール化アーキテクチャ',
        '🚀 完全機能版'
      ],
      performance: {
        memory_usage: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        cpu_usage: process.cpuUsage(),
        node_version: process.version
      }
    });
  } catch (error) {
    logger.errorDetail('ヘルスチェックエラー:', error);
    res.status(500).json({ 
      status: 'Error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// エラーハンドリング
app.use((error, req, res, next) => {
  logger.errorDetail('Express エラー:', error);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Discord Client エラーハンドリング
client.on('error', (error) => {
  logger.errorDetail('Discord Client エラー:', error);
});

client.on('warn', (warning) => {
  logger.warn('Discord Client 警告:', warning);
});

client.on('disconnect', () => {
  logger.warn('Discord Client 切断');
});

client.on('reconnecting', () => {
  logger.info('Discord Client 再接続中...');
});

// サーバー起動
async function startServer() {
  try {
    // 環境変数チェック
    if (!env.DISCORD_BOT_TOKEN) {
      throw new Error('DISCORD_BOT_TOKEN環境変数が設定されていません');
    }
    if (!env.DISCORD_PUBLIC_KEY) {
      throw new Error('DISCORD_PUBLIC_KEY環境変数が設定されていません');
    }

    // Discord Bot接続
    logger.info('🔄 Discord Bot接続開始...');
    await client.login(env.DISCORD_BOT_TOKEN);
    logger.success('✅ Discord Bot接続完了');
    
    // Express サーバー起動
    app.listen(env.PORT, () => {
      logger.startup('Discord Bot Server', '15.3.0', env.PORT);
    });
    
  } catch (error) {
    logger.errorDetail('サーバー起動エラー:', error);
    process.exit(1);
  }
}

// プロセス終了時の処理
process.on('SIGTERM', async () => {
  logger.shutdown('Discord Bot for わなみさん', 'SIGTERM受信');
  
  try {
    // 知識ベース自動更新停止
    const { knowledgeBaseService } = require('./services/knowledge-base');
    knowledgeBaseService.stop();
  } catch (error) {
    logger.warn('サービス停止エラー:', error.message);
  }
  
  if (client.isReady()) {
    await client.destroy();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.shutdown('Discord Bot for わなみさん', 'SIGINT受信');
  
  try {
    const { knowledgeBaseService } = require('./services/knowledge-base');
    knowledgeBaseService.stop();
  } catch (error) {
    logger.warn('サービス停止エラー:', error.message);
  }
  
  if (client.isReady()) {
    await client.destroy();
  }
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.errorDetail('未処理のPromise拒否:', reason);
});

process.on('uncaughtException', (error) => {
  logger.errorDetail('未処理の例外:', error);
  process.exit(1);
});

// サーバー起動実行
startServer();
