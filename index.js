// Discord Bot for わなみさん - VTuber育成スクール相談システム
// Version: 16.3.1 - YouTube企画提案機能追加版（ボタン連動修正）
// Feature: YouTube Data APIを使用したチャンネル分析・企画提案機能
// Hotfix: Discord login timeout でも落とさず再試行（Render のデプロイループ停止）
// Hotfix2: DISCORD状態ログの多重 setInterval を抑止 + リトライ間隔の整合（5分開始/最大30分）
// Hotfix3: タイムアウトを60秒に延長 + 認証エラー判定強化（Renderネットワーク遅延対策）
// Feature: Slack通知機能（Discord接続エラー時に自動通知）

require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType } = require('discord.js');
const crypto = require('crypto');

// SSO Authentication
const ssoAuthMiddleware = require('./middleware/sso-auth-middleware');
const { requireAdmin, requireAdminRequestHeader } = require('./middleware/admin-auth-middleware');
const adminKnowledgeSourcesRouter = require('./routes/admin-knowledge-sources');

// 設定とサービスのインポート
const env = require('./config/environment');
const logger = require('./utils/logger');
const discordHandler = require('./handlers/discord-handler');
const mentionHandler = require('./handlers/mention-handler');
const buttonHandler = require('./handlers/button-handler');
const knowledgeBase = require('./services/knowledge-base');
const { initializeKnowledgeServices } = require('./services/knowledge-service-initializer');
const { qaLoggerService } = require('./services/qa-logger');

// 新機能: Q&A自動生成・週次送信サービス
const { qaGeneratorService } = require('./services/qa-generator');
const { qaAutomationService } = require('./services/qa-automation');
const { discordWebhookService } = require('./services/discord-webhook');
const { weeklySchedulerService } = require('./services/weekly-scheduler');

// 新機能: Slack通知サービス
const { slackNotifier } = require('./services/slack-notifier');

// 新機能: YouTube分析サービス
const { youtubeAnalyzer } = require('./services/youtube-analyzer');
const { closePool } = require('./db/pool');

const app = express();

// Discord Client初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  // ✅ WebSocket接続設定を明示的に指定（Render環境対策）
  ws: {
    large_threshold: 50,
    compress: true,
    properties: {
      browser: 'Discord.js',
      device: 'render-bot'
    }
  },
  // ✅ 接続タイムアウトを延長
  rest: {
    timeout: 30000,
    retries: 3
  }
});

// ✅ 追加: Discord接続のデバッグログ（原因特定用）
client.on('ready', () => {
  try {
    logger.success(`✅ [DISCORD] ready fired: ${client.user?.tag || 'unknown'} (${client.user?.id || 'unknown'})`);
  } catch (e) {
    console.log('✅ [DISCORD] ready fired');
  }
});

client.on('error', (e) => {
  logger.errorDetail('❌ [DISCORD] client error:', e);
});

client.on('shardError', (e) => {
  logger.errorDetail('❌ [DISCORD] shardError:', e);
});

client.on('invalidated', () => {
  logger.error('❌ [DISCORD] session invalidated');
});

// ✅ 追加: shard/gateway 詳細ログ（原因確定用）
client.on('debug', (m) => {
  // Gateway接続関連のログのみ出力（ノイズ削減）
  if (m.includes('Preparing to connect') || 
      m.includes('Identifying') || 
      m.includes('Waiting for') ||
      m.includes('Gateway') ||
      m.includes('Session Limit') ||
      m.includes('READY') ||
      m.includes('error') ||
      m.includes('close')) {
    logger.info(`🐛 [DISCORD DEBUG] ${m}`);
  }
});
client.on('shardReady', (id) => logger.success(`✅ [DISCORD] shardReady: ${id}`));
client.on('shardDisconnect', (event, id) => {
  logger.warn(`⚠️ [DISCORD] shardDisconnect: ${id} code=${event?.code} reason=${event?.reason}`);
});
client.on('shardReconnecting', (id) => logger.info(`🔄 [DISCORD] shardReconnecting: ${id}`));
client.on('rateLimit', (info) => logger.warn(`⏱️ [DISCORD] rateLimit: ${JSON.stringify(info)}`));

// JSONパース用ミドルウェア
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(cookieParser());

// ✅ 追加: Render向け超軽量ヘルスチェック（SSO不要）
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

// SSO Authentication (must be before routes, except /interactions for Discord)
app.use((req, res, next) => {
  // Skip SSO auth for Discord interaction endpoint
  if (req.path === '/interactions' || req.path === '/healthz') {
    return next();
  }
  ssoAuthMiddleware(req, res, next);
});

// AI回答用ナレッジソース管理画面（管理者のみ）
app.get('/admin/sources', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'sources.html'));
});
app.use('/admin', requireAdmin, express.static(path.join(__dirname, 'public', 'admin')));
app.use(
  '/api/admin/knowledge-sources',
  requireAdmin,
  requireAdminRequestHeader,
  adminKnowledgeSourcesRouter
);

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

    // Web管理画面と共通の知識ベース・RAG初期化
    await initializeKnowledgeServices();
    logger.success('✅ 知識ベース・RAGシステム初期化完了');

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

    // YouTube分析サービス初期化
    try {
      const ytInitialized = youtubeAnalyzer.initialize();
      if (ytInitialized) {
        logger.success('✅ YouTube分析サービス初期化完了');
      } else {
        logger.warn('⚠️ YouTube分析サービスは無効です（YOUTUBE_API_KEY未設定）');
      }
    } catch (error) {
      logger.error('❌ YouTube分析サービス初期化失敗:', error.message);
      logger.warn('⚠️ YouTube企画提案機能は無効です');
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
    // Q&A記録対応版のハンドラーを呼び出し
    // ハンドラー内でメンション判定、質問抽出、無限ループ対策を実施
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
    // MESSAGE_COMPONENTタイプの判定
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

// Q&A自動生成サービスステータス
app.get('/api/qa-generator/status', (req, res) => {
  try {
    const status = qaGeneratorService.getStatus();
    res.json(status);
  } catch (error) {
    logger.errorDetail('Q&A生成サービス状態取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// Q&Aサンプル件数取得
app.get('/api/qa-generator/count', async (req, res) => {
  try {
    const count = await qaGeneratorService.getSampleCount();
    res.json({ count, target: 30, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.errorDetail('Q&Aサンプル件数取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// Q&Aペア手動生成（テスト用）
app.post('/api/qa-generator/generate-one', async (req, res) => {
  try {
    const result = await qaGeneratorService.generateAndSaveOne();
    res.json({ success: true, result, timestamp: new Date().toISOString() });
  } catch (error) {
    logger.errorDetail('Q&Aペア生成エラー:', error);
    res.status(500).json({ error: 'サービスエラー', message: error.message });
  }
});

// Q&A自動化タスク実行（30個未満の場合に補充）
app.post('/api/qa-automation/run', async (req, res) => {
  try {
    const result = await qaAutomationService.runGenerationTask();
    res.json(result);
  } catch (error) {
    logger.errorDetail('Q&A自動化タスクエラー:', error);
    res.status(500).json({ error: 'サービスエラー', message: error.message });
  }
});

// フルセット生成（30個強制生成・初回セットアップ用）
app.post('/api/qa-automation/generate-full-set', async (req, res) => {
  try {
    // すぐにレスポンスを返す（バックグラウンドで実行）
    res.json({
      message: 'フルセット生成タスクを開始しました',
      target: 30,
      note: 'バックグラウンドで処理が進行しています。進捗は /api/qa-generator/count で確認できます。',
      timestamp: new Date().toISOString()
    });

    // バックグラウンドで実行
    qaAutomationService.generateFullSet().catch(error => {
      logger.errorDetail('バックグラウンドフルセット生成エラー:', error);
    });

  } catch (error) {
    logger.errorDetail('フルセット生成エラー:', error);
    res.status(500).json({ error: 'サービスエラー', message: error.message });
  }
});

// 週次送信タスク手動実行（テスト用）
app.post('/api/webhook/send-weekly', async (req, res) => {
  try {
    const result = await weeklySchedulerService.executeWeeklyTaskManually();
    res.json(result);
  } catch (error) {
    logger.errorDetail('週次送信タスクエラー:', error);
    res.status(500).json({ error: 'サービスエラー', message: error.message });
  }
});

// テスト用: 特定のWebhookに1件送信
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

// Webhook送信サービスのステータス確認
app.get('/api/webhook/status', (req, res) => {
  try {
    const status = discordWebhookService.getStatus();
    res.json(status);
  } catch (error) {
    logger.errorDetail('Webhookサービス状態取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// スケジューラーステータス
app.get('/api/scheduler/status', (req, res) => {
  try {
    const status = weeklySchedulerService.getStatus();
    res.json(status);
  } catch (error) {
    logger.errorDetail('スケジューラー状態取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🆕 Slack通知機能 エンドポイント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Slack通知サービスのステータス確認
app.get('/api/slack/status', (req, res) => {
  try {
    const status = slackNotifier.getStatus();
    res.json(status);
  } catch (error) {
    logger.errorDetail('Slack通知サービス状態取得エラー:', error);
    res.status(500).json({ error: 'サービスエラー' });
  }
});

// テスト通知送信
app.post('/api/slack/test', async (req, res) => {
  try {
    await slackNotifier.sendCustomNotification(
      '🧪 テスト通知',
      'Slack通知機能は正常に動作しています。',
      '#36a64f'
    );
    res.json({ success: true, message: 'テスト通知を送信しました' });
  } catch (error) {
    logger.errorDetail('Slackテスト通知エラー:', error);
    res.status(500).json({ error: 'サービスエラー', message: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

    // 各サービスの状態取得
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
        weekly_scheduler: weeklySchedulerService.getStatus(),
        slack_notifier: slackNotifier.getStatus()
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
      services: servicesStatus,
      features: [
        '✅ Discord Gateway接続',
        '✅ Discord Interactions API',
        '✅ @わなみさんメンション対応（AI統合）',
        '✅ /soudanスラッシュコマンド',
        '✅ AI知識ベース管理（PostgreSQL + 管理Web UI）',
        '✅ 画像検出・抽出・Vision解析機能',
        '✅ RAGシステム（OpenAI統合）',
        '✅ Notion/WEBサイト読み込み',
        '✅ 文書内画像抽出・AI解析',
        '✅ ロールメンション対応',
        '✅ 知識ベース限定回答システム',
        '✅ 回答不能システム',
        '✅ ミッション特別処理',
        '✅ モジュール化アーキテクチャ',
        '✅ Bot User ID検証機能',
        '✅ デバッグログシステム',
        '✅ Q&A記録機能（Googleスプレッドシート連携）',
        '🆕 Q&A自動生成機能（30個サンプル）',
        '🆕 毎週火曜日18時 Discord Webhook自動送信',
        '🚀 完全機能版 + 自動化'
      ],
      performance: {
        memory_usage: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        cpu_usage: process.cpuUsage(),
        node_version: process.version
      },
      debug: {
        bot_id_check_endpoint: '/api/bot/user-id',
        knowledge_base_status: '/api/knowledge-base/status',
        knowledge_base_refresh: 'POST /api/knowledge-base/refresh',
        knowledge_source_admin: '/admin/sources',
        qa_log_stats: '/api/qa-log/stats',
        qa_generator_status: '/api/qa-generator/status',
        qa_generator_count: '/api/qa-generator/count',
        qa_generator_generate_one: 'POST /api/qa-generator/generate-one',
        qa_automation_run: 'POST /api/qa-automation/run',
        qa_automation_full_set: 'POST /api/qa-automation/generate-full-set',
        webhook_send_weekly: 'POST /api/webhook/send-weekly',
        scheduler_status: '/api/scheduler/status',
        slack_status: '/api/slack/status',
        slack_test: 'POST /api/slack/test'
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
  // ✅ Discord login 失敗でも落とさないための再試行設定
  // Cloudflare 1015エラー対策: 初期30分 / 最大2時間（BAN解除まで待機）
  let discordRetryMs = 30 * 60_000;      // 30分
  const discordMaxRetryMs = 120 * 60_000; // 最大2時間

  try {
    // ✅ Render対策: 先にExpressを起動してPORTを開ける
    app.listen(env.PORT, '0.0.0.0', () => {
      logger.success(`✅ 🌐 Expressサーバー起動: ポート ${env.PORT}`);
      logger.info(`   ✅ Health check: GET /healthz`);
      logger.info('');
      logger.info('📊 利用可能なエンドポイント:');
      logger.info(`   GET  / - ヘルスチェック`);
      logger.info(`   GET  /api/bot/user-id - Bot User ID確認`);
      logger.info(`   GET  /api/knowledge-base/status - 知識ベース状態`);
      logger.info(`   POST /api/knowledge-base/refresh - 知識ベース更新`);
      logger.info(`   GET  /admin/sources - ナレッジソース管理画面`);
      logger.info(`   GET  /api/qa-log/stats - Q&A記録統計`);
      logger.info(`   GET  /api/qa-generator/status - Q&A生成サービス状態`);
      logger.info(`   GET  /api/qa-generator/count - Q&Aサンプル件数`);
      logger.info(`   POST /api/qa-generator/generate-one - Q&Aペア生成（テスト）`);
      logger.info(`   POST /api/qa-automation/run - Q&A自動補充実行`);
      logger.info(`   POST /api/qa-automation/generate-full-set - フルセット生成（30個）`);
      logger.info(`   POST /api/webhook/send-weekly - 週次送信テスト`);
      logger.info(`   GET  /api/scheduler/status - スケジューラー状態`);
      logger.info(`   POST /interactions - Discord Interactions`);
      logger.info('');
    });

    // Discord Gatewayの接続状態に関係なく、管理画面の回答テストを利用可能にする。
    // 管理APIから呼ばれた場合も同じPromiseを待つため、初期化は重複しない。
    initializeKnowledgeServices().catch((error) => {
      logger.errorDetail('知識ベース・RAGシステム初期化失敗:', error);
    });

    // ✅ 追加: Discord接続状態を定期ログ（多重登録防止）
    if (!global.__discordStatusIntervalStarted) {
      global.__discordStatusIntervalStarted = true;

      setInterval(() => {
        try {
          logger.info(`ℹ️ [DISCORD] isReady=${client.isReady()} wsStatus=${client.ws.status} ping=${client.ws.ping}`);
        } catch (e) {
          console.log('ℹ️ [DISCORD] status log failed');
        }
      }, 3600000); // 1時間ごと（30秒→1時間に変更）
    }

    // 環境変数チェック（ここはアプリとして致命的なので落としてOK）
    if (!env.DISCORD_BOT_TOKEN) {
      throw new Error('DISCORD_BOT_TOKEN環境変数が設定されていません');
    }
    if (!env.DISCORD_PUBLIC_KEY) {
      throw new Error('DISCORD_PUBLIC_KEY環境変数が設定されていません');
    }

    // ✅ Discord login を「落とさず再試行」する
    const tryDiscordLogin = async () => {
      // ✅ trimで末尾改行混入を除去
      const token = String(env.DISCORD_BOT_TOKEN || '').trim();

      logger.info('🔄 Discord Bot接続開始...');
      logger.info(`ℹ️ [DISCORD] token length: ${token.length}`);
      logger.info(`ℹ️ [DISCORD] 接続前状態: wsStatus=${client.ws.status} ping=${client.ws.ping}`);

      try {
        // ✅ 先にREST APIでGateway URLを取得（接続診断）
        logger.info('🔍 [DISCORD] Gateway URL取得を試行...');
        const axios = require('axios');
        const gatewayResponse = await axios.get('https://discord.com/api/v10/gateway/bot', {
          headers: {
            'Authorization': `Bot ${token}`
          },
          timeout: 10000
        });
        
        const gatewayUrl = gatewayResponse.data?.url;
        const sessionStartLimit = gatewayResponse.data?.session_start_limit;
        
        logger.success(`✅ [DISCORD] Gateway URL取得成功: ${gatewayUrl}`);
        logger.info(`ℹ️ [DISCORD] セッション制限: ${JSON.stringify(sessionStartLimit)}`);
        
      } catch (gatewayError) {
        const errorStatus = gatewayError?.response?.status;
        const errorMsg = gatewayError?.message || '';
        const errorCode = gatewayError?.code;
        
        logger.error('❌ [DISCORD] Gateway URL取得失敗（REST API接続エラー）:');
        console.log(JSON.stringify({
          message: errorMsg,
          code: errorCode,
          status: errorStatus,
          statusText: gatewayError?.response?.statusText,
          data: typeof gatewayError?.response?.data === 'string' ? 
                gatewayError?.response?.data.substring(0, 500) : 
                gatewayError?.response?.data
        }, null, 2));
        
        // ✅ Slack通知を送信
        await slackNotifier.notifyDiscordConnectionError({
          message: errorMsg,
          code: errorCode,
          status: errorStatus,
          statusText: gatewayError?.response?.statusText,
          wsStatus: client.ws.status
        });
        
        // ✅ 429エラー（レート制限・BAN）の特別処理
        if (errorStatus === 429 || errorMsg.includes('rate limit') || errorMsg.includes('1015')) {
          logger.error('🚨 [DISCORD] Cloudflare レート制限検出（Error 1015）');
          logger.error('🔴 RenderのIPアドレスがDiscordによって一時的にBANされています');
          logger.warn('⏳ 推奨: 2〜6時間待ってから再デプロイしてください');
          logger.warn('💡 または: 新しいRenderサービスを作成して別IPを取得してください');
          
          // BAN中は再試行間隔を最大値に設定
          discordRetryMs = discordMaxRetryMs;
        }
        
        // REST API接続失敗の場合は再試行
        logger.warn(`⚠️ [DISCORD] 次の再試行まで ${Math.round(discordRetryMs / 60000)} 分待機`);
        setTimeout(tryDiscordLogin, discordRetryMs);
        discordRetryMs = Math.min(Math.floor(discordRetryMs * 1.5), discordMaxRetryMs);
        return;
      }

      // ✅ HOTFIX: Renderのネットワーク初期化遅延対策で60秒に延長
      const loginPromise = client.login(token);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Discord login timeout (60s)')), 60000)
      );

      try {
        await Promise.race([loginPromise, timeoutPromise]);
        logger.success('✅ Discord Bot接続完了');

        // ✅ Slack通知（接続成功）
        await slackNotifier.notifyDiscordConnectionSuccess();

        // ✅ 成功したらリトライ間隔を 5分に戻す（再度の1015踏みを避ける）
        discordRetryMs = 300_000;
      } catch (loginError) {
        // ✅ 詳細なエラー情報をログ出力
        const errorMsg = String(loginError?.message || '');
        const errorCode = loginError?.code;
        const errorName = loginError?.name;
        const errorStack = loginError?.stack;
        
        // JSON形式で出力
        logger.error('❌ [DISCORD] client.login 失敗:');
        console.log(JSON.stringify({
          message: errorMsg,
          code: errorCode,
          name: errorName,
          wsStatus: client.ws.status,
          wsUrl: client.ws.gateway || 'unknown',
          stack: errorStack
        }, null, 2));

        // ✅ Slack通知（client.loginエラー）
        await slackNotifier.notifyDiscordConnectionError({
          message: errorMsg,
          code: errorCode,
          wsStatus: client.ws.status
        });

        // ✅ 認証エラー判定（トークンが無効な場合は即座に停止）
        const isAuthError = errorMsg.includes('TOKEN_INVALID') || 
                            errorMsg.includes('Incorrect login') ||
                            errorMsg.includes('401') ||
                            errorCode === 'TOKEN_INVALID';
        
        if (isAuthError) {
          logger.error('❌ [DISCORD] 認証エラー検出 - トークンが無効です。再試行を停止します');
          logger.error('🔴 DISCORD_BOT_TOKENを確認してください');
          return; // 再試行せずに停止
        }

        // ✅ レート制限・ブロック検出
        const isRateLimited = errorMsg.includes('rate limit') ||
                              errorMsg.includes('1015') ||
                              errorMsg.includes('cloudflare') ||
                              errorCode === 'RATE_LIMIT';
        
        if (isRateLimited) {
          logger.error('❌ [DISCORD] レート制限またはIPブロック検出');
          logger.warn('⚠️ Discord側で接続をブロックしている可能性があります');
          logger.warn('⚠️ 数時間待ってから再試行してください');
        }

        // ✅ ネットワークエラーやタイムアウトは再試行
        logger.warn(`⚠️ [DISCORD] 次の再試行まで ${Math.round(discordRetryMs / 1000)} 秒待機`);

        setTimeout(tryDiscordLogin, discordRetryMs);
        discordRetryMs = Math.min(Math.floor(discordRetryMs * 1.5), discordMaxRetryMs);
      }
    };

    // 初回試行
    tryDiscordLogin();

  } catch (error) {
    // ✅ 最重要：落とさない（Renderの再起動ループを止める）
    logger.errorDetail('サーバー起動エラー（プロセスは継続します）:', error);
    // process.exit(1);
  }
}

// プロセス終了時の処理
process.on('SIGTERM', async () => {
  logger.shutdown('Discord Bot for わなみさん', 'SIGTERM受信');

  try {
    // 週次スケジューラー停止
    weeklySchedulerService.stop();

    // 知識ベース自動更新停止
    if (knowledgeBase.knowledgeBaseService && typeof knowledgeBase.knowledgeBaseService.stop === 'function') {
      knowledgeBase.knowledgeBaseService.stop();
    }
  } catch (error) {
    logger.warn('サービス停止エラー:', error.message);
  }

  if (client.isReady()) {
    await client.destroy();
  }
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.shutdown('Discord Bot for わなみさん', 'SIGINT受信');

  try {
    // 週次スケジューラー停止
    weeklySchedulerService.stop();

    // 知識ベース自動更新停止
    if (knowledgeBase.knowledgeBaseService && typeof knowledgeBase.knowledgeBaseService.stop === 'function') {
      knowledgeBase.knowledgeBaseService.stop();
    }
  } catch (error) {
    logger.warn('サービス停止エラー:', error.message);
  }

  if (client.isReady()) {
    await client.destroy();
  }
  await closePool();
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
