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
    version: '4.0.0',
    features: {
      slash_commands: true,
      button_interactions: true,
      n8n_integration: true
    }
  });
});

// Discord webhook - ハイブリッド処理
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
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        content: `こんにちは <@${userId}>さん！\\nどのようなご相談でしょうか？以下から選択してください：`,
        components: [
          {
            type: 1, // Action Row
            components: [
              {
                type: 2, // Button
                style: 1, // Primary (Blue)
                label: "お支払いに関する相談",
                custom_id: "payment_consultation"
              },
              {
                type: 2,
                style: 2, // Secondary (Gray)
                label: "プライベートなご相談",
                custom_id: "private_consultation"
              },
              {
                type: 2,
                style: 3, // Success (Green)
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
  
  // ボタンクリック - n8nに転送
  if (body.type === 3) {
    console.log('🔘 ボタンクリック - n8n転送');
    console.log('Button ID:', body.data?.custom_id);
    
    try {
      const n8nUrl = process.env.N8N_WEBHOOK_URL || 'https://kyo10310405.app.n8n.cloud/webhook/053be54b-55c7-4c3e-8eb7-4f9b6c63656d';
      
      const response = await axios.post(n8nUrl, body, {
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'Discord-Bot-Render/4.0'
        },
        timeout: 2500 // 2.5秒でタイムアウト
      });
      
      console.log('✅ n8n応答受信:', response.status);
      return res.json(response.data);
      
    } catch (error) {
      console.error('❌ n8n転送エラー:', error.message);
      
      // エラー時のフォールバック応答
      const fallbackResponse = {
        type: 4,
        data: {
          content: "申し訳ございません。一時的にサービスが利用できません。\\nしばらく経ってから再度お試しください。",
          flags: 64 // ephemeral - 本人のみ表示
        }
      };
      
      return res.json(fallbackResponse);
    }
  }
  
  // その他の未対応タイプ
  console.log('❓ 未対応のInteractionタイプ:', body.type);
  res.status(400).json({ error: 'Unsupported interaction type' });
});

app.listen(PORT, () => {
  console.log('=== Discord Bot VTuber School Started ===');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔗 N8N URL: ${process.env.N8N_WEBHOOK_URL || 'Default'}`);
  console.log('✅ Ready for hybrid processing');
  console.log('==========================================');
});
