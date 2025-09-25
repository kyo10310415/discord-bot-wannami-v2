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
    message: 'Discord Trigger Gateway',
    timestamp: new Date().toISOString(),
    version: '3.0.0'
  });
});

// Discord webhook - トリガー検知のみ
app.post('/discord', async (req, res) => {
  console.log('=== Discord Trigger 受信 ===');
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
  
  // PING認証のみ直接応答
  if (body.type === 1) {
    console.log('PING認証 - 直接応答');
    return res.json({ type: 1 });
  }
  
  // それ以外は全てn8nに丸投げ
  try {
    console.log('n8nに完全転送:', body.type === 2 ? 'Slash Command' : body.type === 3 ? 'Button Click' : 'Other');
    
    const n8nUrl = process.env.N8N_WEBHOOK_URL || 'https://kyo10310405.app.n8n.cloud/webhook/053be54b-55c7-4c3e-8eb7-4f9b6c63656d';
    
    const response = await axios.post(n8nUrl, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    
    console.log('n8n処理完了 - Discord応答転送');
    return res.json(response.data);
    
  } catch (error) {
    console.error('n8n転送エラー:', error.message);
    return res.status(500).json({ error: 'Processing failed' });
  }
});

app.listen(PORT, () => {
  console.log('=== Discord Trigger Gateway Started ===');
  console.log(`Port: ${PORT}`);
  console.log(`N8N URL: ${process.env.N8N_WEBHOOK_URL || 'Default'}`);
  console.log('======================================');
});
