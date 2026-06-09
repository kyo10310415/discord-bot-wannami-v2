// handlers/button-handler.js - ボタンクリック処理ハンドラー v2.2.0（global.interactionStates統合版）

const logger = require('../utils/logger');
const { createDiscordResponse } = require('../utils/verification');
const { BUTTON_IDS, AI_TARGET_BUTTONS } = require('../utils/constants');

// ✨ v2.2.0: global.interactionStatesを使用（mention-handlerと統合）
// const activeQuestionWaits = new Map(); ← 削除
function getInteractionStates() {
  if (!global.interactionStates) {
    global.interactionStates = new Map();
  }
  return global.interactionStates;
}

// 各ボタンの応答内容定義
const BUTTON_RESPONSES = {
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
      "Xでフォロワーを増やす方法",
      "バズる動画の作り方のコツ",
      "アンチコメントへの対処法"
    ]
  },
  
  [BUTTON_IDS.MISSION_SUBMISSION]: {
    title: "🎯 ミッション提出",
    categoryName: "ミッション評価",
    contextInfo: "ミッション成果物の提出と評価",
    examples: [
      "レッスン3のミッション成果物を提出します",
      "作成した動画のURL: https://...",
      "デザイン作品の説明: ..."
    ]
  },
  
  [BUTTON_IDS.X_PLANNING]: {
    title: "📱 Xの企画相談",
    categoryName: "X企画",
    contextInfo: "Xの企画立案、コンテンツアイデア、投稿戦略について",
    filterCategory: "X",           // E列（カテゴリ）でフィルタ
    filterKeyword: "企画",          // G列（備考）でキーワード検索
    examples: [
      "Xの企画アイデアを考えて",
      "バズるポストの企画を相談したい",
      "フォロワーが増える企画を教えて"
    ]
  },
  
  [BUTTON_IDS.YOUTUBE_PLANNING]: {
    title: "🎬 YouTubeの企画相談",
    categoryName: "YouTube企画",
    contextInfo: "YouTubeの企画立案、動画アイデア、配信企画について。チャンネルURLを含めるとパーソナライズ提案が可能",
    filterCategory: "配信",         // E列（カテゴリ）でフィルタ
    filterKeyword: "企画",          // G列（備考）でキーワード検索
    examples: [
      "YouTubeの企画アイデアを考えて",
      "チャンネルURL: https://youtube.com/@example モンハンの企画を考えて",
      "配信で面白い企画を教えて"
    ]
  },

  // ─── 新規追加 ───────────────────────────────────────────
  [BUTTON_IDS.HIATUS_CONSULTATION]: {
    title: "🏖️ 休会相談",
    // 固定テキスト応答（AI不使用）
    content: "休会に関しましては**担任の先生に**ご相談ください。"
  },

  [BUTTON_IDS.PAYMENT_CONSULTATION]: {
    title: "💳 お支払い相談",
    categoryName: "お支払い",
    contextInfo: "レッスン料の支払い、支払い遅延、強制退会ルールなどお支払いに関するご相談",
    examples: [
      "支払いが遅れてしまいそうです",
      "今月の支払いができない場合どうなりますか",
      "支払い遅延のペナルティについて教えてください"
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
        flags: 0 
      });
    }

    // AI機能対応ボタンかチェック
    const isAITarget = AI_TARGET_BUTTONS.has(buttonId);
    
    let responseContent;
    
    if (isAITarget) {
      // 🆕 ミッション提出ボタンの特別なメッセージ
      if (buttonId === BUTTON_IDS.MISSION_SUBMISSION) {
        responseContent = generateMissionPrompt(buttonResponse, buttonId, user);
      } else if (buttonId === BUTTON_IDS.PAYMENT_CONSULTATION) {
        // 🆕 お支払い相談専用アナウンス
        responseContent = generatePaymentPrompt(buttonResponse, buttonId, user);
      } else {
        // その他のAI対応ボタン: 質問入力を促すメッセージを表示
        responseContent = generateQuestionPrompt(buttonResponse, buttonId, user);
      }
      
      // 質問待ち状態を登録（3分間のタイムアウト付き）
      registerQuestionWait(user.id, buttonId, interaction.channel_id);
      
    } else {
      // 静的応答ボタン: 事前定義された内容を返す（休会相談など）
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
      flags: 0
    });
  }
}

// 🆕 ミッション提出専用プロンプト生成
function generateMissionPrompt(buttonResponse, buttonId, user) {
  const { title, categoryName } = buttonResponse;
  
  let content = `✨ **${title}** ✨\n\n`;
  content += `📝 **ミッション提出システム**\n`;
  content += `あなたのミッション成果物を提出してください！AIが自動で評価します。\n\n`;
  
  content += `📤 **提出方法:**\n`;
  content += `このメッセージに返信するか、このチャンネルで **@わなみさん [ミッション内容]** とメンションしてください\n\n`;
  
  content += `💡 **提出例:**\n`;
  content += `1. レッスン3のミッション成果物を提出します。作成したサムネイルデザインは以下のURLです: https://...\n`;
  content += `2. デザインのコンセプトは「明るく親しみやすい印象」を意識しました。\n`;
  content += `3. 添付画像: [画像を添付]\n\n`;
  
  content += `🎯 **評価内容:**\n`;
  content += `• 良い例との比較\n`;
  content += `• 悪い例（避けるべき点）のチェック\n`;
  content += `• 合格/不合格の判定\n`;
  content += `• 具体的な改善アドバイス\n\n`;
  
  content += `⏰ **制限時間: 3分間**\n`;
  content += `3分以内にミッション内容をお送りください。\n\n`;
  
  content += `準備ができましたら、成果物を提出してください！✨`;
  
  return content;
}

// 🆕 お支払い相談専用プロンプト生成
function generatePaymentPrompt(buttonResponse, buttonId, user) {
  const { title, categoryName, examples } = buttonResponse;

  let content = `✨ **${title}** ✨\n\n`;
  content += `💳 **お支払い相談システム**\n`;
  content += `${categoryName}に関するご相談をお聞かせください！\n\n`;

  content += `📝 **質問の送信方法:**\n`;
  content += `このメッセージに返信するか、このチャンネルで **@わなみさん [ご相談内容]** とメンションしてください\n\n`;

  content += `💡 **ご相談例:**\n`;
  examples.forEach((example, index) => {
    content += `${index + 1}. ${example}\n`;
  });

  content += `\n⏰ **制限時間: 3分間**\n`;
  content += `3分以内にご相談内容をお送りください。\n\n`;

  content += `準備ができましたら、ご相談内容をどうぞ！✨`;

  return content;
}

// AI対象ボタンの質問入力促進メッセージ生成
function generateQuestionPrompt(buttonResponse, buttonId, user) {
  const { title, categoryName, examples } = buttonResponse;
  
  let content = `✨ **${title}** ✨\n\n`;
  content += `🤖 **AI回答システム**\n`;
  content += `${categoryName}に関する質問をお聞かせください！\n\n`;
  
  content += `📝 **質問の送信方法:**\n`;
  content += `このメッセージに返信するか、このチャンネルで **@わなみさん [質問内容]** とメンションしてください\n\n`;
  
  content += `💡 **質問例:**\n`;
  examples.forEach((example, index) => {
    content += `${index + 1}. ${example}\n`;
  });
  
  content += `\n⏰ **制限時間: 3分間**\n`;
  content += `3分以内に質問をお送りください。時間を過ぎると自動的にキャンセルされます。\n\n`;
  
  content += `準備ができましたら、ご質問をどうぞ！✨`;
  
  return content;
}

// ✨ v2.2.0: 質問待ち状態を登録（global.interactionStates使用）
function registerQuestionWait(userId, buttonId, channelId) {
  const interactionStates = getInteractionStates();
  
  // 既存の待ち状態があればクリア
  if (interactionStates.has(userId)) {
    const existingWait = interactionStates.get(userId);
    if (existingWait.timeout) {
      clearTimeout(existingWait.timeout);
    }
    logger.discord(`既存の質問待ち状態をクリア: ${userId}`);
  }
  
  // 3分後にタイムアウト
  const timeout = setTimeout(() => {
    handleQuestionTimeout(userId, buttonId);
  }, 3 * 60 * 1000); // 3分
  
  // ✨ 修正: mention-handlerと互換性のある形式で保存
  interactionStates.set(userId, {
    waitingForQuestion: true,       // ← mention-handlerが確認する項目
    stateType: buttonId,             // ← 'mission_submission' などが入る
    buttonId: buttonId,              // 後方互換性のため保持
    channelId: channelId,
    timeout: timeout,
    startTime: Date.now()
  });
  
  logger.ai(`質問待ち状態登録: ${userId} - ${buttonId}`);
  
  // ✨ デバッグログ追加
  logger.info(`🔍 [DEBUG] 保存された状態: ${JSON.stringify({
    userId,
    waitingForQuestion: true,
    stateType: buttonId,
    buttonId,
    channelId,
    startTime: Date.now()
  }, null, 2)}`);
}

// 質問タイムアウト処理
function handleQuestionTimeout(userId, buttonId) {
  const interactionStates = getInteractionStates();
  const waitInfo = interactionStates.get(userId);
  if (!waitInfo) return;
  
  // 待ち状態をクリア
  interactionStates.delete(userId);
  
  const buttonResponse = BUTTON_RESPONSES[buttonId];
  logger.warn(`質問待ちタイムアウト: ${userId} - ${buttonId}`);
  
  // タイムアウトメッセージは必要に応じて実装
  // Discord APIの制限により、直接メッセージ送信は困難
}

// 質問受信時の処理（mention-handlerから呼び出される）
async function handleQuestionResponse(userId, userQuery, context = {}) {
  const interactionStates = getInteractionStates();
  const waitInfo = interactionStates.get(userId);
  
  if (!waitInfo) {
    // 質問待ち状態でない場合は通常の知識ベース回答
    return null;
  }
  
  try {
    // 質問待ち状態をクリア
    if (waitInfo.timeout) {
      clearTimeout(waitInfo.timeout);
    }
    interactionStates.delete(userId);
    
    const { buttonId, stateType } = waitInfo;
    const actualButtonId = buttonId || stateType; // 後方互換性
    const buttonResponse = BUTTON_RESPONSES[actualButtonId];
    
    logger.ai(`🧠 [AI] 質問応答処理開始: ${userId} - ${actualButtonId}`);
    
    // AI応答生成
    const aiResponse = await generateAIButtonResponse(buttonResponse, actualButtonId, userQuery, context);
    
    return aiResponse;
    
  } catch (error) {
    logger.errorDetail('質問応答処理エラー:', error);
    return '申し訳ございません。質問の処理中にエラーが発生しました。再度ボタンから質問を開始してください。';
  }
}

// AI対象ボタンの応答生成（🆕 ミッション提出対応版）
async function generateAIButtonResponse(buttonResponse, buttonId, userQuery, context) {
  try {
    // 🆕 デバッグログ追加
    logger.info(`🔍 [DEBUG] ======== ミッション判定デバッグ ========`);
    logger.info(`🔍 [DEBUG] buttonId: "${buttonId}"`);
    logger.info(`🔍 [DEBUG] BUTTON_IDS.MISSION_SUBMISSION: "${BUTTON_IDS.MISSION_SUBMISSION}"`);
    logger.info(`🔍 [DEBUG] typeof buttonId: ${typeof buttonId}`);
    logger.info(`🔍 [DEBUG] typeof BUTTON_IDS.MISSION_SUBMISSION: ${typeof BUTTON_IDS.MISSION_SUBMISSION}`);
    logger.info(`🔍 [DEBUG] 厳密等価判定: ${buttonId === BUTTON_IDS.MISSION_SUBMISSION}`);
    logger.info(`🔍 [DEBUG] 文字列判定: ${buttonId === 'mission_submission'}`);
    logger.info(`🔍 [DEBUG] 最終判定結果: ${buttonId === BUTTON_IDS.MISSION_SUBMISSION || buttonId === 'mission_submission'}`);
    logger.info(`🔍 [DEBUG] =======================================`);
    
    // 🆕 ミッション提出の場合は専用処理
    if (buttonId === BUTTON_IDS.MISSION_SUBMISSION || buttonId === 'mission_submission') {
      logger.info('📝 ミッション提出専用処理を実行');
      const { generateMissionResponse } = require('../services/rag-system');
      
      // 🔧 修正箇所開始 (v2.1.1) - 画像URL対応
      // contextからimageUrlsを抽出
      const imageUrls = context.imageUrls || [];
      logger.info(`🖼️ 画像添付: ${imageUrls.length}件`);
      if (imageUrls.length > 0) {
        logger.info(`🖼️ 画像URL詳細: ${JSON.stringify(imageUrls)}`);
      }
      
      // generateMissionResponseの第2引数としてimageUrlsを渡す
      const aiResponse = await generateMissionResponse(
        userQuery,
        imageUrls,  // ← 追加！第2引数として画像URLを渡す
        {
          ...context,
          buttonContext: buttonId,
          responseType: 'mission_evaluation'
        }
      );
      // 🔧 修正箇所終了
      
      // ミッション専用の応答フォーマット
      let response = `🎯 **${buttonResponse.title} - 評価結果**\n\n`;
      response += `${aiResponse}\n\n`;
      response += `---\n📚 *ミッション評価システム*\n`;
      response += `※最終判定は担任の先生が行います。`;
      
      return response;
    }
    
    // その他のAIボタン（レッスン質問、SNS相談など）
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

      case BUTTON_IDS.PAYMENT_CONSULTATION: {
        // 🆕 お支払い相談: 固定知識ベースを使ってAI回答 + 末尾に固定テキスト
        const PAYMENT_KNOWLEDGE = `【レッスン料の支払いに関する規則（WannaV）】
・レッスン料は毎月末までに翌月分をお支払いください。
・月末までに入金が確認できない場合「支払い遅延」として処理され、確認されるまでレッスンは受けられません。
・遅延後も支払い義務は継続します。
・支払い遅延から14日経過しても入金がない場合、強制退会となります。
・強制退会後もWannaVのサービスは受けられませんが、残りの契約期間のレッスン料支払い義務は残ります。`;

        const paymentResponse = await ragSystem.generateKnowledgeOnlyResponse(
          userQuery,
          {
            ...context,
            buttonContext: buttonId,
            responseType: 'payment_consultation',
            additionalKnowledge: PAYMENT_KNOWLEDGE,
            contextInfo: 'レッスン料の支払い、支払い遅延ルール、強制退会について'
          }
        );

        const PAYMENT_FOOTER = `\n\n---\nこの回答で解決できなかった場合は下記フォームよりご相談ください。\nhttps://docs.google.com/forms/d/e/1FAIpQLSeTAfgFm65uyQeroLPXQvwVX7ww-1U6Mfr54ogdK9p26dg9FQ/viewform?usp=sharing&ouid=100215225792867511983`;

        let paymentResult = `💳 **${buttonResponse.title} - AI回答**\n\n`;
        paymentResult += `「**${userQuery}**」についてお答えします！\n\n`;
        paymentResult += `${paymentResponse}`;
        paymentResult += PAYMENT_FOOTER;

        return paymentResult;
      }
      
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
    response += `---\n✨ *AI知識ベースからの回答* ✨`;
    
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
  const interactionStates = getInteractionStates();
  return interactionStates.has(userId);
}

// 質問待ち状態のクリア（必要時）
function clearQuestionWait(userId) {
  const interactionStates = getInteractionStates();
  const waitInfo = interactionStates.get(userId);
  if (waitInfo) {
    if (waitInfo.timeout) {
      clearTimeout(waitInfo.timeout);
    }
    interactionStates.delete(userId);
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
  const interactionStates = getInteractionStates();
  return {
    availableButtons: Object.keys(BUTTON_RESPONSES).length,
    aiTargetButtons: AI_TARGET_BUTTONS.size,
    buttonIds: Object.keys(BUTTON_RESPONSES),
    activeQuestionWaits: interactionStates.size
  };
}

// Gateway経由のボタンクリック処理（Discord.jsインタラクション対応）
async function handleButtonClickGateway(interaction, client) {
  try {
    const buttonId = interaction.customId;
    const user = interaction.user;
    
    logger.discord(`💬 インタラクション受信: ${buttonId} by ${user?.username}`);
    logger.discord(`Gatewayボタンクリック: ${buttonId} by ${user?.username}`);

    // ボタン応答の取得
    const buttonResponse = BUTTON_RESPONSES[buttonId];
    
    if (!buttonResponse) {
      logger.warn(`未定義のBUTTON_ID: ${buttonId}`);
      return {
        data: {
          content: "申し訳ございません。このボタンはまだ準備中です🙏\n" +
                  "他のボタンをお試しいただくか、直接わなみさんにお声がけください✨",
          flags: 0
        }
      };
    }

    // AI機能対応ボタンかチェック
    const isAITarget = AI_TARGET_BUTTONS.has(buttonId);
    
    let responseContent;
    
    if (isAITarget) {
      // 🆕 ミッション提出ボタンの特別なメッセージ
      if (buttonId === BUTTON_IDS.MISSION_SUBMISSION) {
        responseContent = generateMissionPrompt(buttonResponse, buttonId, user);
      } else if (buttonId === BUTTON_IDS.PAYMENT_CONSULTATION) {
        // 🆕 お支払い相談専用アナウンス
        responseContent = generatePaymentPrompt(buttonResponse, buttonId, user);
      } else {
        // その他のAI対応ボタン: 質問入力を促すメッセージを表示
        responseContent = generateQuestionPrompt(buttonResponse, buttonId, user);
      }
      
      // 質問待ち状態を登録（3分間のタイムアウト付き）
      registerQuestionWait(user.id, buttonId, interaction.channelId);
      
    } else {
      // 静的応答ボタン: 事前定義された内容を返す（休会相談など）
      responseContent = `✨ **${buttonResponse.title}** ✨\n\n${buttonResponse.content}`;
    }

    // 応答作成
    const response = {
      data: {
        content: responseContent,
        flags: 0
      }
    };

    logger.success(`✅ ${buttonResponse.title} Gateway応答送信完了`);
    return response;

  } catch (error) {
    logger.errorDetail('Gatewayボタンクリック処理エラー:', error);
    
    return {
      data: {
        content: '❌ ボタン処理中にエラーが発生しました。しばらく待ってから再度お試しください。',
        flags: 0
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
