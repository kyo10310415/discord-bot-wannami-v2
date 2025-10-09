// ai/prompt-templates.js - プロンプトテンプレート（知識ベース限定機能追加版）

// 既存のコード（AI_QUESTION_PROMPTS, SYSTEM_PROMPT_TEMPLATES等）はそのまま保持

// 🆕 追加: 知識ベース限定回答システム用の新しいプロンプト
const KNOWLEDGE_BASE_LIMITED_PROMPTS = {
  base: `あなたは「わなみさん」というVTuber育成スクールの講師AIアシスタントです。

【最重要ルール - 知識ベース限定回答】
- 提供された知識ベースの情報のみを使用して回答してください
- 一般的な知識や外部情報は一切使用しないでください
- 知識ベースの情報だけで十分に回答できない場合は、必ず「申し訳ございませんが、現在の知識ベースでは十分な情報がないため、この質問にお答えできません。より具体的な情報や関連資料をお教えいただければ、適切にサポートいたします。」と回答してください

【回答スタイル】
1. 親しみやすい敬語で、相手を「さん」付けで呼ぶ
2. 知識ベースの情報を基に、具体的で実用的なアドバイスを提供
3. VTuber活動に特化した専門的なアドバイス
4. 段階的な手順や具体例を知識ベース内から提示`,

  mission_special: `\n\n【ミッション関連の特別指示】
- 「良い例」と「悪い例」の分類を最重要事項として回答してください
- 具体的な事例を用いて、推奨される方法と避けるべき方法を明確に区別してください
- 段階的な実践手順を提示し、各ステップでの注意点を明記してください
- 成功につながる要因と失敗につながる要因を対比して説明してください`
};

// 🆕 追加: 回答不能時の提案メッセージ
const UNABLE_TO_ANSWER_SUGGESTIONS = [
  '🔍 より具体的な質問内容をお教えください',
  '📚 関連する資料やドキュメントがあればご提供ください', 
  '💡 別の角度からの質問を試してみてください',
  '👥 スクールの他の講師やメンターにもご相談ください'
];

class PromptTemplates {
  // 🔄 既存メソッドはそのまま保持

  // 質問入力プロンプトを取得
  getQuestionPrompt(buttonId) {
    return AI_QUESTION_PROMPTS[buttonId] || null;
  }

  // システムプロンプトを構築
  buildSystemPrompt(context, buttonType = null) {
    let systemPrompt = SYSTEM_PROMPT_TEMPLATES.base.replace('{context}', context);

    if (buttonType && SYSTEM_PROMPT_TEMPLATES[buttonType]) {
      systemPrompt += '\n\n' + SYSTEM_PROMPT_TEMPLATES[buttonType];
    }

    return systemPrompt;
  }

  // 🆕 新規追加: 知識ベース限定プロンプト生成
  generateKnowledgeBaseOnlyPrompt(query, searchResults, userInfo = {}) {
    const context = searchResults.map(result => 
      `【関連情報】\n${result.content}\n【関連度: ${result.score.toFixed(3)}】`
    ).join('\n\n');
    
    const { username, guildName, channelName } = userInfo;
    const userContext = username ? `\n\n【質問者情報】\nユーザー: ${username}\nサーバー: ${guildName}\nチャンネル: ${channelName}` : '';

    // ミッション関連質問の判定（複数パターンに対応）
    const missionKeywords = ['ミッション', 'mission', '課題', 'タスク', 'チャレンジ', '実践', 'practice'];
    const isMissionQuery = missionKeywords.some(keyword => 
      query.toLowerCase().includes(keyword.toLowerCase())
    );

    const missionInstruction = isMissionQuery ? KNOWLEDGE_BASE_LIMITED_PROMPTS.mission_special : '';

    const confidenceInstruction = searchResults.length > 0 ? 
      `\n【回答信頼度評価】\n関連情報の件数: ${searchResults.length}件\n最高関連度: ${Math.max(...searchResults.map(r => r.score)).toFixed(3)}` : '';

    return `${KNOWLEDGE_BASE_LIMITED_PROMPTS.base}${missionInstruction}

【知識ベース検索結果】
${context || '（該当する情報が見つかりませんでした）'}

【質問】
${query}${userContext}${confidenceInstruction}

【回答】
上記の知識ベース情報のみを使用して回答してください。知識ベースに十分な情報がない場合は、回答不能と明記してください。`;
  }

  // 🆕 新規追加: 回答可能性を事前判定
  assessAnswerability(searchResults, query) {
    // 最低関連度閾値
    const MIN_RELEVANCE_THRESHOLD = 0.3;
    // 最低必要な検索結果数
    const MIN_RESULTS_COUNT = 1;
    
    if (!searchResults || searchResults.length < MIN_RESULTS_COUNT) {
      return {
        canAnswer: false,
        reason: '関連する情報が知識ベースで見つかりませんでした',
        confidence: 0
      };
    }
    
    const maxRelevance = Math.max(...searchResults.map(r => r.score));
    const relevantResults = searchResults.filter(r => r.score >= MIN_RELEVANCE_THRESHOLD);
    
    if (maxRelevance < MIN_RELEVANCE_THRESHOLD) {
      return {
        canAnswer: false,
        reason: '質問に対する十分に関連性の高い情報が知識ベースにありません',
        confidence: maxRelevance
      };
    }
    
    return {
      canAnswer: true,
      reason: `${relevantResults.length}件の関連情報が見つかりました`,
      confidence: maxRelevance,
      relevantCount: relevantResults.length
    };
  }

  // 🆕 新規追加: 回答不能メッセージ生成
  generateUnableToAnswerResponse(query, reason = '') {
    const baseMessage = `申し訳ございませんが、現在の知識ベースでは十分な情報がないため、「${query}」についてお答えできません。`;
    
    const suggestionText = UNABLE_TO_ANSWER_SUGGESTIONS.join('\n');
    const reasonText = reason ? `\n\n【詳細】${reason}` : '';
    
    return `${baseMessage}${reasonText}\n\n【ご提案】\n${suggestionText}\n\nより良いサポートをするために、お気軽に追加情報をお聞かせくださいね！`;
  }

  // 🆕 新規追加: 従来のRAGプロンプト関数（互換性維持）
  generateRAGPrompt(query, searchResults, userInfo = {}) {
    return this.generateKnowledgeBaseOnlyPrompt(query, searchResults, userInfo);
  }

  // 🔄 既存メソッドは変更なし
  addImageAnalysisInstructions(systemPrompt) {
    return systemPrompt + `

【画像分析強化指示】
- 添付された画像の内容を詳細に分析してください
- 知識ベース内の文書に含まれる関連画像も参考にしてください
- 文書内画像と質問画像を比較・関連付けて説明してください
- 画像に基づいた具体的なアドバイスやフィードバックを提供してください
- 配信設定、デザイン、SNS投稿など、VTuber活動に関連する画像は特に詳しく解説してください
- 画像の技術的な問題があれば指摘し、改善方法を提案してください`;
  }

  // 🔄 既存のエラー応答に知識ベース限定用を追加
  getErrorResponse(errorType, errorMessage = null) {
    const errorTemplates = {
      initialization: `申し訳ございません！現在システムの初期化中です🙏\n\nしばらく時間をおいてからもう一度お試しください。`,
      
      no_relevant_content: `申し訳ございませんが、ご質問に関連する資料が見つかりませんでした。🙏\n\n担任の先生に直接ご相談ください。`,
      
      // 🆕 追加: 知識ベース限定用エラー
      knowledge_base_insufficient: `申し訳ございませんが、現在の知識ベースでは十分な情報がないため、この質問にお答えできません。🙏\n\n${UNABLE_TO_ANSWER_SUGGESTIONS.join('\n')}\n\nより良いサポートをするために、お気軽に追加情報をお聞かせくださいね！`,
      
      ai_processing: `申し訳ございません！現在AI機能に問題が発生しています🙏\n\nお急ぎの場合は、担任の先生に直接ご相談ください。\nしばらく時間をおいてからもう一度お試しください。`,
      
      context_length: `申し訳ございません！質問の内容が複雑すぎて処理できませんでした🙏\n\nより具体的で短い質問に分けて、再度お試しください。`,
      
      generic: `申し訳ございません！エラーが発生しました🙏\n\n${errorMessage ? `エラー詳細: ${errorMessage}\n\n` : ''}担任の先生にご相談ください。`
    };

    return errorTemplates[errorType] || errorTemplates.generic;
  }

  // 🔄 利用可能なテンプレート一覧を更新
  getAvailableTemplates() {
    return {
      questionPrompts: Object.keys(AI_QUESTION_PROMPTS),
      systemPrompts: Object.keys(SYSTEM_PROMPT_TEMPLATES),
      knowledgeBaseLimitedPrompts: Object.keys(KNOWLEDGE_BASE_LIMITED_PROMPTS),
      errorTypes: ['initialization', 'no_relevant_content', 'knowledge_base_insufficient', 'ai_processing', 'context_length', 'generic']
    };
  }
}

module.exports = new PromptTemplates();
