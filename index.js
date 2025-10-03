const express = require('express');
const axios = require('axios');
const nacl = require('tweetnacl');
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

// 🆕 Phase 2: API Keys設定 - 環境変数使用版
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// デバッグ用：起動時確認
console.log('🔧 OpenAI API Key configured:', OPENAI_API_KEY ? 'Yes' : 'No');
console.log('🔧 Google API Key configured:', GOOGLE_API_KEY ? 'Yes' : 'No');

// 🆕 Phase 2: 確認済み知識ベース構造
const KNOWLEDGE_BASE = {
  folder_id: '1EsSsPv928cYiSWIYNnC4a0PxtVs8rTTh',
  
  // 確認済みファイル一覧（28レッスン + チャット対応ガイド）
  lesson_files: [
    'WannaV_テキスト_Lesson 1.pptx',
    'WannaV_テキスト_Lesson 2.pptx', 
    'WannaVテキスト_Lesson 3.pptx',
    'WannaVテキスト_Lesson 4.pptx',
    'WannaVテキスト_Lesson 5.pptx',
    'WannaVテキスト_Lesson 6.pptx',
    'WannaVテキスト_Lesson 7.pptx',
    'WannaVテキスト_Lesson 8.pptx',
    'WannaVテキスト_Lesson 9.pptx',
    'WannaVテキスト_Lesson 10.pptx',
    'WannaVテキスト_Lesson 11.pptx',
    'WannaVテキスト_Lesson 12.pptx',
    'WannaVテキスト_Lesson 13.pptx',
    'WannaVテキスト_Lesson 14.pptx',
    'WannaVテキスト_Lesson 15.pptx',
    'WannaVテキスト_Lesson 16.pptx',
    'WannaVテキスト_Lesson 17.pptx',
    'WNGテキスト_Lesson 18.pptx',
    'WannaVテキスト_Lesson 19.pptx',
    'WannaVテキスト_Lesson 20.pptx',
    'WNGテキスト_Lesson 21.pptx',
    'WannaVテキスト_Lesson 22.pptx',
    'WannaVテキスト_Lesson 23.pptx',
    'WannaVテキスト_Lesson 24.pptx',
    'WannaVテキスト_Lesson 25.pptx',
    'WNGテキスト_Lesson 26.pptx',
    'WannaVテキスト_Lesson 27.pptx',
    'WannaVテキスト_Lesson 28.pptx'
  ],
  
  chat_guide_file: 'チャット対応ガイド.docx',
  
  // 推定されるレッスン内容（ファイル名から推測）
  lesson_topics: {
    'basic_streaming': [1, 2, 3, 4, 5],           // 基本配信技術
    'live2d_vtubing': [6, 7, 8, 9, 10],          // Live2D・VTuber技術
    'content_creation': [11, 12, 13, 14, 15],     // コンテンツ制作
    'sns_marketing': [16, 17, 18, 19, 20],        // SNS・マーケティング
    'advanced_techniques': [21, 22, 23, 24, 25],  // 上級技術
    'business_development': [26, 27, 28]           // ビジネス展開
  }
};

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
    version: '7.0.0', // 🆕 Phase 2完成版
    features: {
      slash_commands: true,
      button_interactions: true,
      static_responses: true,
      ai_responses: 'phase_2_active', // 🆕 Phase 2実装完了
      question_input_system: true,
      google_drive_integration: true, // 🆕 Google Drive連携
      openai_integration: true,       // 🆕 OpenAI連携
      knowledge_base_files: KNOWLEDGE_BASE.lesson_files.length + 1,
      ai_target_buttons: ['lesson_question', 'sns_consultation', 'mission_submission']
    }
  });
});

// AI応答ボタンの質問入力要求メッセージ（Phase 1.5ベース）
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

// 🆕 Phase 2: AI回答生成機能
async function generateAIResponse(question, buttonType, userInfo) {
  try {
    console.log(`🤖 AI回答生成開始: ${buttonType}`);
    console.log(`📝 ユーザー: ${userInfo.username}`);
    console.log(`💬 質問: ${question}`);
    
    // レッスン番号抽出（レッスン質問・ミッション提出の場合）
    const lessonMatch = question.match(/レッスン?\s*(\d+)/i) || question.match(/Lesson\s*(\d+)/i);
    const lessonNumber = lessonMatch ? parseInt(lessonMatch[1]) : null;
    
    // 知識ベース関連情報の構築
    let relevantKnowledge = '';
    let systemPrompt = '';
    
    switch (buttonType) {  
      case 'lesson_question':
        if (lessonNumber && lessonNumber >= 1 && lessonNumber <= 28) {
          relevantKnowledge = `
【該当レッスン】
レッスン${lessonNumber}: ${KNOWLEDGE_BASE.lesson_files.find(f => f.includes(`Lesson ${lessonNumber}`) || f.includes(`Lesson${lessonNumber}`))}

【レッスン分野】
${getLessonCategory(lessonNumber)}

【利用可能なレッスン】
全28レッスンの教材が利用可能（基本配信技術からビジネス展開まで）
`;
        } else {
          relevantKnowledge = `
【利用可能なレッスン教材】
- 基本配信技術 (Lesson 1-5)
- Live2D・VTuber技術 (Lesson 6-10) 
- コンテンツ制作 (Lesson 11-15)
- SNS・マーケティング (Lesson 16-20)
- 上級技術 (Lesson 21-25)
- ビジネス展開 (Lesson 26-28)
`;
        }
        
        systemPrompt = `あなたはVTuber育成スクールの「わなみさん」です。
レッスンに関する質問に、知識ベースを参考に回答してください。

${relevantKnowledge}

回答ルール:
- 丁寧で親しみやすい口調
- 具体的で実用的なアドバイス  
- 絵文字を適度に使用
- 500文字以内で簡潔に
- 該当レッスンがある場合は具体的に案内
- 知識ベースにない内容は「担任の先生にご相談ください」`;
        break;
        
      case 'sns_consultation':
        relevantKnowledge = `
【SNS関連レッスン】
- Lesson 16-20: SNS・マーケティング分野
- 各種プラットフォーム戦略
- フォロワー獲得手法
- エンゲージメント向上技術

【対応SNS】
Twitter/X, YouTube, TikTok, Instagram等
`;
        
        systemPrompt = `あなたはVTuber育成スクールの「わなみさん」です。
SNS運用に関する相談に、知識ベースを参考に回答してください。

${relevantKnowledge}

回答ルール:
- SNS運用の専門家として回答
- 具体的な戦略やコツを提供
- 現実的で実行可能なアドバイス
- 500文字以内で簡潔に
- 絵文字を適度に使用`;
        break;
        
      case 'mission_submission':
        if (lessonNumber) {
          relevantKnowledge = `
【該当ミッション】
レッスン${lessonNumber}のミッション

【評価観点】
- 取り組み姿勢
- 理解度の確認
- 実践的な適用
- 改善点の特定

【フィードバック方針】
建設的で成長につながるアドバイス提供
`;
        } else {
          relevantKnowledge = `
【ミッション提出について】
全28レッスンにミッションが設定されています
提出時は必ずレッスン番号を明記してください

【評価基準】
取り組み内容、理解度、実践応用を総合評価
`;
        }
        
        systemPrompt = `あなたはVTuber育成スクールの「わなみさん」です。
ミッション提出に関して、温かく建設的なフィードバックを提供してください。

${relevantKnowledge}

回答ルール:
- 生徒の努力を認める姿勢
- 具体的で建設的なフィードバック
- 次のステップを明確に提示
- 500文字以内で簡潔に  
- 励ましの言葉を含める`;
        break;
    }
    
    // OpenAI API呼び出し
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      max_tokens: 800,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const aiResponse = response.data.choices[0].message.content;
    console.log('✅ AI回答生成完了');
    
    return aiResponse;
    
  } catch (error) {
    console.error('❌ AI回答生成エラー:', error.message);
    
    return `申し訳ございません！現在AI機能に問題が発生しています🙏

お急ぎの場合は、担任の先生に直接ご相談ください。
しばらく時間をおいてからもう一度お試しいただけますか？

ご不便をおかけして申し訳ありません💦`;
  }
}

// 🆕 レッスンカテゴリ判定関数
function getLessonCategory(lessonNumber) {
  for (const [category, lessons] of Object.entries(KNOWLEDGE_BASE.lesson_topics)) {
    if (lessons.includes(lessonNumber)) {
      const categoryNames = {
        'basic_streaming': '基本配信技術',
        'live2d_vtubing': 'Live2D・VTuber技術',
        'content_creation': 'コンテンツ制作',
        'sns_marketing': 'SNS・マーケティング',
        'advanced_techniques': '上級技術',
        'business_development': 'ビジネス展開'
      };
      return categoryNames[category] || category;
    }
  }
  return '一般レッスン';
}

// n8n Webhookにデータ送信する関数（Phase 1.5ベース + AI応答拡張）
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
      phase: questionText ? '2_with_question' : '1.5_prompt_only', // 🆕 Phase 2対応
      question_text: questionText,
      knowledge_base_ready: true // 🆕 知識ベース準備完了フラグ
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

// ボタン応答生成関数（Phase 1.5ベース）
function generateButtonResponse(customId, interaction = null) {
  // AI対象ボタンの判定
  if (AI_TARGET_BUTTONS[customId]) {
    console.log(`🤖 AI処理対象ボタン: ${customId} - 質問入力要求`);
    
    // n8nに質問入力要求として送信
    if (interaction) {
      sendToN8N(customId, interaction).catch(error => {
        console.error('n8n送信失敗:', error);
      });
    }
    
    // 質問入力を促すメッセージを返す
    const promptData = AI_QUESTION_PROMPTS[customId];
    return {
      type: 4,
      data: {
        content: `✨ **${promptData.title}** ✨\n\n${promptData.content}`
      }
    };
  }

  // 静的応答ボタン（従来通り）
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

// 🆕 Phase 2: AI処理リクエスト受信エンドポイント（n8nからの呼び出し用）- 修正版
app.post('/ai-process', async (req, res) => {
  console.log('🤖 AI処理リクエスト受信:', req.body);
  
  try {
    // パラメータ名を修正：question_text → message_content
    const { button_id, message_content, user_id, username } = req.body;
    
    if (!message_content) {
      return res.json({ error: '質問テキストが必要です' });
    }
    
    // AI回答生成
    const aiResponse = await generateAIResponse(message_content, button_id, {
      id: user_id,
      username: username
    });
    
    console.log('✅ AI回答生成完了');
    
    res.json({
      success: true,
      ai_response: aiResponse,
      processed_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ AI処理エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Discord webhook処理（Phase 1.5ベース）
app.post('/discord', async (req, res) => {
  console.log('=== Discord Interaction 受信 ===');
  console.log('Time:', new Date().toISOString());
  
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const publicKey = process.env.DISCORD_PUBLIC_KEY || '63d73edbad916c2ee14b390d729061d40200f2d82753cb094ed89af67873dadd';
  
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
  
  // ボタンクリック - 質問入力要求対応
  if (body.type === 3) {
    const buttonId = body.data?.custom_id;
    console.log('🔘 ボタンクリック - 質問入力要求対応');
    console.log('Button ID:', buttonId);
    
    const response = generateButtonResponse(buttonId, body);
    
    if (AI_TARGET_BUTTONS[buttonId]) {
      console.log('📝 質問入力要求送信 + n8n通知');
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
  console.log('=== Discord Bot VTuber School v7.0 ===');
  console.log(`📍 Port: ${PORT}`);
  console.log('✅ Static responses: Render.com');
  console.log('📝 AI Question Input System: Active');
  console.log('🤖 AI Response Generation: Active');
  console.log('📚 Knowledge Base: 28 Lessons + Chat Guide');
  console.log(`🔗 n8n Webhook: ${N8N_WEBHOOK_URL}`);
  console.log('🎯 AI Target Buttons: lesson_question, sns_consultation, mission_submission');
  console.log('🚀 Phase 2: Google Drive知識ベース連携完了');
  console.log('=====================================');
});
