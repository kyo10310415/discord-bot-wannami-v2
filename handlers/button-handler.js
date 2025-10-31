// handlers/button-handler.js - ボタンクリック処理ハンドラー

const logger = require('../utils/logger');
const { createDiscordResponse } = require('../utils/verification');
const { BUTTON_IDS, AI_TARGET_BUTTONS } = require('../utils/constants');

// アクティブな質問待ち状態を管理
const activeQuestionWaits = new Map();

// 各ボタンの応答内容定義
const BUTTON_RESPONSES = {
  [BUTTON_IDS.PAYMENT_CONSULTATION]: {
    title: "💰 お支払い相談",
    content: `**お支払いに関するご相談はこちらではお受けできません。**
    担当者にご連絡ください。
`
  },
  
  [BUTTON_IDS.PRIVATE_CONSULTATION]: {
    title: "💬 プライベート相談",
    content: `**プライベートなご相談はこちらではお受けできません。**
    担任の先生にご相談ください。
`
  },
  
  [BUTTON_IDS.LESSON_QUESTION]: {
    title: "📚 レッスン質問",
    categoryName: "レッスン",
    contextInfo: "VTuberスクールのレッスン内容、技術的な問題解決、配信方法について",
    examples: [
      "配信ソフトの設定方法を教えて",
      "Live2Dが正常に動作しない",
      "音声にノイズが入る問題の解決方法"
    ]
  },
  
  [BUTTON_IDS.SNS_CONSULTATION]: {
    title: "📱 SNS運用相談", 
    categoryName: "SNS運用",
    contextInfo: "SNS戦略、コンテンツ作成、ファン獲得、効果的な投稿方法について",
    examples: [
      "Twitterでフォロワーを増やす方法",
      "バズる動画の作り方のコツ",
      "アンチコメントへの対処法"
    ]
  },
  
  [BUTTON_IDS.MISSION_SUBMISSION]: {
    title: "🎯 ミッション提出",
    categoryName: "ミッション",
    contextInfo: "ミッション内容、提出方法、評価基準、次のステップについて",
    examples: [
      "次のチャットでミッションをご提出ください",
      "レッスン番号も忘れずに入力ください"
    ]
  }
};

// ボタンクリック処理
async function handleButtonClick(interaction, client) {
  try {
    const buttonId = interaction.data.custom_id;
    const user = interaction.user || interaction.member?.user;
    
    logger.discord(`ボタンクリック: ${buttonId} by ${user?.username}`);

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
    
    let responseContent;
    
    if (isAITarget) {
      // AI対応ボタン: 質問入力を促すメッセージを表示
      responseContent = generateQuestionPrompt(buttonResponse, buttonId, user);
      
      // 質問待ち状態を登録（3分間のタイムアウト付き）
      registerQuestionWait(user.id, buttonId, interaction.channel_id);
      
    } else {
      // 静的応答ボタン: 事前定義された内容を返す
      responseContent = `✨ **${buttonResponse.title}** ✨\n\n${buttonResponse.content}`;
    }

    // 応答作成
    const response = createDiscordResponse('CHANNEL_MESSAGE_WITH_SOURCE', {
      content: responseContent,
      flags: 0 
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

// AI対象ボタンの質問入力促進メッセージ生成
function generateQuestionPrompt(buttonResponse, buttonId, user) {
  const { title, categoryName, examples } = buttonResponse;
  
  let content = `✨ **${title}** ✨\n\n`;
  content += `🤖 **AI知識ベース回答システム**\n`;
  content += `${categoryName}に関する質問をお聞かせください！\n\n`;
  
  content += `📝 **質問の送信方法:**\n`;
  content += `このメッセージに返信するか、このチャンネルで **@わなみさん [質問内容]** とメンションしてください\n\n`;
  
  content += `💡 **質問例:**\n`;
  examples.forEach((example, index) => {
    content += `${index + 1}. ${example}\n`;
  });
  
  content += `\n⏰ **制限時間: 3分間**\n`;
  content += `3分以内に質問をお送りください。時間を過ぎると自動的にキャンセルされます。\n\n`;
  
  content += `📚 **知識ベース限定回答**\n`;
  content += `• VTuber活動に特化した専門情報のみ回答\n`;
  content += `• 知識ベース外の情報は「分からない」と正直に回答\n`;
  content += `• 画像添付での質問も可能です\n\n`;
  
  content += `準備ができましたら、ご質問をどうぞ！✨`;
  
  return content;
}

// 質問待ち状態を登録
function registerQuestionWait(userId, buttonId, channelId) {
  // 既存の待ち状態があればクリア
  if (activeQuestionWaits.has(userId)) {
    const existingWait = activeQuestionWaits.get(userId);
    clearTimeout(existingWait.timeout);
    logger.discord(`既存の質問待ち状態をクリア: ${userId}`);
  }
  
  // 3分後にタイムアウト
  const timeout = setTimeout(() => {
    handleQuestionTimeout(userId, buttonId);
  }, 3 * 60 * 1000); // 3分
  
  // 待ち状態を登録
  activeQuestionWaits.set(userId, {
    buttonId,
    channelId,
    timeout,
    startTime: Date.now()
  });
  
  logger.ai(`質問待ち状態登録: ${userId} - ${buttonId}`);
}

// 質問タイムアウト処理
function handleQuestionTimeout(userId, buttonId) {
  const waitInfo = activeQuestionWaits.get(userId);
  if (!waitInfo) return;
  
  // 待ち状態をクリア
  activeQuestionWaits.delete(userId);
  
  const buttonResponse = BUTTON_RESPONSES[buttonId];
  logger.warn(`質問待ちタイムアウト: ${userId} - ${buttonId}`);
  
  // タイムアウトメッセージは必要に応じて実装
  // Discord APIの制限により、直接メッセージ送信は困難
}

// 質問受信時の処理（mention-handlerから呼び出される）
async function handleQuestionResponse(userId, userQuery, context = {}) {
  const waitInfo = activeQuestionWaits.get(userId);
  
  if (!waitInfo) {
    // 質問待ち状態でない場合は通常の知識ベース回答
    return null;
  }
  
  try {
    // 質問待ち状態をクリア
    clearTimeout(waitInfo.timeout);
    activeQuestionWaits.delete(userId);
    
    const { buttonId } = waitInfo;
    const buttonResponse = BUTTON_RESPONSES[buttonId];
    
    logger.ai(`質問応答処理開始: ${userId} - ${buttonId}`);
    
    // AI応答生成
    const aiResponse = await generateAIButtonResponse(buttonResponse, buttonId, userQuery, context);
    
    return aiResponse;
    
  } catch (error) {
    logger.errorDetail('質問応答処理エラー:', error);
    return '申し訳ございません。質問の処理中にエラーが発生しました。再度ボタンから質問を開始してください。';
  }
}

// AI対象ボタンの応答生成
async function generateAIButtonResponse(buttonResponse, buttonId, userQuery, context) {
  try {
    const { ragSystem } = require('../services/rag-system');
    
    // ボタンに応じた基本プロンプトを設定
    let basePrompt = '';
    let contextInfo = buttonResponse.contextInfo || '';
    
    switch (buttonId) {
      case BUTTON_IDS.LESSON_QUESTION:
        basePrompt = 'レッスンに関する質問にお答えします';
        break;
      
      case BUTTON_IDS.SNS_CONSULTATION:
        basePrompt = 'SNS運用に関する相談にお答えします';
        break;
      
      case BUTTON_IDS.MISSION_SUBMISSION:
        basePrompt = 'ミッション提出に関してサポートします';
        break;
      
      default:
        basePrompt = '知識ベースから回答します';
        contextInfo = 'VTuberスクール全般について';
    }
    
    // 知識ベース限定応答を生成
    const aiResponse = await ragSystem.generateKnowledgeOnlyResponse(
      userQuery,
      {
        ...context,
        buttonContext: buttonId,
        responseType: 'button_question_response',
        basePrompt: basePrompt,
        contextInfo: contextInfo
      }
    );
    
    // ボタンカテゴリ情報を含めた応答を生成
    let response = `🎯 **${buttonResponse.title} - AI回答**\n\n`;
    response += `「**${userQuery}**」についてお答えします！\n\n`;
    response += `${aiResponse}\n\n`;
    response += `---\n✨ *AI知識ベースからの回答* ✨\n`;
    response += `📞 **さらに詳しいサポートが必要な場合:** \`/soudan\` で他の相談メニューもご利用ください`;
    
    return response;
    
  } catch (error) {
    logger.errorDetail('AI応答生成エラー:', error);
    
    // エラー時は基本的な応答
    return `🎯 **${buttonResponse.title}**\n\n` +
           `「${userQuery}」についてのご質問ですね。\n\n` +
           `⚠️ 申し訳ございません。現在AI機能が一時的に利用できません。\n` +
           `直接 @わなみさん でメンションして再度ご質問いただくか、\n` +
           `しばらく待ってから \`/soudan\` で再度お試しください。`;
  }
}

// 質問待ち状態の確認
function isUserWaitingForQuestion(userId) {
  return activeQuestionWaits.has(userId);
}

// 質問待ち状態のクリア（必要時）
function clearQuestionWait(userId) {
  const waitInfo = activeQuestionWaits.get(userId);
  if (waitInfo) {
    clearTimeout(waitInfo.timeout);
    activeQuestionWaits.delete(userId);
    logger.discord(`質問待ち状態手動クリア: ${userId}`);
  }
}

// AI対象ボタンの特別処理（レガシー関数 - 後方互換性のため保持）
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
    return await handleButtonClick(interaction, client);

  } catch (error) {
    logger.errorDetail('AI対象ボタン処理エラー:', error);
    // エラー時は通常のボタン応答にフォールバック
    return await handleButtonClick(interaction, client);
  }
}

// ボタンの統計情報取得
function getButtonStats() {
  return {
    availableButtons: Object.keys(BUTTON_RESPONSES).length,
    aiTargetButtons: AI_TARGET_BUTTONS.size,
    buttonIds: Object.keys(BUTTON_RESPONSES),
    activeQuestionWaits: activeQuestionWaits.size
  };
}

// Gateway経由のボタンクリック処理（Discord.jsインタラクション対応）
async function handleButtonClickGateway(interaction, client) {
  try {
    const buttonId = interaction.customId;
    const user = interaction.user;
    
    logger.discord(`Gatewayボタンクリック: ${buttonId} by ${user?.username}`);

    // ボタン応答の取得
    const buttonResponse = BUTTON_RESPONSES[buttonId];
    
    if (!buttonResponse) {
      logger.warn(`未定義のBUTTON_ID: ${buttonId}`);
      return {
        data: {
          content: "申し訳ございません。このボタンはまだ準備中です🙏\n" +
                  "他のボタンをお試しいただくか、直接わなみさんにお声がけください✨",
          flags: 64 // EPHEMERAL
        }
      };
    }

    // AI機能対応ボタンかチェック
    const isAITarget = AI_TARGET_BUTTONS.has(buttonId);
    
    let responseContent;
    
    if (isAITarget) {
      // AI対応ボタン: 質問入力を促すメッセージを表示
      responseContent = generateQuestionPrompt(buttonResponse, buttonId, user);
      
      // 質問待ち状態を登録（３分間のタイムアウト付き）
      registerQuestionWait(user.id, buttonId, interaction.channelId);
      
    } else {
      // 静的応答ボタン: 事前定義された内容を返す
      responseContent = `✨ **${buttonResponse.title}** ✨\n\n${buttonResponse.content}`;
    }

    // 応答作成
    const response = {
      data: {
        content: responseContent,
        flags: 64 // EPHEMERAL - 本人のみ表示
      }
    };

    logger.success(`${buttonResponse.title} Gateway応答送信完了`);
    return response;

  } catch (error) {
    logger.errorDetail('Gatewayボタンクリック処理エラー:', error);
    
    return {
      data: {
        content: '❌ ボタン処理中にエラーが発生しました。しばらく待ってから再度お試しください。',
        flags: 64
      }
    };
  }
}

module.exports = {
  handleButtonClick,
  handleButtonClickGateway,
  handleAITargetButton,
  handleQuestionResponse,
  generateAIButtonResponse,
  isUserWaitingForQuestion,
  clearQuestionWait,
  getButtonStats,
  BUTTON_RESPONSES
};
