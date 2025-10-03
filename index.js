require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { google } = require('googleapis');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.raw({ type: 'application/json' }));

// Discord署名検証
function verifyDiscordRequest(req) {
  const signature = req.get('X-Signature-Ed25519');
  const timestamp = req.get('X-Signature-Timestamp');
  const body = req.body;

  if (!signature || !timestamp) {
    return false;
  }

  const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const message = timestamp + rawBody.toString();
  
  try {
    const publicKey = Buffer.from(process.env.DISCORD_PUBLIC_KEY, 'hex');
    const sig = Buffer.from(signature, 'hex');
    
    return crypto.verify(
      null,
      Buffer.from(message),
      { key: publicKey, type: 'ed25519' },
      sig
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Discord Webhook エンドポイント
app.post('/', (req, res) => {
  console.log('Received Discord request:', JSON.stringify(req.body, null, 2));
  
  // 署名検証
  if (!verifyDiscordRequest(req)) {
    console.log('Invalid signature');
    return res.status(401).send('Unauthorized');
  }

  const { type, data } = req.body;

  // PING応答
  if (type === 1) {
    console.log('Responding to PING');
    return res.json({ type: 1 });
  }

  // スラッシュコマンド処理
  if (type === 2) {
    console.log('Processing slash command:', data.name);

    if (data.name === 'soudan') {
      const response = {
        type: 4,
        data: {
          content: "**わなみさんに相談**\n\n以下から相談内容を選択してください：",
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 1,
                  label: "①お支払い相談",
                  custom_id: "payment_consultation",
                  emoji: { name: "💰" }
                },
                {
                  type: 2,
                  style: 1,
                  label: "②プライベート相談",
                  custom_id: "private_consultation",
                  emoji: { name: "🤝" }
                },
                {
                  type: 2,
                  style: 1,
                  label: "③レッスン質問",
                  custom_id: "lesson_question",
                  emoji: { name: "📚" }
                }
              ]
            },
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 1,
                  label: "④SNS運用相談",
                  custom_id: "sns_consultation",
                  emoji: { name: "📱" }
                },
                {
                  type: 2,
                  style: 1,
                  label: "⑤ミッション提出",
                  custom_id: "mission_submission",
                  emoji: { name: "✅" }
                }
              ]
            }
          ]
        }
      };

      console.log('Sending soudan response');
      return res.json(response);
    }
  }

  // ボタンインタラクション処理
  if (type === 3) {
    console.log('Processing button interaction:', data.custom_id);
    
    const buttonId = data.custom_id;
    const staticButtons = ['payment_consultation', 'private_consultation'];
    const aiButtons = ['lesson_question', 'sns_consultation', 'mission_submission'];
    
    if (staticButtons.includes(buttonId)) {
      let message;
      
      switch (buttonId) {
        case 'payment_consultation':
          message = "**💰 お支払い相談**\n\nお支払いに関するご相談は、以下のいずれかの方法でお問い合わせください：\n\n• **Discord DM**: わなみさん（@wannami）まで直接メッセージ\n• **LINE**: @wannami でID検索\n• **メール**: support@wannami-vtuber.com\n\n迅速に対応いたします！";
          break;
        case 'private_consultation':
          message = "**🤝 プライベート相談**\n\n個人的なご相談は、プライベートな環境で対応させていただきます：\n\n• **Discord DM**: わなみさん（@wannami）まで直接メッセージ\n• **LINE**: @wannami でID検索\n• **予約制個別相談**: support@wannami-vtuber.com でご予約\n\nお気軽にご相談ください。";
          break;
      }
      
      const response = {
        type: 4,
        data: {
          content: message,
          flags: 64 // Ephemeral (本人のみ表示)
        }
      };
      
      console.log('Sending static response for:', buttonId);
      return res.json(response);
    }
    
    if (aiButtons.includes(buttonId)) {
      const response = {
        type: 4,
        data: {
          content: `**${getButtonLabel(buttonId)}**\n\n質問やご相談内容を次のメッセージでお聞かせください。わなみさんがAIでお答えします！\n\n*（このメッセージの後に、通常のチャットで質問を投稿してください）*`,
          flags: 64 // Ephemeral (本人のみ表示)
        }
      };
      
      console.log('Sending AI prompt response for:', buttonId);
      return res.json(response);
    }
  }

  console.log('Unhandled request type:', type);
  res.status(400).json({ error: 'Unhandled request type' });
});

// ボタンラベル取得ヘルパー関数
function getButtonLabel(buttonId) {
  const labels = {
    'lesson_question': '📚 レッスン質問',
    'sns_consultation': '📱 SNS運用相談', 
    'mission_submission': '✅ ミッション提出'
  };
  return labels[buttonId] || buttonId;
}

// Google Drive設定
const drive = google.drive({
  version: 'v3',
  auth: new google.auth.GoogleAuth({
    credentials: {
      type: 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.GOOGLE_CLIENT_EMAIL?.replace('@', '%40')}`
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  })
});

// OpenAI設定
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 知識ベース読み込み関数
async function loadKnowledgeBase() {
  try {
    console.log('Loading knowledge base from Google Drive...');
    
    const folderId = '1kCKhCZG9XwbU1fRNIz6jQNVbmJPl7kMI';
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType)',
    });

    const files = response.data.files;
    console.log(`Found ${files.length} files in knowledge base folder`);

    let knowledgeBase = '';

    for (const file of files) {
      try {
        console.log(`Processing file: ${file.name}`);
        
        if (file.mimeType === 'application/vnd.google-apps.document') {
          const exportResponse = await drive.files.export({
            fileId: file.id,
            mimeType: 'text/plain',
          });
          
          knowledgeBase += `\n\n=== ${file.name} ===\n`;
          knowledgeBase += exportResponse.data;
        }
      } catch (fileError) {
        console.error(`Error processing file ${file.name}:`, fileError.message);
      }
    }
    
    console.log(`Knowledge base loaded successfully. Total length: ${knowledgeBase.length} characters`);
    return knowledgeBase;
    
  } catch (error) {
    console.error('Error loading knowledge base:', error);
    return null;
  }
}

// AI回答生成関数
async function generateAIResponse(question, buttonId, knowledgeBase) {
  try {
    console.log(`Generating AI response for button: ${buttonId}`);
    
    let systemPrompt = `あなたはVTuber育成スクール「わなみさん」のAIアシスタントです。
以下の知識ベースを参考に、生徒からの質問に親切で具体的な回答をしてください。

知識ベース：
${knowledgeBase || '知識ベースが利用できません。一般的な回答をしてください。'}

回答の際は：
- 親しみやすく、わかりやすい言葉で説明してください
- 具体的なアドバイスや例を含めてください
- 必要に応じて段階的な手順を提示してください
- VTuber活動に特化した内容を心がけてください`;

    // ボタンタイプ別の追加指示
    switch (buttonId) {
      case 'lesson_question':
        systemPrompt += '\n\n特に「レッスン内容」に関する質問として回答してください。レッスン資料の内容を参考に詳しく説明してください。';
        break;
      case 'sns_consultation':
        systemPrompt += '\n\n特に「SNS運用」に関する相談として回答してください。TwitterやYouTube、TikTokなどのプラットフォーム運用について具体的なアドバイスをしてください。';
        break;
      case 'mission_submission':
        systemPrompt += '\n\n特に「ミッション提出」に関する質問として回答してください。課題の取り組み方や提出方法について説明してください。';
        break;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;
    console.log('AI response generated successfully');
    return aiResponse;

  } catch (error) {
    console.error('Error generating AI response:', error);
    return 'すみません、現在AI回答システムに問題が発生しています。後ほど再度お試しいただくか、直接わなみさんまでご連絡ください。';
  }
}

// AI処理用エンドポイント（n8nから呼び出される）
app.post('/ai-process', async (req, res) => {
  try {
    console.log('AI processing request received:', JSON.stringify(req.body, null, 2));
    
    // パラメータ名を修正：question_text → message_content
    const { button_id, message_content, user_id, username } = req.body;
    
    if (!message_content) {
      console.log('No message content provided');
      return res.status(400).json({ 
        error: '質問テキストが必要です',
        received_data: req.body 
      });
    }

    if (!button_id) {
      console.log('No button ID provided');
      return res.status(400).json({ 
        error: 'ボタンIDが必要です',
        received_data: req.body 
      });
    }

    console.log(`Processing AI request for user: ${username} (${user_id}), button: ${button_id}`);
    console.log(`Question: ${message_content}`);

    // 知識ベース読み込み
    const knowledgeBase = await loadKnowledgeBase();
    
    // AI回答生成
    const aiResponse = await generateAIResponse(message_content, button_id, knowledgeBase);
    
    // 回答をフォーマット
    const formattedResponse = `**${getButtonLabel(button_id)} - AI回答**\n\n${aiResponse}\n\n*回答：わなみさんAI*`;
    
    console.log('AI response ready to send');
    
    return res.json({
      success: true,
      response: formattedResponse,
      button_id: button_id,
      original_question: message_content
    });

  } catch (error) {
    console.error('Error in AI processing:', error);
    return res.status(500).json({ 
      error: 'AI処理中にエラーが発生しました',
      details: error.message 
    });
  }
});

// ヘルスチェック用エンドポイント
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'わなみさん Discord Bot API v7.0.0',
    timestamp: new Date().toISOString()
  });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 わなみさん Discord Bot server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Discord Public Key configured: ${process.env.DISCORD_PUBLIC_KEY ? 'Yes' : 'No'}`);
  console.log(`🔧 Google API configured: ${process.env.GOOGLE_CLIENT_EMAIL ? 'Yes' : 'No'}`);
  console.log(`🔧 OpenAI API configured: ${process.env.OPENAI_API_KEY ? 'Yes' : 'No'}`);
});

// プロセス終了処理
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});
