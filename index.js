const express = require('express');
const axios = require('axios');
const nacl = require('tweetnacl');
const app = express();
const PORT = process.env.PORT || 3000;

// 🆕 AI対象ボタンの定義
const AI_TARGET_BUTTONS = {
  lesson_question: true,      // ③レッスン質問
  sns_consultation: true,     // ④SNS運用相談
  mission_submission: true    // ⑤ミッション提出
};

// 🆕 n8n Webhook URL
const N8N_WEBHOOK_URL = 'https://kyo10310405.app.n8n.cloud/webhook/053be54b-55c7-4c3e-8eb7-4f9b6c63656d';

// Discord署名検証関数
function verifyDiscordSignature(signature, timestamp, body, publicKey) {
  try {
    const timestampBuffer = Buffer.from(timestamp, 'utf8');
    const bodyBuffer = Buffer.from(body);
    const message = Buffer.concat([timestampBuffer, bodyBuffer]);
    
    const signatureBuffer = Buffer.from(signature, 'hex');
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    
    return nacl.sign.detached.verify(message, signatureBuffer, publicKeyBuffer);
  } catch (error) {
    console.error('署名検証エラー:', error);
    return false;
  }
}

// Raw body parser for Discord webhook
app.use('/discord', express.raw({ type: 'application/json' }));
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Discord Bot - VTuber School',
    timestamp: new Date().toISOString(),
    version: '6.0.0', // 🆕 Version更新
    features: {
      slash_commands: true,
      button_interactions: true,
      static_responses: true,
      ai_responses: 'phase_1_active', // 🆕 AI機能Phase 1
      ai_target_buttons: ['lesson_question', 'sns_consultation', 'mission_submission']
    }
  });
});

// 🆕 AI処理中の初期応答メッセージ
const AI_PROCESSING_RESPONSES = {
  lesson_question: `🤖 **わなみさんがAI分析中です...** 📚

あなたのレッスンに関するご質問を分析しています！
知識ベースから最適な回答を検索中です✨

⏱️ **少々お待ちください（約30秒程度）**
詳細な回答をお届けします💕`,

  sns_consultation: `🤖 **わなみさんのAI戦略分析中...** 📱

あなたのSNS運用状況を分析して、
個別の戦略提案を準備しています🚀

⏱️ **少々お待ちください（約45秒程度）**
カスタマイズされたアドバイスをお届けします✨`,

  mission_submission: `🤖 **わなみさんのAIフィードバック生成中...** 🎯

あなたのミッション内容を詳細に分析して、
成長につながるフィードバックを作成中です📈

⏱️ **少々お待ちください（約60秒程度）**
個別の成長アドバイスをお届けします💕`
};

// 🆕 n8n Webhookにデータ送信する関数
async function sendToN8N(buttonId, interaction) {
  try {
    const payload = {
      button_id: buttonId,
      user_id: interaction.user?.id || interaction.member?.user?.id,
      username: interaction.user?.username || interaction.member?.user?.username,
      guild_id: interaction.guild_id,
      channel_id: interaction.channel_id,
      timestamp: new Date().toISOString(),
      ai_request: true,
      phase: 1
    };

    console.log('🚀 n8nにAI処理依頼送信中:', payload);
    
    const response = await axios.post(N8N_WEBHOOK_URL, payload, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ n8n送信成功:', response.status);
  } catch (error) {
    console.error('❌ n8n送信エラー:', error.message);
  }
}

// ボタン応答生成関数 - 改行修正版 + AI機能対応
function generateButtonResponse(customId, interaction = null) {
  // 🆕 AI対象ボタンの判定
  if (AI_TARGET_BUTTONS[customId]) {
    console.log(`🤖 AI処理対象ボタン: ${customId}`);
    
    // AI処理をn8nに非同期依頼（応答は待たない）
    if (interaction) {
      sendToN8N(customId, interaction).catch(error => {
        console.error('n8n送信失敗:', error);
      });
    }
    
    // AI処理中の初期応答を返す
    return {
      type: 4,
      data: {
        content: AI_PROCESSING_RESPONSES[customId],
      }
    };
  }

  // 静的応答ボタン（従来通り）
  switch (customId) {
    case 'payment_consultation':
      return {
        type: 4,
        data: {
          content: "申し訳ございません。お支払いに関してはここでは相談できません。\n💡 **管理者の方へ**：ここに適切な担当者のメンションを設定してください。\n\n例：<@USER_ID>にご相談ください。",
        }
      };
    
    case 'private_consultation':
      return {
        type: 4,
        data: {
          content: "申し訳ございません。プライベートなご相談については\nここでは回答できません。\n\n🎓 **担任の先生に直接ご相談ください。**",
        }
      };
    
    default:
      return {
        type: 4,
        data: {
          content: "❌ 申し訳ございません。認識できない選択肢です。\n再度メニューから選択してください。",
        }
      };
  }
}

// Discord webhook処理
app.post('/discord', async (req, res) => {
  console.log('=== Discord Interaction 受信 ===');
  console.log('Time:', new Date().toISOString());
  
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  
  // 署名検証
  if (publicKey) {
    const isValid = verifyDiscordSignature(signature, timestamp, req.body, publicKey);
    console.log('署名検証結果:', isValid);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }
  
  let body;
  try {
    body = JSON.parse(req.body.toString());
  } catch (error) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  
  console.log('Type:', body.type);
  console.log('Command/Custom ID:', body.data?.name || body.data?.custom_id);
  console.log('User:', body.member?.user?.username || body.user?.username);
  
  // PING認証応答
  if (body.type === 1) {
    console.log('🏓 PING認証 - 直接応答');
    return res.json({ type: 1 });
  }
  
  // /soudan スラッシュコマンド - Render.comで即座応答
  if (body.type === 2 && body.data?.name === 'soudan') {
    console.log('⚡ /soudan コマンド - Render.com即座応答');
    
    const userId = body.member?.user?.id || body.user?.id;
    const response = {
      type: 4,
      data: {
        content: `こんにちは <@${userId}>さん！\nどのようなご相談でしょうか？以下から選択してください：`,
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
    };

    console.log('✅ Discord即座応答送信');
    return res.json(response);
  }
  
  // ボタンクリック - Render.comで即座応答 + AI機能対応
  if (body.type === 3) {
    const buttonId = body.data?.custom_id;
    console.log('🔘 ボタンクリック - Render.com即座応答');
    console.log('Button ID:', buttonId);
    
    // 🆕 AI対象ボタンの場合、interaction情報も渡す
    const response = generateButtonResponse(buttonId, body);
    
    if (AI_TARGET_BUTTONS[buttonId]) {
      console.log('🤖 AI処理開始 - 初期応答送信 + n8n通知');
    } else {
      console.log('📝 静的応答送信:', buttonId);
    }
    
    return res.json(response);
  }
  
  // その他の未対応タイプ
  console.log('❓ 未対応のInteractionタイプ:', body.type);
  res.status(400).json({ error: 'Unsupported interaction type' });
});

app.listen(PORT, () => {
  console.log('=== Discord Bot VTuber School v6.0 ===');
  console.log(`📍 Port: ${PORT}`);
  console.log('✅ Static responses: Render.com');
  console.log('🤖 AI responses: Phase 1 Active');
  console.log(`🔗 n8n Webhook: ${N8N_WEBHOOK_URL}`);
  console.log('🎯 AI Target Buttons: lesson_question, sns_consultation, mission_submission');
  console.log('=====================================');
});
