const express = require('express');
const axios = require('axios');
const nacl = require('tweetnacl');
const app = express();
const PORT = process.env.PORT || 3000;

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
    version: '5.0.0',
    features: {
      slash_commands: true,
      button_interactions: true,
      static_responses: true,
      ai_responses: 'coming_soon'
    }
  });
});

// ボタン応答生成関数 - 改行修正版
function generateButtonResponse(customId) {
  switch (customId) {
    case 'payment_consultation':
      return {
        type: 4,
        data: {
          content: "申し訳ございません。お支払いに関してはここでは相談できません。\n💡 **管理者の方へ**：ここに適切な担当者のメンションを設定してください。\n\n例：<@USER_ID>にご相談ください。"
        }
      };
    
    case 'private_consultation':
      return {
        type: 4,
        data: {
          content: "申し訳ございません。プライベートなご相談については\nここでは回答できません。\n\n🎓 **担任の先生に直接ご相談ください。**"
        }
      };
    
    case 'lesson_question':
      return {
        type: 4,
        data: {
          content: "📚 **レッスンについてのご質問ですね！**\n\n🤖 AI回答機能は現在準備中です。\nもうしばらくお待ちください。\n\n📝 **一時的な対応**：\n• 具体的なレッスン番号と質問内容を教えてください\n• 担任の先生にご相談いただくことも可能です"
        }
      };
    
    case 'sns_consultation':
      return {
        type: 4,
        data: {
          content: "📱 **X・YouTubeの運用相談ですね！**\n\n🤖 AI回答機能は現在準備中です。\nもうしばらくお待ちください。\n\n📝 **一時的な対応**：\n• どのような運用でお困りですか？\n• 担任の先生にご相談いただくことも可能です"
        }
      };
    
    case 'mission_submission':
      return {
        type: 4,
        data: {
          content: "📋 **ミッションの提出ですね！**\n\n🤖 AI回答機能は現在準備中です。\nもうしばらくお待ちください。\n\n📝 **一時的な対応**：\n• どちらのミッションでしょうか？\n• 担任の先生にご相談いただくことも可能です"
        }
      };
    
    default:
      return {
        type: 4,
        data: {
          content: "❌ 申し訳ございません。認識できない選択肢です。\n再度メニューから選択してください。"
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
    // /soudan スラッシュコマンド応答も修正
const response = {
  type: 4,
  data: {
    content: `こんにちは <@${userId}>さん！\nどのようなご相談でしょうか？以下から選択してください：`,
    // 以下components部分は変更なし
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
  
  // ボタンクリック - Render.comで即座応答
  if (body.type === 3) {
    console.log('🔘 ボタンクリック - Render.com即座応答');
    console.log('Button ID:', body.data?.custom_id);
    
    const response = generateButtonResponse(body.data?.custom_id);
    console.log('✅ ボタン応答送信:', body.data?.custom_id);
    
    // 将来のAI機能用にn8nに非同期通知（応答は待たない）
    const aiButtons = ['lesson_question', 'sns_consultation', 'mission_submission'];
    if (aiButtons.includes(body.data?.custom_id)) {
      console.log('🤖 AI機能対象ボタン - 将来の拡張用');
      // 将来ここでn8nに非同期通知を送信予定
    }
    
    return res.json(response);
  }
  
  // その他の未対応タイプ
  console.log('❓ 未対応のInteractionタイプ:', body.type);
  res.status(400).json({ error: 'Unsupported interaction type' });
});

app.listen(PORT, () => {
  console.log('=== Discord Bot VTuber School v5.0 ===');
  console.log(`📍 Port: ${PORT}`);
  console.log('✅ All responses handled by Render.com');
  console.log('🤖 AI features: Coming Soon');
  console.log('=====================================');
});
