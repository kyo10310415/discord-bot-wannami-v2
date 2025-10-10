// index.js - Discord Bot 完全統合版（Gateway + Interactions）v15.2.0

const express = require('express');
const crypto = require('crypto');
const { Client, GatewayIntentBits } = require('discord.js');

// 設定・サービス読み込み
const { VERSION, FEATURES, BOT_USER_ID } = require('./config/constants');
const environment = require('./config/environment');
const googleApisService = require('./services/google-apis');
const openaiService = require('./services/openai-service');
const knowledgeBaseService = require('./services/knowledge-base');
const ragSystem = require('./services/rag-system');

const app = express();
const PORT = environment.PORT;

// Discord設定
const PUBLIC_KEY = environment.DISCORD_PUBLIC_KEY;
const BOT_TOKEN = environment.DISCORD_BOT_TOKEN;
const APPLICATION_ID = environment.DISCORD_APPLICATION_ID || BOT_USER_ID;
const ROLE_ID = '1420336261817831464'; // わなみさんロールID

// グローバル状態管理
let isSystemInitialized = false;
let initializationError = null;

// Discord Gateway Client初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

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

// =========================
// Discord Gateway Events（メンション処理）
// =========================

client.on('ready', () => {
  console.log(`✅ Discord Gateway: ${client.user.tag} メッセージ監視開始`);
});

client.on('messageCreate', async (message) => {
  console.log(`📨 メッセージ受信: ${message.author.username} - "${message.content}"`);
  
  // Bot自身のメッセージは無視
  if (message.author.bot) {
    console.log('🤖 Bot投稿のためスキップ');
    return;
  }
  
  // メンション検出（ユーザーメンション + ロールメンション）
  const botUserMentioned = message.mentions.users.has(APPLICATION_ID) || 
                          message.content.includes(`<@${APPLICATION_ID}>`) ||
                          message.content.includes(`<@!${APPLICATION_ID}>`);
  
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
      // Bot IDを除去してクリーンな質問を抽出
      const cleanContent = message.content
        .replace(new RegExp(`<@!?${APPLICATION_ID}>`, 'g'), '')
        .replace(`<@&${ROLE_ID}>`, '')
        .trim();

      console.log(`🧹 クリーン後の内容: "${cleanContent}"`);

      // 質問が空の場合はメニューボタンを表示
      if (!cleanContent || cleanContent.length < 3) {
        console.log('❓ 質問が空のため、メニューボタン表示');
        
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
        
        console.log('✅ メニューボタン送信完了');
        return;
      }

      // 具体的な質問がある場合はAI回答生成
      console.log('🤖 AI回答生成開始');
      
      // 「処理中...」メッセージを送信
      const processingMessage = await message.channel.send('🤖 AI回答を生成中です...');
      
      const result = await generateRAGResponse(cleanContent, 'mention', {
        username: message.author.username,
        guildName: message.guild?.name || '不明',
        channelName: message.channel.name || '不明'
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

      // 処理中メッセージを削除して、AI回答を送信
      await processingMessage.delete();
      await message.reply(responseMessage);

      console.log('✅ AI回答送信完了');
      
    } catch (error) {
      console.error('❌ メンション処理エラー:', error.message);
      console.error('詳細:', error);
      
      try {
        await message.reply(`申し訳ございません <@${message.author.id}>さん。処理中にエラーが発生しました。\n\n担任の先生にご相談いただくか、\`/soudan\` コマンドをお試しください。`);
      } catch (retryError) {
        console.error('❌ エラー応答送信失敗:', retryError);
      }
    }
  } else {
    console.log('🔍 メンションなし - 処理スキップ');
  }
});

// Gateway エラーハンドリング
client.on('error', error => {
  console.error('❌ Discord Gateway エラー:', error);
});

// =========================
// Discord Interactions（スラッシュコマンド・ボタン処理）
// =========================

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

// =========================
// その他のエンドポイント
// =========================

// ヘルスチェックエンドポイント
app.get('/', (req, res) => {
  const stats = isSystemInitialized ? ragSystem.getStats() : {};
  
  res.json({
    status: 'running',
    version: `${VERSION} - Gateway+Interactions統合版 v15.2.0`,
    features: [
      '✅ Discord署名検証',
      '✅ Discord Gateway（WebSocket）',
      '✅ /soudan スラッシュコマンド',
      '✅ @わなみさん メンション機能（統合版）',
      '✅ ロールメンション対応',
      '✅ 5つの相談ボタン',
      '✅ 知識ベース限定AI回答',
      '✅ ミッション特別処理',
      '✅ 回答不能判定',
      '✅ 完全統合 - 単一プロセス'
    ],
    system: {
      initialized: isSystemInitialized,
      error: initializationError,
      ragEnabled: isSystemInitialized,
      gatewayConnected: client.readyAt !== null,
      mentionEnabled: true,
      roleId: ROLE_ID
    },
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
        message: 'Gateway+Interactions統合システム初期化完了',
        version: 'v15.2.0',
        features: ['Gateway統合', 'メンション機能', 'ロール対応']
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
  console.log(`🚀 Discord Bot Server - Gateway+Interactions統合版 v15.2.0 起動`);
  console.log(`📡 ポート: ${PORT}`);
  console.log(`🤖 Bot ID: ${APPLICATION_ID}`);
  console.log(`🎭 Role ID: ${ROLE_ID}`);
  console.log('🔧 統合機能:');
  console.log('   • Discord Gateway（WebSocket）- メンション監視');
  console.log('   • Discord Interactions（HTTP）- スラッシュコマンド・ボタン');
  console.log('   • /soudan スラッシュコマンド');
  console.log('   • @わなみさん メンション + ロールメンション');
  console.log('   • 5つのボタン（AI3つ + 静的2つ）');
  console.log('   • 知識ベース限定回答システム');
  console.log('   • ミッション特別処理（良い例/悪い例）');
  console.log('   • 回答不能判定システム');
  console.log('   • 完全統合 - 単一プロセス');
  console.log('='.repeat(70));
  
  // Discord Gateway接続
  console.log('🔗 Discord Gateway接続開始...');
  if (!BOT_TOKEN) {
    console.error('❌ DISCORD_BOT_TOKEN環境変数が設定されていません');
    process.exit(1);
  }
  
  try {
    await client.login(BOT_TOKEN);
    console.log('✅ Discord Gateway接続成功');
  } catch (error) {
    console.error('❌ Discord Gateway接続失敗:', error);
    process.exit(1);
  }
  
  // 自動初期化
  console.log('⏳ システム初期化開始...');
  await initializeServices();
  
  if (isSystemInitialized) {
    console.log('✅ Gateway+Interactions統合システム準備完了！');
    console.log('🎯 メンション機能統合 - 単一プロセス');
  } else {
    console.log('⚠️ 初期化エラーあり。手動初期化をお試しください。');
  }
});

// グレースフルシャットダウン
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM受信。サーバーをシャットダウンします...');
  client.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT受信。サーバーをシャットダウンします...');
  client.destroy();
  process.exit(0);
});
