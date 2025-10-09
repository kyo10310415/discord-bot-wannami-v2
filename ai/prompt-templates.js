// ai/prompt-templates.js - プロンプトテンプレート

// AI応答ボタンの質問入力要求メッセージ
const AI_QUESTION_PROMPTS = {
  lesson_question: {
    title: "📚 レッスンについての質問",
    content: `**レッスンに関するご質問をお聞かせください！**

🔹 **質問例**
• 「外向きの配信とはどんな配信ですか？」
• 「配信で音声が聞こえない時の対処法は？」
• 「デザイン4原則について教えてください」

💡 **質問のコツ**
• 具体的な状況や症状を教えてください
• 使用しているソフトウェア名があれば記載してください
• エラーメッセージがあれば教えてください
• レッスン番号を記載してください
• 🖼️ **画像添付可能**：配信設定画面やエラー画面があれば添付してください

📚 **知識ベース内の関連画像も自動で参考にします！**

**📝 この下にあなたの質問を入力してください ⬇️**
※質問内容は1分以内に送信してください！
　回答まで1分半ほどかかります！`
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
• XアカウントやチャンネルURLを教えていただけるとより良いアドバイスができる可能性があります
• 🖼️ **画像添付可能**：サムネイル、投稿画像、アナリティクス画面など添付してください

📚 **知識ベース内の関連画像も自動で参考にします！**

**📝 この下にあなたのご相談内容を入力してください ⬇️**
※質問内容は1分以内に送信してください！
　回答まで1分半ほどかかります！`
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
• 🖼️ **画像添付可能**：成果物のスクリーンショット、作業画面など添付してください

📚 **知識ベース内の関連画像も自動で参考にします！**

**📝 この下にミッション関連の内容を入力してください ⬇️**
※質問内容は1分以内に送信してください！　回答まで1分半ほどかかります！`
  }
};

// システムプロンプトのベーステンプレート
const SYSTEM_PROMPT_TEMPLATES = {
  base: `あなたはVTuber育成スクール「わなみさん」の専門AIアシスタントです。

以下の参考資料を基に、生徒からの質問に親切で具体的な回答をしてください。

【参考資料】
{context}

【回答ルール】
- 丁寧で親しみやすい口調で回答してください
- 具体的で実用的なアドバイスを提供してください
- 絵文字を適度に使用してください
- 1000文字以内で簡潔にまとめてください
- 参考資料にない内容は「担任の先生にご相談ください」と案内してください`,

  lesson_question: `【特別指示：レッスン質問】
- レッスン内容に関する質問として回答してください
- 技術的な内容は段階的に説明してください
- 画像がある場合は詳細に分析してください
- 該当するレッスン番号があれば具体的に案内してください`,

  sns_consultation: `【特別指示：SNS運用相談】
- X(Twitter)やYouTubeの運用に関する相談として回答してください
- 具体的な戦略やコツを提供してください
- 画像がある場合は改善点を具体的に指摘してください
- フォロワー獲得やエンゲージメント向上のアドバイスを含めてください`,

  mission_submission: `【特別指示：ミッション提出】
- ミッション提出に関する質問として回答してください
- 画像がある場合は詳細なフィードバックを提供してください
- 良い点を褒めつつ、改善点も建設的に指摘してください
- 取り組み方や提出方法について説明してください`,

  mention_direct: `【特別指示：メンション直接質問】
- メンションによる直接質問として回答してください
- レッスン、SNS運用、ミッション提出など幅広い質問に対応してください
- 質問の内容に応じて適切なカテゴリで回答してください
- 画像がある場合は詳細に分析してください`
};

class PromptTemplates {
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

  // 画像分析用プロンプト拡張
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

  // エラー時の応答テンプレート
  getErrorResponse(errorType, errorMessage = null) {
    const errorTemplates = {
      initialization: `申し訳ございません！現在システムの初期化中です🙏\n\nしばらく時間をおいてからもう一度お試しください。`,
      
      no_relevant_content: `申し訳ございませんが、ご質問に関連する資料が見つかりませんでした。🙏\n\n担任の先生に直接ご相談ください。`,
      
      ai_processing: `申し訳ございません！現在AI機能に問題が発生しています🙏\n\nお急ぎの場合は、担任の先生に直接ご相談ください。\nしばらく時間をおいてからもう一度お試しください。`,
      
      context_length: `申し訳ございません！質問の内容が複雑すぎて処理できませんでした🙏\n\nより具体的で短い質問に分けて、再度お試しください。`,
      
      generic: `申し訳ございません！エラーが発生しました🙏\n\n${errorMessage ? `エラー詳細: ${errorMessage}\n\n` : ''}担任の先生にご相談ください。`
    };

    return errorTemplates[errorType] || errorTemplates.generic;
  }

  // 利用可能なプロンプトテンプレート一覧
  getAvailableTemplates() {
    return {
      questionPrompts: Object.keys(AI_QUESTION_PROMPTS),
      systemPrompts: Object.keys(SYSTEM_PROMPT_TEMPLATES),
      errorTypes: ['initialization', 'no_relevant_content', 'ai_processing', 'context_length', 'generic']
    };
  }
}

module.exports = new PromptTemplates();
