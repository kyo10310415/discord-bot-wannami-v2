const express = require('express');
const axios = require('axios');
const nacl = require('tweetnacl');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// AI対象ボタンの定義
const AI_TARGET_BUTTONS = {
  lesson_question: true,      // ③レッスン質問
  sns_consultation: true,     // ④SNS運用相談
  mission_submission: true    // ⑤ミッション提出
};

// n8n Webhook URL
const N8N_WEBHOOK_URL = 'https://kyo10310405.app.n8n.cloud/webhook/053be54b-55c7-4c3e-8eb7-4f9b6c63656d';

// 🆕 新しいスプレッドシート設定
const KNOWLEDGE_SPREADSHEET_ID = '16BO2pz7Wi36MKwxFZFo5YyaANzVfajkPkXtw1xtSJbQ';

// 🆕 API Keys設定（環境変数使用）
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Google APIs設定
let drive = null;
let sheets = null;
let openai = null;

// 初期化を遅延実行
function initializeServices() {
  if (!drive && process.env.GOOGLE_CLIENT_EMAIL) {
    try {
      const auth = new google.auth.GoogleAuth({
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
        scopes: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/spreadsheets.readonly',
          'https://www.googleapis.com/auth/presentations.readonly',
          'https://www.googleapis.com/auth/documents.readonly'
        ]
      });

      drive = google.drive({ version: 'v3', auth });
      sheets = google.sheets({ version: 'v4', auth });
      console.log('Google APIs initialized');
    } catch (error) {
      console.error('Google APIs initialization failed:', error.message);
    }
  }

  if (!openai && OPENAI_API_KEY) {
    try {
      const OpenAI = require('openai');
      openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      console.log('OpenAI initialized');
    } catch (error) {
      console.error('OpenAI initialization failed:', error.message);
    }
  }
}

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

// 🆕 スプレッドシートからURL一覧を読み込む関数
async function loadUrlListFromSpreadsheet() {
  try {
    if (!sheets) {
      console.log('Google Sheets not initialized');
      return [];
    }

    console.log('Loading URL list from spreadsheet...');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: KNOWLEDGE_SPREADSHEET_ID,
      range: 'A2:E50', // ヘッダー除く、データ行のみ
    });

    const rows = response.data.values || [];
    const urlList = rows
      .filter(row => row[0] && row[1]) // ファイル名とURLがある行のみ
      .map(row => ({
        fileName: row[0],
        url: row[1],
        category: row[2] || 'その他',
        type: row[3] || 'unknown',
        range: row[4] || ''
      }));

    console.log(`Found ${urlList.length} URLs in spreadsheet`);
    return urlList;

  } catch (error) {
    console.error('Error loading spreadsheet:', error);
    return [];
  }
}

// 🆕 Google Slidesの内容を読み込む関数
async function loadGoogleSlides(url, fileName) {
  try {
    // URLからプレゼンテーションIDを抽出
    const match = url.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Slides URL');
    }
    
    const presentationId = match[1];
    const slides = google.slides({ version: 'v1', auth: drive.auth });
    
    const presentation = await slides.presentations.get({
      presentationId: presentationId,
    });

    let content = `${fileName}\n${'='.repeat(50)}\n`;
    
    // 各スライドのテキストを抽出
    if (presentation.data.slides) {
      presentation.data.slides.forEach((slide, index) => {
        content += `\n--- スライド ${index + 1} ---\n`;
        
        if (slide.pageElements) {
          slide.pageElements.forEach(element => {
            if (element.shape && element.shape.text && element.shape.text.textElements) {
              element.shape.text.textElements.forEach(textElement => {
                if (textElement.textRun && textElement.textRun.content) {
                  content += textElement.textRun.content;
                }
              });
            }
          });
        }
        content += '\n';
      });
    }

    console.log(`Loaded Google Slides: ${fileName} (${content.length} chars)`);
    return content;

  } catch (error) {
    console.error(`Error loading Google Slides ${fileName}:`, error.message);
    return `${fileName}: 読み込みエラー - ${error.message}`;
  }
}

// 🆕 Google Docsの内容を読み込む関数
async function loadGoogleDocs(url, fileName) {
  try {
    // URLからドキュメントIDを抽出
    const match = url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      throw new Error('Invalid Google Docs URL');
    }
    
    const documentId = match[1];
    const docs = google.docs({ version: 'v1', auth: drive.auth });
    
    const document = await docs.documents.get({
      documentId: documentId,
    });

    let content = `${fileName}\n${'='.repeat(50)}\n`;
    
    // ドキュメントの内容を抽出
    if (document.data.body && document.data.body.content) {
      document.data.body.content.forEach(element => {
        if (element.paragraph && element.paragraph.elements) {
          element.paragraph.elements.forEach(paragraphElement => {
            if (paragraphElement.textRun && paragraphElement.textRun.content) {
              content += paragraphElement.textRun.content;
            }
          });
        }
      });
    }

    console.log(`Loaded Google Docs: ${fileName} (${content.length} chars)`);
    return content;

  } catch (error) {
    console.error(`Error loading Google Docs ${fileName}:`, error.message);
    return `${fileName}: 読み込みエラー - ${error.message}`;
  }
}

// 🆕 URL先のコンテンツを読み込む関数
async function loadContentFromUrl(urlInfo) {
  const { url, fileName, category, type } = urlInfo;
  
  try {
    if (url.includes('docs.google.com/presentation')) {
      return await loadGoogleSlides(url, fileName);
    } else if (url.includes('docs.google.com/document')) {
      return await loadGoogleDocs(url, fileName);
    } else if (url.includes('notion.so')) {
      // Notionは公開URLの場合、通常のHTTPリクエストで読み込み
      console.log(`Notion URL detected: ${fileName} - スキップ中`);
      return `${fileName}: Notion連携は今後実装予定`;
    } else {
      console.log(`Unknown URL type: ${fileName}`);
      return `${fileName}: 未対応のURL形式`;
    }
  } catch (error) {
    console.error(`Error loading content from ${fileName}:`, error.message);
    return `${fileName}: 読み込みエラー - ${error.message}`;
  }
}

// 🆕 統合知識ベース構築関数
async function buildKnowledgeBase() {
  try {
    console.log('Building knowledge base from spreadsheet...');
    
    const urlList = await loadUrlListFromSpreadsheet();
    if (urlList.length === 0) {
      console.log('No URLs found in spreadsheet');
      return null;
    }

    let knowledgeBase = 'VTuber育成スクール - わなみさん 知識ベース\n';
    knowledgeBase += '='.repeat(80) + '\n\n';

    // 各URLの内容を読み込み
    for (const urlInfo of urlList) {
      const content = await loadContentFromUrl(urlInfo);
      knowledgeBase += `\n\n${content}\n`;
      
      // APIレート制限対策で少し待機
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`Knowledge base built successfully. Total length: ${knowledgeBase.length} characters`);
    return knowledgeBase;

  } catch (error) {
    console.error('Error building knowledge base:', error);
    return null;
  }
}

// 🆕 専門AI回答生成関数（知識ベース統合版）
async function generateAIResponse(question, buttonType, userInfo) {
  try {
    console.log(`🤖 専門AI回答生成開始: ${buttonType}`);
    console.log(`📝 ユーザー: ${userInfo.username}`);
    console.log(`💬 質問: ${question}`);
    
    if (!openai) {
      console.log('OpenAI not initialized');
      return 'すみません、現在AI回答システムに問題が発生しています。担任の先生にご相談ください。';
    }

    // 知識ベース読み込み
    const knowledgeBase = await buildKnowledgeBase();
    
    if (!knowledgeBase) {
      return 'すみません、現在知識ベースにアクセスできません。担任の先生に直接ご相談ください。';
    }

    // レッスン番号抽出
    const lessonMatch = question.match(/レッスン?\s*(\d+)/i) || question.match(/Lesson\s*(\d+)/i);
    const lessonNumber = lessonMatch ? parseInt(lessonMatch[1]) : null;

    // ボタンタイプ別システムプロンプト
    let systemPrompt = `あなたはVTuber育成スクール「わなみさん」の専門AIアシスタントです。

以下の知識ベースを参考に、生徒からの質問に親切で具体的な回答をしてください。

【知識ベース】
${knowledgeBase}

【回答ルール】
- 丁寧で親しみやすい口調で回答してください
- 具体的で実用的なアドバイスを提供してください
- 絵文字を適度に使用してください
- 500文字以内で簡潔にまとめてください
- 知識ベースにない内容は「担任の先生にご相談ください」と案内してください`;

    switch (buttonType) {
      case 'lesson_question':
        systemPrompt += `\n\n【特別指示：レッスン質問】
- レッスン内容に関する質問として回答してください
- 該当するレッスン番号があれば具体的に案内してください
- 技術的な内容は段階的に説明してください`;
        break;
        
      case 'sns_consultation':
        systemPrompt += `\n\n【特別指示：SNS運用相談】
- X(Twitter)やYouTubeの運用に関する相談として回答してください
- 具体的な戦略やコツを提供してください
- フォロワー獲得やエンゲージメント向上のアドバイスを含めてください`;
        break;
        
      case 'mission_submission':
        systemPrompt += `\n\n【特別指示：ミッション提出】
- ミッション提出に関する質問として回答してください
- 取り組み方や提出方法について説明してください
- 建設的で励ましのフィードバックを提供してください`;
        break;
    }

    // OpenAI API呼び出し
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
    console.log('✅ 専門AI回答生成完了');
    
    return aiResponse;

  } catch (error) {
    console.error('❌ 専門AI回答生成エラー:', error.message);
    
    return `申し訳ございません！現在AI機能に問題が発生しています🙏

お急ぎの場合は、担任の先生に直接ご相談ください。
しばらく時間をおいてからもう一度お試しいただけますか？

ご不便をおかけして申し訳ありません💦`;
  }
}

// AI応答ボタンの質問入力要求メッセージ（従来通り）
const AI_QUESTION_PROMPTS = {
  lesson_question: {
    title: "📚 レッスンについての質問",
    content: `**レッスンに関するご質問をお聞かせください！**

🔹 **質問例**
• 「OBSの設定方法を教えてください」
• 「配信で音声が聞こえない時の対処法は？」
• 「デザイン4原則について教えてください」

💡 **質問のコツ**
• 具体的な状況や症状を教えてください
• 使用しているソフトウェア名があれば記載してください
• エラーメッセージがあれば教えてください

**📝 この下にあなたの質問を入力してください ⬇️**`
  },
  
  sns_consultation: {
    title: "📱 SNS運用のご相談",
    content: `**SNS運用に関するご相談をお聞かせください！**

🔹 **相談例**
• 「Xでフォロワーを増やすコツは？」
• 「YouTube配信の企画アイデアを教えて」

💡 **相談のコツ**
• 現在のフォロワー数や状況を教えてください
• 目標（フォロワー数、再生数など）があれば記載してください
• 困っている具体的な内容を詳しく書いてください

**📝 この下にあなたのご相談内容を入力してください ⬇️**`
  },
  
  mission_submission: {
    title: "🎯 ミッションの提出",
    content: `**ミッション提出に関してお聞かせください！**

🔹 **提出・相談例**
• 「レッスン〇のミッションを完了しました」
• 「レッスン〇のミッションのフィードバックください」

💡 **記載のコツ**
• レッスン番号を記載してください
• 完了報告の場合は取り組み内容を教えてください
• 質問の場合は具体的に何に困っているか書いてください

**📝 この下にミッション関連の内容を入力してください ⬇️**`
  }
};

// n8n Webhookにデータ送信する関数（従来通り）
async function sendToN8N(buttonId, interaction, questionText = null) {
  try {
    const payload = {
      button_id: buttonId,
      user_id: interaction.user?.id || interaction.member?.user?.id,
      username: interaction.user?.username || interaction.member?.user?.username,
      guild_id: interaction.guild_id,
      channel_id: interaction.channel_id,
      timestamp: new Date().toISOString(),
      ai_request: true,
      phase: questionText ? '2_with_question' : '1.5_prompt_only',
      question_text: questionText,
      knowledge_base_ready: true
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

// ボタン応答生成関数（従来通り）
function generateButtonResponse(customId, interaction = null) {
  if (AI_TARGET_BUTTONS[customId]) {
    console.log(`🤖 AI処理対象ボタン: ${customId} - 質問入力要求`);
    
    if (interaction) {
      sendToN8N(customId, interaction).catch(error => {
        console.error('n8n送信失敗:', error);
      });
    }
    
    const promptData = AI_QUESTION_PROMPTS[customId];
    return {
      type: 4,
      data: {
        content: `✨ **${promptData.title}** ✨\n\n${promptData.content}`
      }
    };
  }

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
    
    default:
      return {
        type: 4,
        data: {
          content: "❌ 申し訳ございません。認識できない選択肢です。\n再度メニューから選択してください。"
        }
      };
  }
}

// 🆕 専門AI処理リクエスト受信エンドポイント（知識ベース統合版）
app.post('/ai-process', async (req, res) => {
  console.log('🤖 専門AI処理リクエスト受信:', req.body);
  
  try {
    // サービス初期化
    initializeServices();
    
    const { button_id, message_content, user_id, username } = req.body;
    
    if (!message_content) {
      return res.json({ error: '質問テキストが必要です' });
    }
    
    // 専門AI回答生成（知識ベース統合）
    const aiResponse = await generateAIResponse(message_content, button_id, {
      id: user_id,
      username: username
    });
    
    console.log('✅ 専門AI回答生成完了');
    
    res.json({
      success: true,
      ai_response: aiResponse,
      processed_at: new Date().toISOString(),
      knowledge_base_used: true
    });
    
  } catch (error) {
    console.error('❌ 専門AI処理エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🆕 知識ベーステスト用エンドポイント
app.get('/test-knowledge-base', async (req, res) => {
  try {
    initializeServices();
    
    const knowledgeBase = await buildKnowledgeBase();
    const urlList = await loadUrlListFromSpreadsheet();
    
    res.json({
      success: !!knowledgeBase,
      urls_found: urlList.length,
      knowledge_base_length: knowledgeBase ? knowledgeBase.length : 0,
      preview: knowledgeBase ? knowledgeBase.substring(0, 1000) : null,
      url_list: urlList.slice(0, 5) // 最初の5個のURL情報
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Health check（更新）
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Discord Bot - VTuber School with Spreadsheet Knowledge Base',
    timestamp: new Date().toISOString(),
    version: '8.0.0', // 🆕 スプレッドシート統合版
    features: {
      slash_commands: true,
      button_interactions: true,
      static_responses: true,
      ai_responses: 'spreadsheet_knowledge_base_active',
      question_input_system: true,
      spreadsheet_integration: true,
      google_slides_docs_support: true,
      knowledge_base_urls: KNOWLEDGE_SPREADSHEET_ID,
      ai_target_buttons: ['lesson_question', 'sns_consultation', 'mission_submission']
    }
  });
});

// Discord webhook処理（従来通り）
app.post('/discord', async (req, res) => {
  console.log('=== Discord Interaction 受信 ===');
  console.log('Time:', new Date().toISOString());
  
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const publicKey = process.env.DISCORD_PUBLIC_KEY || '63d73edbad916c2ee14b390d729061d40200f2d82753cb094ed89af67873dadd';
  
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
  
  if (body.type === 1) {
    console.log('🏓 PING認証 - 直接応答');
    return res.json({ type: 1 });
  }
  
  if (body.type === 2 && body.data?.name === 'soudan') {
    console.log('⚡ /soudan コマンド - 専門知識ベース対応版');
    
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

    console.log('✅ Discord即座応答送信（専門知識ベース版）');
    return res.json(response);
  }
  
  if (body.type === 3) {
    const buttonId = body.data?.custom_id;
    console.log('🔘 ボタンクリック - 専門知識ベース対応');
    console.log('Button ID:', buttonId);
    
    const response = generateButtonResponse(buttonId, body);
    
    if (AI_TARGET_BUTTONS[buttonId]) {
      console.log('📝 専門AI質問入力要求送信 + n8n通知');
    } else {
      console.log('📝 静的応答送信:', buttonId);
    }
    
    return res.json(response);
  }
  
  console.log('❓ 未対応のInteractionタイプ:', body.type);
  res.status(400).json({ error: 'Unsupported interaction type' });
});

app.listen(PORT, () => {
  console.log('=== Discord Bot VTuber School v8.0 ===');
  console.log(`📍 Port: ${PORT}`);
  console.log('✅ Static responses: Render.com');
  console.log('📝 AI Question Input System: Active');
  console.log('🤖 専門AI Response Generation: Active');
  console.log('📊 Spreadsheet Knowledge Base: Active');
  console.log(`📚 Knowledge Source: ${KNOWLEDGE_SPREADSHEET_ID}`);
  console.log(`🔗 n8n Webhook: ${N8N_WEBHOOK_URL}`);
  console.log('🎯 AI Target Buttons: lesson_question, sns_consultation, mission_submission');
  console.log('🚀 Phase 3: スプレッドシート知識ベース統合完了');
  console.log('=====================================');
});
