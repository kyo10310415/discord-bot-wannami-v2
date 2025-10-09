// index.js - Discord Bot メインサーバー（RAG統合完全版 v13.0.0）

const express = require('express');
const { VERSION, FEATURES, BOT_USER_ID } = require('./config/constants');
const environment = require('./config/environment');

// サービス初期化
const googleApisService = require('./services/google-apis');
const openaiService = require('./services/openai-service');
const knowledgeBaseService = require('./services/knowledge-base');
const ragSystem = require('./services/rag-system');

// ハンドラー
const discordHandler = require('./handlers/discord-handler');
const buttonHandler = require('./handlers/button-handler');
const mentionHandler = require('./handlers/mention-handler');

// AI回答生成
const aiResponseGenerator = require('./ai/ai-response-generator');

const app = express();
const PORT = environment.PORT;

// グローバル状態管理
let isSystemInitialized = false;
let initializationError = null;

// Raw body parser for Discord webhook
app.use('/discord', express.raw({ type: 'application/json' }));
app.use(express.json());

// サービス初期化関数
async function initializeServices() {
  if (isSystemInitialized) {
    return true;
  }

  try {
    console.log('🚀 システム初期化開始...');
    
    // 1. Google APIs初期化
    const googleInitialized = googleApisService.initialize();
    if (!googleInitialized) {
      throw new Error('Google APIs初期化失敗');
    }

    // 2. OpenAI初期化
    const openaiInitialized = openaiService.initialize();
    if (!openaiInitialized) {
      throw new Error('OpenAI API初期化失敗');
    }

    // 3. 知識ベース構築
    console.log('📚 知識ベース構築開始...');
    const documents = await knowledgeBaseService.buildKnowledgeBase();
    if (!documents || documents.length === 0) {
      throw new Error('知識ベース構築失敗');
    }

    // 4. RAGシステム初期化
    console.log('🤖 RAGシステム初期化開始...');
    const ragInitialized = await ragSystem.initializeKnowledgeBase(documents);
    if (!ragInitialized) {
      throw new Error('RAGシステム初期化失敗');
    }

    isSystemInitialized = true;
    console.log('✅ システム初期化完了');
    
    // 統計情報出力
    const ragStats = ragSystem.getStats();
    const kbStats = knowledgeBaseService.getStats();
    
    console.log('📊 システム統計:');
    console.log(`  - RAGチャンク数: ${ragStats.totalChunks}`);
    console.log(`  - 平均チャンク長: ${ragStats.avgChunkLength}文字`);
    console.log(`  - 文書内画像数: ${kbStats.totalDocumentImages}`);
    
    return true;

  } catch (error) {
    console.error('❌ システム初期化エラー:', error.message);
    initializationError = error.message;
    isSystemInitialized = false;
    return false;
  }
}

// =============================================================================
// Discord Webhook処理
// =============================================================================

app.post('/discord', async (req, res) => {
  return await discordHandler.handleWebhook(req, res);
});

// =============================================================================
// AI処理エンドポイント（RAG版）
// =============================================================================

app.post('/ai-process', async (req, res) => {
  console.log('🤖 RAG AI処理リクエスト受信:', req.body);
  
  try {
    // システム初期化チェック
    if (!isSystemInitialized) {
      await initializeServices();
    }

    if (!isSystemInitialized) {
      throw new Error(`システム初期化エラー: ${initializationError}`);
    }

    const { button_id, message_content, user_id, username, attachment_images = [] } = req.body;
    
    if (!message_content && (!attachment_images || attachment_images.length === 0)) {
      return res.json({ error: '質問テキストまたは画像が必要です' });
    }
    
    // AI回答生成
    const result = await aiResponseGenerator.generateResponse(message_content, {
      buttonType: button_id,
      userInfo: { id: user_id, username: username },
      imageUrls: attachment_images,
      useRAG: true,
      maxImages: 5
    });
    
    res.json({
      success: true,
      ai_response: result.response,
      processed_at: new Date().toISOString(),
      rag_metadata: result.metadata,
      version: VERSION
    });
    
  } catch (error) {
    console.error('❌ AI処理エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// メンション処理エンドポイント（RAG版）
app.post('/ai-process-mention', async (req, res) => {
  console.log('🏷️ RAG メンションAI処理リクエスト受信:', req.body);
  
  try {
    // システム初期化チェック
    if (!isSystemInitialized) {
      await initializeServices();
    }

    if (!isSystemInitialized) {
      throw new Error(`システム初期化エラー: ${initializationError}`);
    }

    const { message_content, user_id, username, attachment_images = [] } = req.body;
    
    // AI回答生成（メンション用）
    const result = await aiResponseGenerator.generateResponse(message_content, {
      buttonType: 'mention_direct',
      userInfo: { id: user_id, username: username },
      imageUrls: attachment_images,
      useRAG: true,
      maxImages: 5
    });
    
    res.json({
      success: true,
      ai_response: result.response,
      processed_at: new Date().toISOString(),
      trigger_type: 'mention',
      rag_metadata: result.metadata,
      version: VERSION
    });
    
  } catch (error) {
    console.error('❌ メンション処理エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// 管理・デバッグエンドポイント
// =============================================================================

// 知識ベーステスト用エンドポイント
app.get('/test-knowledge-base', async (req, res) => {
  try {
    if (!isSystemInitialized) {
      await initializeServices();
    }
    
    const ragStats = ragSystem.getStats();
    const kbStats = knowledgeBaseService.getStats();
    const googleStatus = googleApisService.getStatus();
    const openaiStatus = openaiService.getStatus();
    const discordStats = discordHandler.getStats();
    const buttonStats = buttonHandler.getStats();
    const mentionStats = mentionHandler.getStats();
    const aiStats = aiResponseGenerator.getStats();
    
    res.json({
      success: isSystemInitialized,
      initialization_error: initializationError,
      system_stats: {
        rag: ragStats,
        knowledge_base: kbStats,
        google_apis: googleStatus,
        openai: openaiStatus,
        discord_handler: discordStats,
        button_handler: buttonStats,
        mention_handler: mentionStats,
        ai_response_generator: aiStats
      },
      environment_status: environment.getStatus(),
      version: VERSION
    });
  } catch (error) {
    console.error('❌ 知識ベーステストエラー:', error);
    res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// システム統計エンドポイント
app.get('/stats', (req, res) => {
  res.json({
    system_initialized: isSystemInitialized,
    initialization_error: initializationError,
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    version: VERSION,
    handlers: {
      discord: discordHandler.getStats(),
      button: buttonHandler.getStats(),
      mention: mentionHandler.getStats(),
      ai_response: aiResponseGenerator.getStats()
    }
  });
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Discord Bot - VTuber School with RAG System (Complete)',
    timestamp: new Date().toISOString(),
    version: VERSION,
    features: FEATURES,
    system_initialized: isSystemInitialized,
    initialization_error: initializationError,
    bot_user_id: BOT_USER_ID,
    components: {
      handlers: ['discord', 'button', 'mention'],
      services: ['google-apis', 'openai', 'knowledge-base', 'rag-system'],
      ai: ['response-generator', 'prompt-templates'],
      utils: ['verification', 'image-utils', 'content-loaders']
    }
  });
});

// サーバー起動
app.listen(PORT, async () => {
  console.log('=== Discord Bot VTuber School RAG版（完全版）===');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🤖 Bot User ID: ${BOT_USER_ID}`);
  console.log(`🔢 Version: ${VERSION}`);
  console.log('🧠 RAG System: Active');
  console.log('🖼️ Document Image Support: Active');
  console.log('📚 Knowledge Base: Spreadsheet + RAG');
  console.log('🤖 AI Models: GPT-4o (Vision), GPT-4o-mini (Text)');
  console.log('🔍 Embedding Model: text-embedding-3-small');
  console.log('📁 File Structure: Modular Architecture');
  console.log('🔧 Components: Handlers, Services, AI, Utils');
  console.log('=====================================');

  // バックグラウンドで初期化実行
  console.log('🔄 バックグラウンド初期化開始...');
  await initializeServices();
  
  if (isSystemInitialized) {
    console.log('✅ システム準備完了！');
  } else {
    console.log('❌ システム初期化に問題がありました。ログを確認してください。');
  }
});

// メッセージ監視Bot並行実行
if (environment.getStatus().enable_message_bot) {
  console.log('🤖 Discord Message Bot 起動中...');
  require('./discord-message-bot.js');
}

module.exports = app;
