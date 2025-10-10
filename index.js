// index.js - Discord Bot 完全統合版（メンション機能付き）v15.1.0

const express = require('express');
const crypto = require('crypto');

// 設定・サービス読み込み
const { VERSION, FEATURES, BOT_USER_ID } = require('./config/constants');
const environment = require('./config/environment');
const googleApisService = require('./services/google-apis');
const openaiService = require('./services/openai-service');
const knowledgeBaseService = require('./services/knowledge-base');
const ragSystem = require('./services/rag-system');

const app = express();
const PORT = environment.PORT;

// グローバル状態管理
let isSystemInitialized = false;
let initializationError = null;

// Discord設定
const PUBLIC_KEY = environment.DISCORD_PUBLIC_KEY;
const BOT_TOKEN = environment.DISCORD_BOT_TOKEN;
const APPLICATION_ID = environment.DISCORD_APPLICATION_ID || BOT_USER_ID;

// Raw body parser for Discord webhook
app.use('/interactions', express.raw({ 
  type: 'application/json',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.json());

// Discord署名検証関数
function verifySignature(req) {
  if (!PUBLIC_KEY) {
    console.error('DISCORD_PUBLIC_KEY環境変数が設定されていません');
    return false;
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  
  if (!signature || !timestamp) {
    console.error('必要なヘッダーが見つかりません');
    return false;
  }

  const body = req.rawBody || '';
  
  try {
    const isValid = crypto.verify(
      'ed25519',
      Buffer.concat([Buffer.from(timestamp), body]),
      Buffer.from(PUBLIC_KEY, 'hex'),
      Buffer.from(signature, 'hex')
    );
    
    return isValid;
  } catch (error) {
    console.error('署名検証エラー:', error);
    return false;
  }
}

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
    
    return true;

  } catch (error) {
    console.error('❌ システム初期化エラー:', error.message);
    initializationError = error.message;
    isSystemInitialized = false;
    return false;
  }
}

// 知識ベース限定RAG回答生成
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
    console.log(`💬 質問: ${question.substring(0, 100)}...`);

    // 1. 知識ベース限定検索を実行
    const ragResult = await ragSystem.searchKnowledgeBaseOnly(question, userInfo);
    
    // 2. 回答不能の場合
    if (!ragResult.canAnswer) {
      console.log(`❌ 回答不能: 信頼度${ragResult.confidence}`);
      return {
        response: ragResult.response,
        metadata: { 
          ragUsed: true, 
          canAnswer: false,
          confidence: ragResult.confidence,
          responseType: 'knowledge_base_limited_unable'
        }
      };
    }

    // 3. ミッション関連の特別処理
    const isMissionRelated = question.toLowerCase().includes('ミッション') || 
                           question.toLowerCase().includes('mission') ||
                           question.toLowerCase().includes('課題') ||
                           buttonType === 'mission_submission';

    console.log(`✅ 回答可能: 信頼度${ragResult.confidence}, 関連情報${ragResult.sources.length}件`);
    
    return {
      response: ragResult.response,
      metadata: {
        ragUsed: true,
        canAnswer: ragResult.canAnswer,
        confidence: ragResult.confidence,
        sourcesUsed: ragResult.sources.length,
        isMissionRelated: isMissionRelated,
        responseType: 'knowledge_base_limited'
      }
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

// メンション検知＆処理関数
async function handleMention(message) {
  try {
    const channel_id = message.channel_id;
    const user_id = message.author.id;
    const username = message.author.username;
    const content = message.content || '';

    console.log(`👤 メンション処理: ${username} in ${channel_id}`);
    console.log(`💬 内容: ${content}`);

    // Bot IDを除去してクリーンな質問を抽出
    const cleanContent = content
      .replace(new RegExp(`<@!?${APPLICATION_ID}>`, 'g'), '')
      .trim();

    console.log(`🧹 クリーン後: ${cleanContent}`);

    // 質問が空の場合はメニューボタンを表示
    if (!cleanContent || cleanContent.length < 3) {
      console.log('❓ 質問が空のため、メニューボタン表示');
      
      const response = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${BOT_TOKEN}`,
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

      if (!response.ok) {
        throw new Error(`Discord API Error: ${response.status}`);
      }

      console.log('✅ メニューボタン送信完了');
      return true;
    }

    // 具体的な質問がある場合はAI回答生成
    console.log('🤖 AI回答生成開始');
    
    const result = await generateRAGResponse(cleanContent, 'mention', {
      username: username,
      guildName: '不明',
      channelName: '不明'
    });

    // 回答形式を整理
    let responseMessage;
    if (!result.metadata.canAnswer) {
      responseMessage = `**🚫 知識ベース限定モード - 回答不能**\n\n${result.response}`;
    } else if (result.metadata.isMissionRelated) {
      responseMessage = `**🎯 ミッション関連メンション - 知識ベース限定回答**\n\n${result.response}\n\n**【良い例・悪い例の確認ポイント】**\n上記の回答で「良い例」と「悪い例」の区分を確認して実践してくださいね！\n\n*信頼度: ${(result.metadata.confidence * 100).toFixed(1)}%, 参照ソース: ${result.metadata.sourcesUsed}件*`;
    } else {
      responseMessage = `**🤖 メンション - 知識ベース限定回答**\n\n${result.response}\n\n*信頼度: ${(result.metadata.confidence * 100).toFixed(1)}%, 参照ソース: ${result.metadata.sourcesUsed}件*`;
    }

    // Discord返信
    const response = await fetch(`https://discord.com/api/v10/channels/${channel_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: responseMessage,
        message_reference: {
          message_id: message.id
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Discord API Error: ${response.status}`);
    }

    console.log('✅ AI回答送信完了');
    return true;

  } catch (error) {
    console.error('❌ メンション処理エラー:', error);
    
    // エラー時の応答
    try {
      await fetch(`https://discord.com/api/v10/channels/${message.channel_id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: `申し訳ございません <@${message.author.id}>さん。処理中にエラーが発生しました。\n\n担任の先生にご相談いただくか、\`/soudan\` コマンドをお試しください。`
        })
      });
    } catch (retryError) {
      console.error('❌ エラー応答送信失敗:', retryError);
    }
    
    return false;
  }
}

// =========================
// Discord Webhookエンドポイント群
// =========================

// メイン Discord Interactions エンドポイント
app.post('/interactions', async (req, res) => {
  try {
    console.log('=== Discord Interaction受信 ===');
    
    // 署名検証
    if (!verifySignature(req)) {
      console.error('❌ 署名検証失敗');
      return res.status(401).send('署名が無効です');
    }

    const interaction = JSON.parse(req.rawBody);
    console.log('Interaction Type:', interaction.type);

    // PING応答
    if (interaction.type === 1) {
      console.log('📍 PING受信 - PONG応答');
      return res.json({ type: 1 });
    }

    // スラッシュコマンド処理
    if (interaction.type === 2 && interaction.data.name === 'soudan') {
      console.log('💬 /soudan コマンド実行');
      
      return res.json({
        type: 4,
        data: {
          content: `🌟 **わなみさんに相談する** 🌟\n\nVTuber育成スクールへようこそ！\nどのようなご相談でしょうか？下のボタンから選択してください✨`,
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
        }
      });
    }

    // ボタンクリック処理（AI機能統合）
    if (interaction.type === 3) {
      const buttonId = interaction.data.custom_id;
      const userId = interaction.member?.user?.id || interaction.user?.id;
      const username = interaction.member?.user?.username || interaction.user?.username || 'Unknown';
      
      console.log(`🔘 ボタンクリック: ${buttonId} by ${username}`);

      // AI対象ボタンの判定
      const AI_TARGET_BUTTONS = ['lesson_question', 'sns_consultation', 'mission_submission'];
      
      if (AI_TARGET_BUTTONS.includes(buttonId)) {
        // AI処理が必要なボタン
        console.log(`🤖 AI処理開始: ${buttonId}`);
        
        // 一時応答（処理中表示）
        await res.json({
          type: 5 // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        try {
          // ボタン種別に応じた質問生成
          let question = '';
          switch (buttonId) {
            case 'lesson_question':
              question = 'レッスンについて質問があります。配信方法や技術的な内容について教えてください。';
              break;
            case 'sns_consultation':
              question = 'SNS運用について相談があります。効果的な投稿方法やフォロワー獲得について教えてください。';
              break;
            case 'mission_submission':
              question = 'ミッション提出について教えてください。提出方法や評価基準について知りたいです。';
              break;
          }

          // AI回答生成
          const result = await generateRAGResponse(question, buttonId, {
            username: username,
            guildName: interaction.guild?.name || '不明',
            channelName: '不明'
          });

          // 回答形式を整理
          let responseMessage;
          if (!result.metadata.canAnswer) {
            responseMessage = `**🚫 知識ベース限定モード - 回答不能**\n\n${result.response}`;
          } else if (result.metadata.isMissionRelated) {
            responseMessage = `**🎯 ミッション関連 - 知識ベース限定回答**\n\n${result.response}\n\n**【良い例・悪い例の確認ポイント】**\n上記の回答で「良い例」と「悪い例」の区分を確認して実践してくださいね！\n\n*信頼度: ${(result.metadata.confidence * 100).toFixed(1)}%, 参照ソース: ${result.metadata.sourcesUsed}件*`;
          } else {
            responseMessage = `**🤖 知識ベース限定回答**\n\n${result.response}\n\n*信頼度: ${(result.metadata.confidence * 100).toFixed(1)}%, 参照ソース: ${result.metadata.sourcesUsed}件*`;
          }

          // フォローアップメッセージで回答送信
          const followupUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
          await fetch(followupUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: responseMessage
            })
          });

          console.log(`✅ AI回答送信完了: ${buttonId}`);

        } catch (error) {
          console.error(`❌ AI処理エラー: ${buttonId}`, error);
          
          // エラー時のフォローアップ
          const followupUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
          await fetch(followupUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: '申し訳ございません。AI処理中にエラーが発生しました。担任の先生にご相談ください。'
            })
          });
        }

      } else {
        // 静的応答ボタン
        const staticResponses = {
          payment_consultation: `**💰 お支払い相談**\n\n以下の情報をお教えください：\n\n🔹 **ご相談内容**\n• 分割払いのご希望\n• お支払い方法の変更\n• 請求書に関するお問い合わせ\n• その他お支払いに関するご質問\n\n🔹 **お急ぎの場合**\nLINE公式アカウント: @wannami-school\nメール: support@wannami-school.com\n\n**※ お支払い情報は個人情報のため、DMまたは専用チャンネルでご相談ください**`,
          
          private_consultation: `**💬 プライベート相談**\n\n🔹 **このようなご相談をお受けしています**\n• VTuber活動への不安や悩み\n• 配信内容やキャラクター設定について\n• ファンとの関係性について\n• 活動継続に関する悩み\n• その他、センシティブなご相談\n\n🔹 **相談方法**\n• **推奨**: わなみさんとのDM（完全プライベート）\n• 専用相談チャンネル（限定公開）\n\n**あなたの気持ちに寄り添って、一緒に解決策を見つけましょう💕**`
        };

        const response = staticResponses[buttonId] || 'このボタンは準備中です。';
        
        return res.json({
          type: 4,
          data: { content: response }
        });
      }
    }

    // その他のInteraction
    console.log('❓ 未対応のInteractionタイプ:', interaction.type);
    return res.status(400).json({ error: '未対応のInteractionです' });

  } catch (error) {
    console.error('❌ Discord Interaction処理エラー:', error);
    return res.status(500).json({ error: 'サーバーエラー' });
  }
});

// メンション検知エンドポイント（Gateway Events用）
app.post('/discord-events', async (req, res) => {
  try {
    console.log('🎯 Discord Events受信');
    
    const event = req.body;
    console.log('Event:', JSON.stringify(event, null, 2));

    // PING応答
    if (event.type === 1) {
      console.log('📍 Gateway PING受信');
      return res.json({ type: 1 });
    }

    // メッセージイベント
    if (event.type === 0 || event.t === 'MESSAGE_CREATE') {
      const message = event.d || event;
      
      // Bot自身のメッセージは無視
      if (message.author?.bot) {
        return res.json({ success: true, ignored: 'bot_message' });
      }

      // メンション確認
      const mentionPatterns = [
        `<@${APPLICATION_ID}>`,           // 通常メンション
        `<@!${APPLICATION_ID}>`,          // ニックネーム付きメンション
      ];

      const isMentioned = mentionPatterns.some(pattern => 
        message.content && message.content.includes(pattern)
      );

      if (isMentioned) {
        console.log('📢 Bot宛メンション検知');
        await handleMention(message);
      }
    }

    res.json({ success: true });

  } catch (error) {
    console.error('❌ Discord Events処理エラー:', error);
    res.status(500).json({ error: error.message });
  }
});

// =========================
// その他のエンドポイント
// =========================

// ヘルスチェックエンドポイント
app.get('/', (req, res) => {
  const stats = isSystemInitialized ? ragSystem.getStats() : {};
  
  res.json({
    status: 'running',
    version: `${VERSION} - Render完全統合版 v15.1.0`,
    features: [
      '✅ Discord署名検証',
      '✅ /soudan スラッシュコマンド',
      '✅ @わなみさん メンション機能 🆕',
      '✅ 5つの相談ボタン',
      '✅ 知識ベース限定AI回答（3ボタン + メンション）',
      '✅ 静的応答（2ボタン）',
      '✅ ミッション特別処理',
      '✅ 回答不能判定',
      '✅ n8n完全削除 - Render単体処理'
    ],
    system: {
      initialized: isSystemInitialized,
      error: initializationError,
      ragEnabled: isSystemInitialized,
      mentionEnabled: true,
      n8nIntegration: false
    },
    endpoints: [
      '/interactions - Discord Interactions',
      '/discord-events - Discord Gateway Events',
      '/ - Health Check',
      '/initialize - Manual Initialization'
    ],
    timestamp: new Date().toISOString()
  });
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
        message: 'Render完全統合システム初期化完了',
        version: 'v15.1.0',
        features: ['メンション機能付き']
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

// サーバー起動
app.listen(PORT, async () => {
  console.log('='.repeat(70));
  console.log(`🚀 Discord Bot Server - Render完全統合版 v15.1.0 起動`);
  console.log(`📡 ポート: ${PORT}`);
  console.log(`🤖 Bot ID: ${APPLICATION_ID}`);
  console.log('🔧 統合機能:');
  console.log('   • /soudan スラッシュコマンド');
  console.log('   • @わなみさん メンション機能 🆕');
  console.log('   • 5つのボタン（AI3つ + 静的2つ）');
  console.log('   • 知識ベース限定回答システム');
  console.log('   • ミッション特別処理（良い例/悪い例）');
  console.log('   • 回答不能判定システム');
  console.log('   • n8n完全削除 - Render単体処理');
  console.log('='.repeat(70));
  
  // 自動初期化
  console.log('⏳ システム初期化開始...');
  await initializeServices();
  
  if (isSystemInitialized) {
    console.log('✅ Render完全統合システム準備完了！');
    console.log('🎯 メンション機能付き - n8n依存なし');
  } else {
    console.log('⚠️ 初期化エラーあり。手動初期化をお試しください。');
  }
});

// グレースフルシャットダウン
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM受信。サーバーをシャットダウンします...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT受信。サーバーをシャットダウンします...');
  process.exit(0);
});
