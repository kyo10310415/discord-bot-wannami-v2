// handlers/button-handler.js - ボタンクリック処理ハンドラー

const logger = require('../utils/logger');
const { createDiscordResponse } = require('../utils/verification');
const { BUTTON_IDS, AI_TARGET_BUTTONS } = require('../utils/constants');

// 各ボタンの応答内容定義
const BUTTON_RESPONSES = {
  [BUTTON_IDS.PAYMENT_CONSULTATION]: {
    title: "💰 お支払い相談",
    content: `**お支払いに関するご相談を承ります**

以下の情報をお教えください：

🔹 **ご相談内容**
• 分割払いのご希望
• お支払い方法の変更
• 請求書に関するお問い合わせ
• その他お支払いに関するご質問

🔹 **お急ぎの場合**
LINE公式アカウント: @wannami-school
メール: support@wannami-school.com

**※ お支払い情報は個人情報のため、DMまたは専用チャンネルでご相談ください**

わなみさんがしっかりサポートいたします✨`
  },
  
  [BUTTON_IDS.PRIVATE_CONSULTATION]: {
    title: "💬 プライベート相談",
    content: `**プライベートなご相談承ります**

🔹 **このようなご相談をお受けしています**
• VTuber活動への不安や悩み
• 配信内容やキャラクター設定について
• ファンとの関係性について
• 活動継続に関する悩み
• その他、センシティブなご相談

🔹 **相談方法**
• **推奨**: わなみさんとのDM（完全プライベート）
• 専用相談チャンネル（限定公開）

🔹 **相談時間**
平日 10:00-18:00 / 土日 14:00-20:00

**あなたの気持ちに寄り添って、一緒に解決策を見つけましょう💕**`
  },
  
  [BUTTON_IDS.LESSON_QUESTION]: {
    title: "📚 レッスン質問",
    content: `**レッスンに関するご質問をどうぞ！**

🔹 **よくあるご質問**
• 配信ソフトの設定方法
• 音声・映像のトラブル
• Live2Dの操作方法
• ゲーム配信の技術的な問題
• コラボ配信の準備

🔹 **AI知識ベース対応**
✨ **@わなみさん [質問内容]** でメンションすると、AI知識ベースから詳しい回答をお答えします
• 過去の質問データベースから最適解を検索
• 画像添付で画面共有も可能
• 24時間いつでも即座に回答

🔹 **従来の質問方法**
1️⃣ このチャンネルで気軽に質問
2️⃣ レッスン専用チャンネルを利用
3️⃣ 個別レッスン時に直接質問

**技術的な質問も大歓迎です！AIと画面共有での説明も可能です📱**`
  },
  
  [BUTTON_IDS.SNS_CONSULTATION]: {
    title: "📱 SNS運用相談",
    content: `**SNS運用でお困りのことはありませんか？**

🔹 **サポート内容**
• Twitter/X の効果的な投稿方法
• YouTube ショート動画の作り方
• TikTok バズる動画のコツ
• Instagram リール活用法
• ファン獲得戦略
• アンチ対策・炎上防止

🔹 **AI知識ベース対応**
✨ **@わなみさん [相談内容]** でメンションすると、AI知識ベースから専門的なアドバイスをお答えします
• SNS運用の成功事例データベース
• 最新のバズ傾向分析
• 個別戦略の提案

🔹 **相談の流れ**
1️⃣ 現在のアカウント状況をお聞かせください
2️⃣ 目標（フォロワー数、再生数など）を設定
3️⃣ 個別戦略をアドバイス

**一緒にバズる投稿を作りましょう🚀**`
  },
  
  [BUTTON_IDS.MISSION_SUBMISSION]: {
    title: "🎯 ミッション提出",
    content: `**ミッション提出お疲れさまです！**

🔹 **提出方法**
• ファイル添付: 動画、画像、レポート等
• URL添付: 配信アーカイブ、SNS投稿等
• テキスト報告: 活動報告、感想等

🔹 **AI評価システム対応**
✨ **@わなみさん [ミッション内容]** でメンションすると、AI知識ベースから即座にフィードバックを受けられます
• 提出内容の自動評価
• 改善点の具体的な提案
• 次のステップのアドバイス

🔹 **提出時の記載事項**
• ミッション番号（例：M001）
• 完了日時
• 取り組み内容
• 学んだこと・気づき
• 質問があれば一緒に

🔹 **フィードバック**
AIによる即座のフィードバック + 48時間以内に詳細なフィードバックをお送りします

**あなたの成長が見えるのが一番嬉しいです！頑張りましたね✨**`
  }
};

// ボタンクリック処理
async function handleButtonClick(interaction, client) {
  try {
    const buttonId = interaction.data.custom_id;
    logger.discord(`ボタンクリック: ${buttonId}`);

    // ボタン応答の取得
    const buttonResponse = BUTTON_RESPONSES[buttonId];
    
    if (!buttonResponse) {
      logger.warn(`未定義のボタンID: ${buttonId}`);
      return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
        content: "申し訳ございません。このボタンはまだ準備中です🙏\n" +
                "他のボタンをお試しいただくか、直接わなみさんにお声がけください✨",
        flags: 64 // EPHEMERAL
      });
    }

    // AI機能対応ボタンかチェック
    const isAITarget = AI_TARGET_BUTTONS.has(buttonId);
    
    // ユーザー情報をログに記録
    const user = interaction.user || interaction.member?.user;
    if (user) {
      logger.discord(`ボタン使用者: ${user.username} (${user.id})`);
    }

    let responseContent;
    
    if (isAITarget) {
      // AI対応ボタン: 知識ベースからAI応答を生成
      responseContent = await generateAIButtonResponse(buttonResponse, buttonId, user);
    } else {
      // 静的応答ボタン: 事前定義された内容を返す
      responseContent = `✨ **${buttonResponse.title}** ✨\n\n${buttonResponse.content}`;
    }

    // 応答作成
    const response = createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
      content: responseContent,
      flags: 64 // EPHEMERAL - 本人のみ表示
    });

    logger.success(`${buttonResponse.title} 応答送信完了`);
    return response;

  } catch (error) {
    logger.errorDetail('ボタンクリック処理エラー:', error);
    
    return createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
      content: '❌ ボタン処理中にエラーが発生しました。しばらく待ってから再度お試しください。',
      flags: 64
    });
  }
}

// AI対象ボタンの特別処理
async function handleAITargetButton(buttonId, interaction, client) {
  try {
    logger.ai(`AI対象ボタン処理: ${buttonId}`);

    // AI機能が利用可能かチェック
    const { openAIService } = require('../services/openai-service');
    const { knowledgeBaseService } = require('../services/knowledge-base');

    const aiStatus = openAIService.getStatus();
    const kbStatus = knowledgeBaseService.getStatus();

    if (!aiStatus.initialized || !kbStatus.initialized) {
      logger.warn('AI機能またはKnowledge Baseが未初期化');
      // 通常のボタン応答にフォールバック
      return await handleButtonClick(interaction, client);
    }

    // AI機能を使った特別な応答を生成
    // ここでは基本応答を返し、メンション時にAI機能を案内
    return await handleButtonClick(interaction, client);

  } catch (error) {
    logger.errorDetail('AI対象ボタン処理エラー:', error);
    // エラー時は通常のボタン応答にフォールバック
    return await handleButtonClick(interaction, client);
  }
}

// AI対象ボタンの応答生成
async function generateAIButtonResponse(buttonResponse, buttonId, user) {
  try {
    const { ragSystem } = require('../services/rag-system');
    
    // ボタンに応じた基本プロンプトを設定
    let basePrompt = '';
    let contextInfo = '';
    
    switch (buttonId) {
      case BUTTON_IDS.LESSON_QUESTION:
        basePrompt = 'レッスンに関する質問にお答えします';
        contextInfo = 'VTuberスクールのレッスン内容、技術的な問題解決、配信方法について';
        break;
      
      case BUTTON_IDS.SNS_CONSULTATION:
        basePrompt = 'SNS運用に関する相談にお答えします';
        contextInfo = 'SNS戦略、コンテンツ作成、ファン獲得、効果的な投稿方法について';
        break;
      
      case BUTTON_IDS.MISSION_SUBMISSION:
        basePrompt = 'ミッション提出に関してサポートします';
        contextInfo = 'ミッション内容、提出方法、評価基準、次のステップについて';
        break;
      
      default:
        basePrompt = '知識ベースから回答します';
        contextInfo = 'VTuberスクール全般について';
    }
    
    // 知識ベース限定応答を生成
    const aiResponse = await ragSystem.generateKnowledgeOnlyResponse(
      `${basePrompt}。${contextInfo}の質問を受け付けています。`,
      {
        userId: user?.id,
        userName: user?.username,
        buttonContext: buttonId,
        responseType: 'button_interaction'
      }
    );
    
    // ボタン応答の基本情報とAI応答を組み合わせ
    const combinedResponse = `✨ **${buttonResponse.title}** ✨\n\n` +
                           `${buttonResponse.content}\n\n` +
                           `🤖 **AI知識ベースより**\n` +
                           `${aiResponse}`;
    
    return combinedResponse;
    
  } catch (error) {
    logger.errorDetail('AI応答生成エラー:', error);
    
    // エラー時は静的応答にフォールバック
    return `✨ **${buttonResponse.title}** ✨\n\n` +
           `${buttonResponse.content}\n\n` +
           `⚠️ AI機能は一時的に利用できません。直接 @わなみさん でメンションしてご質問ください。`;
  }
}

// ボタンの統計情報取得
function getButtonStats() {
  // 将来的な使用統計のためのプレースホルダー
  return {
    availableButtons: Object.keys(BUTTON_RESPONSES).length,
    aiTargetButtons: AI_TARGET_BUTTONS.size,
    buttonIds: Object.keys(BUTTON_RESPONSES)
  };
}

module.exports = {
  handleButtonClick,
  handleAITargetButton,
  generateAIButtonResponse,
  getButtonStats,
  BUTTON_RESPONSES
};
