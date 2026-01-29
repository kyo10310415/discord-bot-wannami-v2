// Discord Bot for わなみさん - VTuber育成スクール相談システム
// Version: 16.0.0 - Q&A自動生成・週次送信機能追加版

const express = require('express');
const cookieParser = require('cookie-parser');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType } = require('discord.js');
const crypto = require('crypto');

// SSO Authentication
const ssoAuthMiddleware = require('./middleware/sso-auth-middleware');

// 設定とサービスのインポート
const env = require('./config/environment');
const logger = require('./utils/logger');
const discordHandler = require('./handlers/discord-handler');
const mentionHandler = require('./handlers/mention-handler');
const buttonHandler = require('./handlers/button-handler');
const { initializeServices } = require('./services/google-apis');
const knowledgeBase = require('./services/knowledge-base');
const { initializeRAG } = require('./services/rag-system');
const { qaLoggerService } = require('./services/qa-logger');

// 新機能: Q&A自動生成・週次送信サービス
const { qaGeneratorService } = require('./services/qa-generator');
const { qaAutomationService } = require('./services/qa-automation');
const { discordWebhookService } = require('./services/discord-webhook');
const { weeklySchedulerService } = require('./services/weekly-scheduler');

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
app.use(cookieParser());

/**
 * ✅ Render Web Service向け：超軽量ヘルスチェック
 * - SSO認証も不要
 * - Discord接続やGoogle初期化が詰まっても、まずPORTを開ける
 */
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

// SSO Authentication (must be before routes, except /interactions and /healthz)
app.use((req, res, next) => {
  // Skip SSO auth for Discord interaction endpoint + health check endpoint
  if (req.path === '/interactions' || req.path === '/healthz') {
    return next();
  }
  ssoAuthMiddleware(req, res, next);
});

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
  logger.startup('Discord Bot for わなみさん', '15.5.0', env.PORT);
  logger.info(`🔗 サーバー数: ${client.guilds.cache.size}`);
  
  // Bot User IDの確認と検証
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.info('🆔 Bot User ID 確認');
  logger.info(`  実際のBot User ID: ${client.user.id}`);
  
  const configuredBotId = process.env.BOT_USER_ID || '1420328163497607199';
  logger.info(`  設定されたBOT_USER_ID: ${configuredBotId}`);
  
  if (client.user.id === configuredBotId) {
    logger.success('  ✅ Bot User IDが正しく設定されています');
  } else {
    logger.error('  ❌ Bot User IDが一致しません！');
    logger.error(`     実際のID: ${client.user.id}`);
    logger.error(`     設定値: ${configuredBotId}`);
    logger.error('     → 環境変数のBOT_USER_IDを修正してください');
  }
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // 各種サービス初期化
    logger.info('🔄 サービス初期化開始...');
    
    // Google APIs初期化
    await initializeServices();
    logger.success('✅ Google APIs初期化完了');
    
    // 知識ベース初期化
    await knowledgeBase.initialize();
    logger.success('✅ 知識ベース初期化完了');
    
    // RAGシステム初期化
    await initializeRAG();
    logger.success('✅ RAGシステム初期化完了');
    
    // Q&A記録サービス初期化
    if (env.QA_SPREADSHEET_ID) {
      try {
        await qaLoggerService.initialize(env.QA_SPREADSHEET_ID);
        logger.success('✅ Q&A記録サービス初期化完了');
      } catch (error) {
        logger.error('❌ Q&A記録サービス初期化失敗:', error.message);
        logger.warn('⚠️ Q&A記録機能は無効です');
      }
    } else {
      logger.warn('⚠️ QA_SPREADSHEET_IDが設定されていません。Q&A記録機能は無効です。');
    }
    
    // Q&A自動生成サービス初期化
    try {
      await qaGeneratorService.initialize();
      logger.success('✅ Q&A自動生成サービス初期化完了');
    } catch (error) {
      logger.error('❌ Q&A自動生成サービス初期化失敗:', error.message);
      logger.warn('⚠️ Q&A自動生成機能は無効です');
    }
    
    // Discord Webhook送信サービス初期化
    try {
      await discordWebhookService.initialize();
      logger.success('✅ Discord Webhook送信サービス初期化完了');
    } catch (error) {
      logger.error('❌ Discord Webhook送信サービス初期化失敗:', error.message);
      logger.warn('⚠️ Webhook送信機能は無効です');
    }
    
    // 週次スケジューラー開始
    try {
      weeklySchedulerService.start();
      logger.success('✅ 週次スケジューラー開始完了');
    } catch (error) {
      logger.error('❌ 週次スケジューラー開始失敗:', error.message);
      logger.warn('⚠️ 定期実行機能は無効です');
    }
    
    logger.success('🎉 全サービス初期化完了！');
    
  } catch (error) {
    logger.errorDetail('❌ サービス初期化失敗:', error);
    logger.warn('⚠️ 一部機能が制限される可能性があります');
  }
  
  // ステータス設定
  client.user.setActivity('VTuber育成スクールサポート 🎥✨', { type: 'WATCHING' });
});

// メンション対応（AI知識ベース統合 + Q&A記録）
client.on('messageCreate', async (message) => {
  try {
    await mentionHandler.handleMessageWithQALogging(
      message,
      client,
      qaLoggerService
    );
  } catch (error) {
    logger.errorDetail('メッセージ処理エラー:', error);
  }
});

// ボタンインタラクション対応（Gateway経由）
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isMessageComponent()) {
      logger.discord(`インタラクション受信: ${interaction.customId} by ${interaction.user.username}`);
      
      const response = await buttonHandler.handleButtonClickGateway(interaction, client);
      
      if (response && response.data) {
        await interaction.reply({
          content: response.data.content,
          ephemeral: response.data.flags === 64
        });
      }
    }
  } catch (error) {
    logger.errorDetail('インタラクション処理エラー:', error);
    
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
  
  if (!verifySignature(req)) {
    logger.security('署名検証失敗');
    return res.status(401).send('署名が無効です');
  }

  const interaction = req.body;

  try {
    if (interaction.type === 1) {
      logger.info('PING受信 - PONG応答');
      return res.json({ type: 1 });
    }

    if (interaction.type === 2) {
      const response = await discordHandler.handleSlashCommand(interaction);
      return res.json(response);
    }

    if (interaction.type === 3) {
      const response = await buttonHandler.handleButtonClick(interaction, client);
      return res.json(response);
    }

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
    const stats = knowledgeBase.getStats();
    res.json(stats);
  } catch (error) {
    logger.errorDetail('知識ベース状態取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// 知識ベース手動更新エンドポイント
app.post('/api/knowledge-base/refresh', async (req, res) => {
  try {
    const success = await knowledgeBase.buildKnowledgeBase();
    res.json({ success: !!success, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.errorDetail('知識ベース更新エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// Q&A記録統計エンドポイント
app.get('/api/qa-log/stats', async (req, res) => {
  try {
    const stats = await qaLoggerService.getStats();
    res.json(stats || { error: 'Q&A記録サービスが初期化されていません' });
  } catch (error) {
    logger.errorDetail('Q&A統計取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🆕 Q&A自動生成・週次送信機能 エンドポイント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get('/api/qa-generator/status', (req, res) => {
  try {
    const status = qaGeneratorService.getStatus();
    res.json(status);
  } catch (error) {
    logger.errorDetail('Q&A生成サービス状態取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

app.get('/api/qa-generator/count', async (req, res) => {
  try {
    const count = await qaGeneratorService.getSampleCount();
    res.json({ count, target: 30, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.errorDetail('Q&Aサンプル件数取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

app.post('/api/qa-generator/generate-one', async (req, res) => {
  try {
    const result = await qaGeneratorService.generateAndSaveOne();
    res.json({ success: true, result, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.errorDetail('Q&Aペア生成エラー:', error);
    res.status(500).json({ error: 'サービスエラー', message: error.message });
  }
});

app.post('/api/qa-automation/run', async (req, res) => {
  try {
    const result = await qaAutomationService.runGenerationTask();
    res.json(result);
  } catch (error) {
    logger.errorDetail('Q&A自動化タスクエラー:', error);
    res.status(500).json({ error: 'サービスエラー', message: error.message });
  }
});

app.post('/api/qa-automation/generate-full-set', async (req, res) => {
  try {
    res.json({
      message: 'フルセット生成タスクを開始しました',
      target: 30,
      note: 'バックグラウンドで処理が進行しています。進捗は /api/qa-generator/count で確認できます。',
      timestamp: new Date().toISOString()
    });

    qaAutomationService.generateFullSet().catch(error => {
      logger.errorDetail('バックグラウンドフルセット生成エラー:', error);
    });

  } catch (error) {
    logger.errorDetail('フルセット生成エラー:', error);
    res.status(500).json({ error: 'サービスエラー', message: error.message });
  }
});

app.post('/api/webhook/send-weekly', async (req, res) => {
  try {
    const result = await weeklySchedulerService.executeWeeklyTaskManually();
    res.json(result);
  } catch (error) {
    logger.errorDetail('週次送信タスクエラー:', error);
    res.status(500).json({ error: 'サービスエラー', message: error.message });
  }
});

app.post('/api/webhook/send-test', async (req, res) => {
  try {
    const { webhookUrl, discordId } = req.body;
    
    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrl は必須です' });
    }

    const result = await discordWebhookService.sendTestMessage(webhookUrl, discordId);
    res.json(result);
  } catch (error) {
    logger.errorDetail('テスト送信エラー:', error);
    res.status(500).json({ error: 'サービスエラー', message: error.message });
  }
});

app.get('/api/webhook/status', (req, res) => {
  try {
    const status = discordWebhookService.getStatus();
    res.json(status);
  } catch (error) {
    logger.errorDetail('Webhookサービス状態取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

app.get('/api/scheduler/status', (req, res) => {
  try {
    const status = weeklySchedulerService.getStatus();
    res.json(status);
  } catch (error) {
    logger.errorDetail('スケジューラー状態取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// Bot User ID 確認エンドポイント
app.get('/api/bot/user-id', (req, res) => {
  try {
    const actualId = client.user?.id || 'Bot未接続';
    const configuredId = process.env.BOT_USER_ID || '1420328163497607199';
    const isMatch = actualId === configuredId;
    
    res.json({
      actual_bot_user_id: actualId,
      configured_bot_user_id: configuredId,
      is_match: isMatch,
      status: isMatch ? '✅ 正常' : '❌ 不一致',
      recommendation: isMatch ? 
        'Bot User IDは正しく設定されています' : 
        `環境変数 BOT_USER_ID を ${actualId} に変更してください`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.errorDetail('Bot User ID確認エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// ヘルスチェックエンドポイント（完全版）
app.get('/', (req, res) => {
  try {
    const status = env.getStatus();
    
    const actualBotId = client.user?.id || 'Not connected';
    const configuredBotId = process.env.BOT_USER_ID || '1420328163497607199';
    const botIdMatch = actualBotId === configuredBotId;
    
    let servicesStatus = {};
    try {
      const { googleAPIsService } = require('./services/google-apis');
      const { openAIService } = require('./services/openai-service');
      const { ragSystem } = require('./services/rag-system');
      
      servicesStatus = {
        google_apis: googleAPIsService.getStatus(),
        openai: openAIService.getStatus(),
        knowledge_base: knowledgeBase.getStatus(),
        rag_system: ragSystem.getStatus(),
        qa_logger: {
          initialized: qaLoggerService.isInitialized,
          spreadsheet_id: env.QA_SPREADSHEET_ID ? '設定済み' : '未設定'
        },
        qa_generator: qaGeneratorService.getStatus(),
        qa_automation: qaAutomationService.getStatus(),
        discord_webhook: discordWebhookService.getStatus(),
        weekly_scheduler: weeklySchedulerService.getStatus()
      };
    } catch (serviceError) {
      logger.warn('サービス状態取得エラー:', serviceError.message);
    }
    
    res.json({
      status: 'Discord Bot for わなみさん - Running (Full Version + QA Automation)',
      version: '16.0.0',
      timestamp: new Date().toISOString(),
      environment: {
        node_env: process.env.NODE_ENV || 'development',
        port: env.PORT,
        uptime: Math.floor(process.uptime()),
        log_level: process.env.LOG_LEVEL || 'info'
      },
      discord: {
        bot_connected: client.isReady(),
        guilds: client.guilds?.cache.size || 0,
        user: client.user?.tag || 'Not connected',
        latency: client.ws.ping || 0,
        bot_user_id: {
          actual: actualBotId,
          configured: configuredBotId,
          match: botIdMatch,
          status: botIdMatch ? '✅ 正常' : '❌ 不一致'
        }
      },
      environment_vars: status,
      services: servicesStatus
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
    // ✅ 先にExpressを起動してPORTを開ける（Render対策）
    app.listen(env.PORT, '0.0.0.0', () => {
      logger.success(`🌐 Expressサーバー起動: ポート ${env.PORT}`);
      logger.info(`   ✅ Health check: GET /healthz`);
      logger.info('');
      logger.info('📊 利用可能なエンドポイント（一部）:');
      logger.info(`   GET  / - ヘルスチェック（完全版）`);
      logger.info(`   POST /interactions - Discord Interactions`);
      logger.info('');
    });

    // 環境変数チェック
    if (!env.DISCORD_BOT_TOKEN) {
      throw new Error('DISCORD_BOT_TOKEN環境変数が設定されていません');
    }
    if (!env.DISCORD_PUBLIC_KEY) {
      throw new Error('DISCORD_PUBLIC_KEY環境変数が設定されていません');
    }

    // Discord Bot接続（PORTは既に開いているので、ここで詰まってもデプロイは進む）
    logger.info('🔄 Discord Bot接続開始...');
    await client.login(env.DISCORD_BOT_TOKEN);
    logger.success('✅ Discord Bot接続完了');
    
  } catch (error) {
    logger.errorDetail('サーバー起動エラー:', error);
    process.exit(1);
  }
}

// プロセス終了時の処理
process.on('SIGTERM', async () => {
  logger.shutdown('Discord Bot for わなみさん', 'SIGTERM受信');
  
  try {
    weeklySchedulerService.stop();
    
    if (knowledgeBase.knowledgeBaseService && typeof knowledgeBase.knowledgeBaseService.stop === 'function') {
      knowledgeBase.knowledgeBaseService.stop();
    }
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
    weeklySchedulerService.stop();
    
    if (knowledgeBase.knowledgeBaseService && typeof knowledgeBase.knowledgeBaseService.stop === 'function') {
      knowledgeBase.knowledgeBaseService.stop();
    }
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚨 緊急用：メッセージ一括削除機能（一時的）
// 使用後は必ずこのセクションを削除すること
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
try {
  const cleanupScript = require('./cleanup-bot-messages');
  cleanupScript(client);
  logger.success('🗑️ メッセージ一括削除機能を有効化');
} catch (error) {
  logger.warn('⚠️ 削除スクリプト読み込みエラー:', error.message);
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// サーバー起動実行
startServer();
