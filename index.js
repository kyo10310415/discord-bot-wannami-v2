// index.js - Discord Bot メインサーバー（知識ベース限定回答版 v14.1.0 - 早期応答対応）

const express = require('express');
const { VERSION, FEATURES, BOT_USER_ID } = require('./config/constants');
const environment = require('./config/environment');

// サービス初期化
const googleApisService = require('./services/google-apis');
const openaiService = require('./services/openai-service');
const knowledgeBaseService = require('./services/knowledge-base');
const ragSystem = require('./services/rag-system');

const app = express();
const PORT = environment.PORT;

// グローバル状態管理
let isSystemInitialized = false;
let initializationError = null;

// 早期応答システム用グローバル変数
let activeResumeWebhooks = new Map(); // チャンネルID → Resume URL

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

// 知識ベース限定RAG回答生成（v14新機能）
async function generateRAGResponse(question, buttonType = null, userInfo, imageUrls = []) {
  try {
    if (!isSystemInitialized) {
      await initializeServices();
    }

    if (!isSystemInitialized) {
      throw new Error(`システム初期化エラー: ${initializationError}`);
    }

    console.log(`🤖 知識ベース限定回答生成開始: ${buttonType || 'mention'}`);
    console.log(`📝 ユーザー: ${userInfo.username}`);
    console.log(`💬 質問: ${question}`);
    console.log(`🖼️ 画像数: ${imageUrls.length}`);

    // 1. 知識ベース限定検索を実行
    const ragResult = await ragSystem.searchKnowledgeBaseOnly(question, userInfo);
    
    // 2. 回答不能の場合
    if (!ragResult.canAnswer) {
      console.log(`❌ 回答不能: 信頼度${ragResult.confidence}`);
      return {
        response: ragResult.response,
        metadata: { 
          ragUsed: true, 
          chunksUsed: 0,
          canAnswer: false,
          confidence: ragResult.confidence,
          tokensUsed: ragResult.tokensUsed,
          responseType: 'knowledge_base_limited_unable'
        }
      };
    }

    // 3. 回答可能な場合の処理
    console.log(`✅ 回答可能: 信頼度${ragResult.confidence}, 関連情報${ragResult.relevantCount || ragResult.sources.length}件`);
    
    // ミッション関連の特別情報をメタデータに追加
    const isMissionRelated = question.toLowerCase().includes('ミッション') || 
                           question.toLowerCase().includes('mission') ||
                           question.toLowerCase().includes('課題') ||
                           buttonType === 'mission_submission';

    // 4. システム情報の追加（デバッグ用）
    console.log(`📊 回答情報: ソース${ragResult.sources.length}件、トークン使用: ${ragResult.tokensUsed.embedding + ragResult.tokensUsed.completion}`);
    
    return {
      response: ragResult.response,
      metadata: {
        ragUsed: true,
        canAnswer: ragResult.canAnswer,
        confidence: ragResult.confidence,
        relevantCount: ragResult.relevantCount || ragResult.sources.length,
        sourcesUsed: ragResult.sources.length,
        tokensUsed: ragResult.tokensUsed,
        isMissionRelated: isMissionRelated,
        responseType: 'knowledge_base_limited'
      },
      sources: ragResult.sources
    };

  } catch (error) {
    console.error('❌ 知識ベース限定回答エラー:', error.message);
    return {
      response: `システムエラーが発生しました。しばらく待ってから再度お試しください。\n\nエラー詳細: ${error.message}`,
      metadata: { 
        ragUsed: false, 
        error: error.message,
        responseType: 'error'
      }
    };
  }
}

// ========== 早期応答システム - 新機能追加 ==========

// 動的Webhook URL登録用エンドポイント
app.post('/register-resume-webhook', async (req, res) => {
  try {
    const { resume_url, channel_id, message_id, user_id } = req.body;
    
    console.log(`📝 Resume Webhook登録: ${channel_id} → ${resume_url}`);
    
    // アクティブなWebhook URLを保存
    activeResumeWebhooks.set(channel_id, {
      url: resume_url,
      message_id,
      user_id,
      registered_at: new Date().toISOString()
    });
    
    // 5分後に自動削除（タイムアウト対策）
    setTimeout(() => {
      activeResumeWebhooks.delete(channel_id);
      console.log(`🗑️ Resume Webhook期限切れ削除: ${channel_id}`);
    }, 5 * 60 * 1000);
    
    res.json({ success: true, registered: true });
  } catch (error) {
    console.error('❌ Resume Webhook登録失敗:', error);
    res.status(500).json({ error: error.message });
  }
});

// メッセージ受信時の早期応答トリガー
app.post('/trigger-early-response', async (req, res) => {
  try {
    const { channel_id } = req.body;
    const webhookInfo = activeResumeWebhooks.get(channel_id);
    
    if (webhookInfo && webhookInfo.url !== 'not-available') {
      console.log(`⚡ 早期応答トリガー送信: ${channel_id}`);
      
      const response = await fetch(webhookInfo.url, {
        method: 'GET', // n8nの設定でGETになっているため
        headers: { 'Content-Type': 'application/json' }
      });
      
      // 使用済みWebhook URLを削除
      activeResumeWebhooks.delete(channel_id);
      
      console.log('✅ 待機中断成功');
      res.json({ success: true, resumed: true });
    } else {
      console.log('⚠️ Resume Webhook未登録またはURL無効');
      res.json({ success: false, reason: 'no_webhook_registered' });
    }
  } catch (error) {
    console.error('❌ 早期応答トリガー失敗:', error);
    res.status(500).json({ error: error.message });
  }
});

// メンション検知WebhookからのAI処理依頼（修正版）
app.post('/mention-trigger', async (req, res) => {
  try {
    console.log('🎯 メンション検知Webhook受信');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const message = req.body;
    
    // Discord PING検証
    if (message.type === 1) {
      console.log('📍 Discord PING検証');
      return res.json({ type: 1 });
    }

    // メッセージ検証
    if (!message.content || !message.author || message.author.bot) {
      console.log('⚠️ 無効なメッセージまたはBot送信');
      return res.json({ success: false, reason: 'invalid_message' });
    }

    // Bot ID取得（複数の方法で確認）
    const botUserId = process.env.DISCORD_APPLICATION_ID || BOT_USER_ID || '1420328163497607199';
    console.log(`🤖 検索対象Bot ID: ${botUserId}`);
    console.log(`📝 受信メッセージ: ${message.content}`);

    // メンション形式を複数パターンでチェック
    const mentionPatterns = [
      `<@${botUserId}>`,           // 通常メンション
      `<@!${botUserId}>`,          // ニックネーム付きメンション
      `@わなみさん`,                // 直接文字列（念のため）
    ];

    const isMentioned = mentionPatterns.some(pattern => {
      const found = message.content.includes(pattern);
      if (found) {
        console.log(`✅ メンションパターン発見: ${pattern}`);
      }
      return found;
    });

    if (!isMentioned) {
      console.log('⚠️ Bot宛メンションではない');
      console.log('検索したパターン:', mentionPatterns);
      return res.json({ success: false, reason: 'not_mention' });
    }

    const channel_id = message.channel_id;
    const user_id = message.author.id;
    const username = message.author.username;
    const guild_id = message.guild_id;

    console.log(`👤 メンション処理: ${username} (${user_id}) in ${channel_id}`);

    // 【NEW】早期応答トリガー送信
    if (channel_id) {
      try {
        console.log(`⚡ 早期応答トリガー送信開始: ${channel_id}`);
        const earlyResponse = await fetch('https://discord-bot-wannami.onrender.com/trigger-early-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel_id })
        });
        
        const earlyResult = await earlyResponse.json();
        console.log('⚡ 早期応答トリガー結果:', earlyResult);
      } catch (error) {
        console.error('❌ 早期応答トリガー送信失敗:', error);
      }
    }

    // Discord応答（メニューボタン表示）
    console.log('📤 Discord応答メッセージ送信開始...');
    const discordResponse = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: `こんにちは <@${user_id}>さん！\nどのようなご相談でしょうか？以下から選択してください：`,
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
      })
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      console.error(`❌ Discord API Error: ${discordResponse.status} - ${errorText}`);
      throw new Error(`Discord API Error: ${discordResponse.status} - ${errorText}`);
    }

    console.log('✅ メンション応答メッセージ送信完了');
    res.json({ success: true, type: 'mention_processed' });

  } catch (error) {
    console.error('❌ メンション処理エラー:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      type: 'mention_error'
    });
  }
});

// ========== 既存エンドポイント ==========

// Discord Webhook エンドポイント
app.post('/discord', async (req, res) => {
  try {
    const body = req.body;
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];

    // 署名検証（実装は省略）
    
    console.log('📥 Discord Webhook受信:', body.type);

    // Ping応答
    if (body.type === 1) {
      return res.json({ type: 1 });
    }

    // ボタンインタラクション
    if (body.type === 3) {
      const message_content = body.data?.resolved?.messages?.[Object.keys(body.data.resolved.messages)[0]]?.content || 
                             body.message?.content || '';
      const button_id = body.data?.custom_id;
      
      console.log(`🔘 ボタン押下: ${button_id}`);
      console.log(`📝 メッセージ内容: ${message_content}`);

      if (!message_content) {
        return res.json({
          type: 4,
          data: { content: 'メッセージ内容を取得できませんでした。' }
        });
      }

      try {
        // 知識ベース限定AI回答生成
        const result = await generateRAGResponse(message_content, button_id, {
          username: body.member?.user?.username || 'Unknown',
          guildName: body.guild?.name || '不明',
          channelName: body.channel?.name || '不明'
        });

        console.log('✅ 知識ベース限定AI回答生成完了');
        
        // 回答不能の場合の特別表示
        let responseMessage = result.response;
        if (!result.metadata.canAnswer) {
          responseMessage = `**🚫 知識ベース限定モード - 回答不能**\n\n${result.response}`;
        } else if (result.metadata.isMissionRelated) {
          responseMessage = `**🎯 ミッション関連質問 - 知識ベース限定回答**\n\n${result.response}\n\n*信頼度: ${(result.metadata.confidence * 100).toFixed(1)}%, 参照ソース: ${result.metadata.sourcesUsed}件*`;
        } else {
          responseMessage = `**🤖 知識ベース限定回答**\n\n${result.response}\n\n*信頼度: ${(result.metadata.confidence * 100).toFixed(1)}%, 参照ソース: ${result.metadata.sourcesUsed}件*`;
        }

        return res.json({
          type: 4,
          data: { content: responseMessage }
        });

      } catch (error) {
        console.error('❌ AI回答生成エラー:', error.message);
        return res.json({
          type: 4,
          data: { content: '知識ベース限定AI回答の生成中にエラーが発生しました。担任の先生にご相談ください。' }
        });
      }
    }

    // メンション処理
    if (body.type === 2) {
      const message_content = body.data?.options?.[0]?.value || '';
      
      console.log(`💬 メンション受信: ${message_content}`);

      if (!message_content) {
        return res.json({
          type: 4,
          data: { content: '**知識ベース限定モード**\n\nメッセージが空です。質問内容を入力してください。\n\n*このモードでは知識ベース内の情報のみで回答いたします。*' }
        });
      }

      try {
        // 知識ベース限定AI回答生成
        const result = await generateRAGResponse(message_content, null, {
          username: body.member?.user?.username || 'Unknown', 
          guildName: body.guild?.name || '不明',
          channelName: body.channel?.name || '不明'
        });

        console.log('✅ 知識ベース限定AI回答生成完了');
        
        // 回答不能の場合の特別表示
        let responseMessage = result.response;
        if (!result.metadata.canAnswer) {
          responseMessage = `**🚫 知識ベース限定モード - 回答不能**\n\n${result.response}`;
        } else if (result.metadata.isMissionRelated) {
          responseMessage = `**🎯 ミッション関連メンション - 知識ベース限定回答**\n\n${result.response}\n\n*信頼度: ${(result.metadata.confidence * 100).toFixed(1)}%, 参照ソース: ${result.metadata.sourcesUsed}件*`;
        } else {
          responseMessage = `**🤖 メンション - 知識ベース限定回答**\n\n${result.response}\n\n*信頼度: ${(result.metadata.confidence * 100).toFixed(1)}%, 参照ソース: ${result.metadata.sourcesUsed}件*`;
        }

        return res.json({
          type: 4,
          data: { content: responseMessage }
        });

      } catch (error) {
        console.error('❌ AI回答生成エラー:', error.message);
        return res.json({
          type: 4,
          data: { content: '知識ベース限定AI回答の生成中にエラーが発生しました。担任の先生にご相談ください。' }
        });
      }
    }

    return res.json({ type: 1 });

  } catch (error) {
    console.error('❌ Discord Webhook処理エラー:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// n8n用AI処理エンドポイント（知識ベース限定対応）
app.post('/ai-process', async (req, res) => {
  try {
    const {
      message_content,
      channel_id,
      user_id,
      message_id,
      timestamp,
      button_id,
      username,
      guild_id,
      has_images,
      image_count,
      attachment_images,
      knowledge_base_only,
      immediate_response
    } = req.body;

    console.log('🔄 n8n AI処理要求受信:', {
      button_id,
      username,
      knowledge_base_only: knowledge_base_only || false,
      immediate_response: immediate_response || false,
      message_length: message_content?.length || 0,
      image_count: image_count || 0
    });

    if (!message_content) {
      return res.json({
        ai_response: '質問内容が空です。具体的な質問をお聞かせください。',
        can_answer: false,
        confidence: 0,
        response_type: 'error'
      });
    }

    try {
      // 知識ベース限定AI回答生成
      const result = await generateRAGResponse(message_content, button_id, {
        username: username || 'Unknown',
        guildName: '不明',
        channelName: '不明'
      }, attachment_images || []);

      console.log('✅ n8n向け知識ベース限定AI回答生成完了');

      // 回答形式を統一
      let formattedResponse;
      if (!result.metadata.canAnswer) {
        formattedResponse = `**🚫 知識ベース限定モード - 回答不能**\n\n${result.response}`;
      } else if (result.metadata.isMissionRelated) {
        formattedResponse = `**🎯 ミッション関連 - 知識ベース限定回答**\n\n${result.response}\n\n**【良い例・悪い例の確認ポイント】**\n上記の回答で「良い例」と「悪い例」の区分を確認して実践してくださいね！\n\n*信頼度: ${(result.metadata.confidence * 100).toFixed(1)}%, 参照ソース: ${result.metadata.sourcesUsed}件*`;
      } else {
        formattedResponse = `**🤖 知識ベース限定回答**\n\n${result.response}\n\n*信頼度: ${(result.metadata.confidence * 100).toFixed(1)}%, 参照ソース: ${result.metadata.sourcesUsed}件*`;
      }

      return res.json({
        ai_response: formattedResponse,
        can_answer: result.metadata.canAnswer,
        confidence: result.metadata.confidence,
        relevant_count: result.metadata.relevantCount,
        sources_used: result.metadata.sourcesUsed,
        tokens_used: result.metadata.tokensUsed,
        is_mission_related: result.metadata.isMissionRelated,
        response_type: result.metadata.responseType,
        processing_mode: 'knowledge_base_limited'
      });

    } catch (error) {
      console.error('❌ n8n AI処理エラー:', error.message);
      return res.json({
        ai_response: `知識ベース限定AI処理中にエラーが発生しました。\n\nエラー詳細: ${error.message}\n\n担任の先生にご相談ください。`,
        can_answer: false,
        confidence: 0,
        response_type: 'error',
        error_details: error.message
      });
    }

  } catch (error) {
    console.error('❌ n8n エンドポイントエラー:', error.message);
    return res.status(500).json({
      ai_response: 'サーバーエラーが発生しました。',
      can_answer: false,
      confidence: 0,
      response_type: 'server_error',
      error: error.message
    });
  }
});

// ヘルスチェックエンドポイント
app.get('/', (req, res) => {
  const stats = ragSystem.getStats();
  const status = {
    status: 'running',
    version: `${VERSION} - 知識ベース限定回答版 v14.1.0`,
    features: [
      ...FEATURES,
      '知識ベース限定回答システム',
      '回答不能判定システム',
      'ミッション特別処理（良い例/悪い例重視）',
      'スプレッドシートG列対応',
      'n8n即座応答対応 ⚡NEW'
    ],
    system: {
      initialized: isSystemInitialized,
      error: initializationError,
      ragStats: stats,
      knowledgeBaseLimited: true,
      immediateResponse: true,
      activeWebhooks: activeResumeWebhooks.size
    },
    timestamp: new Date().toISOString()
  };
  
  res.json(status);
});

// システム初期化エンドポイント
app.post('/initialize', async (req, res) => {
  try {
    console.log('🔄 手動システム初期化開始...');
    isSystemInitialized = false;
    initializationError = null;
    
    const result = await initializeServices();
    
    if (result) {
      res.json({ 
        success: true, 
        message: '知識ベース限定システム初期化完了',
        stats: ragSystem.getStats(),
        features: [
          '知識ベース限定回答システム',
          '回答不能判定システム',
          'ミッション特別処理',
          'スプレッドシートG列対応',
          'n8n即座応答対応'
        ]
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'システム初期化失敗',
        error: initializationError
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'システム初期化エラー',
      error: error.message
    });
  }
});

// システム統計エンドポイント
app.get('/stats', (req, res) => {
  try {
    const ragStats = ragSystem.getStats();
    const googleStatus = googleApisService.getStatus();
    const openaiStatus = openaiService.getStatus();
    
    res.json({
      system: {
        initialized: isSystemInitialized,
        version: `${VERSION} - 知識ベース限定回答版 v14.1.0`,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        activeWebhooks: activeResumeWebhooks.size
      },
      rag: ragStats,
      services: {
        google: googleStatus,
        openai: openaiStatus
      },
      features: {
        knowledge_base_limited: true,
        mission_special_processing: true,
        spreadsheet_g_column: true,
        immediate_response: true,
        unable_to_answer_detection: true,
        early_response_system: true
      },
      webhooks: {
        active_count: activeResumeWebhooks.size,
        registered_channels: Array.from(activeResumeWebhooks.keys())
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Stats retrieval failed',
      message: error.message
    });
  }
});

// サーバー起動
app.listen(PORT, async () => {
  console.log('='.repeat(60));
  console.log(`🚀 Discord Bot Server v${VERSION} 起動`);
  console.log(`📡 ポート: ${PORT}`);
  console.log(`🤖 Bot ID: ${BOT_USER_ID}`);
  console.log('🔧 新機能:');
  console.log('   • 知識ベース限定回答システム');
  console.log('   • 回答不能判定システム');
  console.log('   • ミッション特別処理（良い例/悪い例重視）');
  console.log('   • スプレッドシートG列対応');
  console.log('   • n8n即座応答対応 ⚡NEW');
  console.log('   • 早期応答システム（Webhook URL動的登録）');
  console.log('='.repeat(60));
  
  // 自動初期化
  console.log('⏳ 知識ベース限定システム初期化開始...');
  await initializeServices();
  
  if (isSystemInitialized) {
    const stats = ragSystem.getStats();
    console.log('✅ サーバー準備完了！');
    console.log(`📊 統計: ${stats.totalChunks}チャンク, ${stats.totalImages}画像`);
    console.log('🎯 知識ベース限定回答モード: 有効');
    console.log('⚡ 早期応答システム: 有効');
  } else {
    console.log('⚠️ 初期化エラーあり。手動初期化をお試しください。');
    console.log(`❌ エラー詳細: ${initializationError}`);
  }
});

// グレースフルシャットダウン
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM受信。サーバーをシャットダウンします...');
  activeResumeWebhooks.clear();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT受信。サーバーをシャットダウンします...');
  activeResumeWebhooks.clear();
  process.exit(0);
});
