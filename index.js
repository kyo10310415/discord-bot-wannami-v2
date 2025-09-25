const express = require('express');
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
    message: 'Discord Bot Wannami V2 is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Discord webhook endpoint with signature verification
app.post('/discord', (req, res) => {
  console.log('=== Discord Request Received ===');
  console.log('Time:', new Date().toISOString());
  
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  
  console.log('Signature:', signature);
  console.log('Timestamp:', timestamp);
  console.log('Public Key:', publicKey ? 'Set' : 'Not Set');
  
  // Signature verification
  if (!publicKey) {
    console.error('DISCORD_PUBLIC_KEY environment variable not set');
    return res.status(500).json({ error: 'Public key not configured' });
  }
  
  const isValid = verifyDiscordSignature(signature, timestamp, req.body, publicKey);
  console.log('Signature verification result:', isValid);
  
  if (!isValid) {
    console.error('Signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  let body;
  try {
    body = JSON.parse(req.body.toString());
    console.log('Request Type:', body.type);
  } catch (error) {
    console.error('JSON Parse Error:', error);
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  
  // Handle Discord PING (Type 1)
  if (body.type === 1) {
    console.log('Discord PING - Responding with PONG');
    return res.json({ type: 1 });
  }
  
  // Handle Slash Commands (Type 2)
  if (body.type === 2) {
    console.log('Slash Command Received:', body.data?.name);
    
    const response = {
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: {
        content: `こんにちは <@${body.member?.user?.id || body.user?.id}>さん！\nどのようなご相談でしょうか？以下から選択してください：`,
        components: [
          {
            type: 1, // ACTION_ROW
            components: [
              {
                type: 2, // BUTTON
                style: 1, // PRIMARY
                label: '💰 お支払いに関する相談',
                custom_id: 'payment_consultation'
              },
              {
                type: 2,
                style: 2, // SECONDARY
                label: '🔒 プライベートなご相談',
                custom_id: 'private_consultation'
              },
              {
                type: 2,
                style: 3, // SUCCESS
                label: '📚 レッスンについての質問',
                custom_id: 'lesson_question'
              }
            ]
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: '📱 X・YouTubeの運用相談',
                custom_id: 'sns_consultation'
              },
              {
                type: 2,
                style: 1,
                label: '📋 ミッションの提出',
                custom_id: 'mission_submission'
              }
            ]
          }
        ]
      }
    };
    
    console.log('Sending menu response');
    return res.json(response);
  }
  
  // Handle Button Clicks (Type 3)
  if (body.type === 3) {
    console.log('Button Click:', body.data?.custom_id);
    
    const customId = body.data.custom_id;
    let responseContent = '';
    
    switch (customId) {
      case 'payment_consultation':
        responseContent = "申し訳ございません。お支払いに関してはここでは相談できません。\n💡 管理者にご相談ください。";
        break;
      case 'private_consultation':
        responseContent = "申し訳ございません。プライベートなご相談については\nここでは回答できません。\n\n🎓 **担任の先生に直接ご相談ください。**";
        break;
      case 'lesson_question':
        responseContent = "📚 **レッスンについてのご質問ですね！**\n\n🤖 AI回答機能は現在準備中です。\nもうしばらくお待ちください。";
        break;
      case 'sns_consultation':
        responseContent = "📱 **X・YouTubeの運用相談ですね！**\n\n🤖 AI回答機能は現在準備中です。\nもうしばらくお待ちください。";
        break;
      case 'mission_submission':
        responseContent = "📋 **ミッションの提出ですね！**\n\n🤖 AI回答機能は現在準備中です。\nもうしばらくお待ちください。";
        break;
      default:
        responseContent = "❌ 認識できない選択肢です。\n再度メニューから選択してください。";
    }
    
    const response = {
      type: 4,
      data: {
        content: responseContent,
        flags: 64 // EPHEMERAL (本人のみ表示)
      }
    };
    
    console.log('Sending button response');
    return res.json(response);
  }
  
  // Default response
  res.json({ message: 'Request received' });
});

// Start server
app.listen(PORT, () => {
  console.log('=== Server Started ===');
  console.log(`Port: ${PORT}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Discord Public Key: ${process.env.DISCORD_PUBLIC_KEY ? 'Set' : 'Not Set'}`);
  console.log('====================');
});
