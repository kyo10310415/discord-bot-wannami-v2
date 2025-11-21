/**
 * メンション処理ハンドラー v15.5.9（ミッション提出バグ修正版）
 * 
 * 【v15.5.9 変更点】
 * - isUserWaitingForQuestion()が状態タイプを返すように修正
 * - ミッション提出時にgenerateMissionResponse()を呼び出すように修正
 * - ログ出力を改善
 * 
 * 【v15.5.8 変更点】
 * - 以前のボタンスタイル（丸みのある青いボタン）に復元
 * - ボタン配置を2行に変更
 * - 絵文字なしのシンプルなデザイン
 * 
 * 【機能】
 * 1. メンション検索: ボット宛のメンションを検出
 * 2. 画像URL抽出: 添付画像・埋め込み画像を自動検出
 * 3. 知識ベース検索: RAGシステムで関連情報を取得
 * 4. Q&A記録: 質問と回答をスプレッドシートに自動保存
 * 5. Typing Indicator: 「わなみさんが入力中...」表示
 * 6. 空メンション対応: 質問なしでもボタン表示
 */

const { PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

// === 画像URL抽出関数（インライン実装） ===
function extractImageUrls(message) {
  const imageUrls = [];
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

  console.log('🖼️ [IMAGE] 画像URL抽出開始');
  console.log(`📎 添付ファイル数: ${message.attachments.size}`);
  console.log(`🎨 埋め込み数: ${message.embeds.length}`);

  // 1. 添付ファイルから画像を抽出
  message.attachments.forEach(attachment => {
    const url = attachment.url || attachment.proxyURL;
    if (url) {
      const isImage = imageExtensions.some(ext => url.toLowerCase().includes(ext));
      console.log(`📎 添付: ${url.substring(0, 80)}... (画像: ${isImage})`);
      if (isImage) {
        imageUrls.push(url);
        console.log(`✅ 画像追加: ${url}`);
      }
    }
  });

  // 2. 埋め込みから画像を抽出
  message.embeds.forEach((embed, index) => {
    console.log(`🎨 埋め込み[${index}]タイプ: ${embed.data?.type || 'unknown'}`);
    
    if (embed.image?.url) {
      console.log(`🖼️ embed.image.url発見: ${embed.image.url}`);
      imageUrls.push(embed.image.url);
    }
    if (embed.thumbnail?.url) {
      console.log(`🖼️ embed.thumbnail.url発見: ${embed.thumbnail.url}`);
      imageUrls.push(embed.thumbnail.url);
    }
    if (embed.data?.image?.url) {
      console.log(`🖼️ embed.data.image.url発見: ${embed.data.image.url}`);
      imageUrls.push(embed.data.image.url);
    }
    if (embed.data?.thumbnail?.url) {
      console.log(`🖼️ embed.data.thumbnail.url発見: ${embed.data.thumbnail.url}`);
      imageUrls.push(embed.data.thumbnail.url);
    }
  });

  // 3. 重複削除
  const uniqueUrls = [...new Set(imageUrls)];
  console.log(`✅ 抽出完了: ${uniqueUrls.length}件の画像`);
  
  return uniqueUrls;
}

// === ✨ v15.5.9 修正: ユーザー状態チェック関数（状態タイプを返す） ===
function isUserWaitingForQuestion(userId, interactionStates) {
  if (!interactionStates || !interactionStates.has(userId)) {
    return null; // 待機状態なし
  }
  const state = interactionStates.get(userId);
  
  // waitingForQuestionがtrueの場合、stateTypeを返す
  if (state && state.waitingForQuestion === true) {
    return state.stateType || null; // 例: 'mission_submission'
  }
  
  return null;
}

// === ✨ v15.5.9 追加: 待機状態クリア関数 ===
function clearWaitingQuestion(userId, interactionStates) {
  if (interactionStates && interactionStates.has(userId)) {
    interactionStates.delete(userId);
    console.log(`✅ [STATE] 待機状態クリア: ${userId}`);
  }
}

// === Typing Indicator 管理関数 ===
function startTypingIndicator(channel) {
  console.log('⌨️ [TYPING] Typing Indicator 開始');
  
  // 初回送信
  channel.sendTyping().catch(err => {
    console.error('⚠️ [TYPING] 送信エラー:', err.message);
  });
  
  // 15秒ごとに自動更新（Discordの仕様：10秒で消えるため）
  const typingInterval = setInterval(() => {
    channel.sendTyping().catch(err => {
      console.error('⚠️ [TYPING] 更新エラー:', err.message);
    });
  }, 8000); // 8秒ごとに更新（余裕を持たせる）
  
  return typingInterval;
}

function stopTypingIndicator(typingInterval) {
  if (typingInterval) {
    clearInterval(typingInterval);
    console.log('⌨️ [TYPING] Typing Indicator 停止');
  }
}

// === 以前のスタイルのボタンセットを作成する関数 ===
function createClassicButtons() {
  // 1行目: 主要な相談ボタン（3つ）
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('payment_consultation')
      .setLabel('①お支払い相談')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('private_consultation')
      .setLabel('②プライベート相談')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('lesson_question')
      .setLabel('③レッスン質問')
      .setStyle(ButtonStyle.Primary)
  );

  // 2行目: その他のボタン（2つ）
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sns_consultation')
      .setLabel('④SNS運用相談')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('mission_submission')
      .setLabel('⑤ミッション提出')
      .setStyle(ButtonStyle.Primary)
  );

  return [row1, row2];
}

// === メンション処理メイン関数（既存） ===
async function handleMessage(message, client) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔔 [MENTION] メンションハンドラー起動 v15.5.9');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let typingInterval = null;

  try {
    // === 1. メンション検出 ===
    const botMentioned = message.mentions.has(client.user.id);
    console.log(`👤 送信者: ${message.author.tag} (ID: ${message.author.id})`);
    console.log(`📝 メッセージ内容: "${message.content}"`);
    console.log(`🤖 ボットへのメンション: ${botMentioned ? 'あり ✅' : 'なし ❌'}`);

    if (!botMentioned) {
      console.log('❌ ボットへのメンションなし → 処理スキップ');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return;
    }

    console.log('✅ メンション検出成功 → 処理続行');

    // === 2. 権限チェック ===
    const botMember = message.guild?.members.cache.get(client.user.id);
    if (botMember && !message.channel.permissionsFor(botMember).has(PermissionsBitField.Flags.SendMessages)) {
      console.warn('⚠️ 送信権限なし');
      return;
    }

    // === 3. コンテンツ抽出 ===
    const botMention = `<@${client.user.id}>`;
    const botMentionNick = `<@!${client.user.id}>`;
    let questionText = message.content
      .replace(new RegExp(botMention, 'g'), '')
      .replace(new RegExp(botMentionNick, 'g'), '')
      .trim();

    console.log(`📝 抽出されたコンテンツ: "${questionText}"`);

    // ✨ === v15.5.8: 空メンション時の特別処理（クラシックスタイル） === ✨
    if (!questionText) {
      console.log('✨ 質問内容が空 → クラシックスタイルのボタンを表示');
      
      const welcomeMessage = `🤖 **わなみさんです！**

どのようなご相談でしょうか？下のボタンから選択してください✨

📘 **知識ベース限定回答システム**
• @わなみさん【質問】で知識ベースから正確な回答
• VTuber活動に特化した専門情報のみ回答

📖 **専門サポートメニュー**
下のボタンから選択して、より詳しいサポートを受けられます！`;

      try {
        const buttons = createClassicButtons();
        const botReply = await message.reply({
          content: welcomeMessage,
          components: buttons
        });
        console.log('✅ 空メンション応答送信完了（クラシックボタン付き）');
      } catch (error) {
        console.error('❌ 空メンション応答送信失敗:', error);
      }
      
      return; // ここで処理終了
    }

    console.log('✅ コンテンツ抽出成功 → AI回答処理へ');

    // ✨ === Typing Indicator 開始 === ✨
    typingInterval = startTypingIndicator(message.channel);

    // === 4. 画像URL抽出 ===
    console.log('🖼️ [IMAGE] 画像URL抽出開始');
    const imageUrls = extractImageUrls(message);
    
    console.log(`🖼️ 画像添付: ${imageUrls.length > 0 ? `${imageUrls.length}件` : 'なし'}`);
    if (imageUrls.length > 0) {
      console.log('📸 検出された画像URL:');
      imageUrls.forEach((url, i) => {
        console.log(`  ${i + 1}. ${url}`);
      });
    }

    // === 5. ✨ v15.5.9 修正: 待機状態チェック（状態タイプを取得） ===
    console.log('🔍 [CHECK-1] isUserWaitingForQuestion チェック開始');
    const interactionStates = global.interactionStates || new Map();
    const waitingType = isUserWaitingForQuestion(message.author.id, interactionStates);
    console.log(`🔍 [CHECK-1] 結果: ${waitingType ? `待機中 (${waitingType}) ⏳` : '待機なし ✅'}`);

    // === 6. require文のテスト（services/パス対応版） ===
    console.log('🔍 [CHECK-2] require文テスト開始');
    let RAGSystem;
    try {
      console.log('📦 [REQUIRE] ../services/rag-system を読み込み中...');
      RAGSystem = require('../services/rag-system');
      console.log('✅ [REQUIRE] 読み込み成功');
      console.log(`📦 [REQUIRE] RAGSystemの型: ${typeof RAGSystem}`);
      console.log(`📦 [REQUIRE] generateKnowledgeOnlyResponseの型: ${typeof RAGSystem?.generateKnowledgeOnlyResponse}`);
      console.log(`📦 [REQUIRE] generateMissionResponseの型: ${typeof RAGSystem?.generateMissionResponse}`);
    } catch (requireError) {
      console.error('❌ [REQUIRE] エラー発生:', requireError);
      console.error('❌ [REQUIRE] スタックトレース:', requireError.stack);
      stopTypingIndicator(typingInterval);
      await message.reply('システムエラー: RAGシステムの読み込みに失敗しました。');
      return;
    }

    console.log('✅ [CHECK-2] 通過 - require成功');

    // === 7. hasButtonHandler チェック ===
    console.log('🔍 [CHECK-3] hasButtonHandler チェック開始');
    const hasButtonHandler = typeof global.handleButtonInteraction === 'function';
    console.log(`🔍 [CHECK-3] 結果: ${hasButtonHandler ? '登録済み ✅' : '未登録 ❌'}`);

    if (!hasButtonHandler) {
      console.warn('⚠️ ボタンハンドラーが未登録');
    } else {
      console.log('✅ [CHECK-3] 通過 - ボタンハンドラー登録済み');
    }

    // === 8. ✨ v15.5.9 修正: RAGシステム呼び出し（待機状態に応じて分岐） ===
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧠 [AI] 応答生成開始（v15.5.9）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📝 質問: "${questionText}"`);
    console.log(`🖼️ 画像: ${imageUrls.length}件`);
    console.log(`🔍 待機状態: ${waitingType || 'なし'}`);

    let botReply, response;
    try {
      // ✨ 待機状態に応じて適切なRAGメソッドを呼び出し ✨
      if (waitingType && waitingType.includes('mission')) {
        // ミッション提出処理
        console.log('🎯 [AI] ミッション提出処理開始:', waitingType);
        console.log('🔄 [RAG] generateMissionResponse 呼び出し中...');
        
        response = await RAGSystem.generateMissionResponse(
          waitingType,
          questionText,
          imageUrls
        );
        
        // 待機状態をクリア
        clearWaitingQuestion(message.author.id, interactionStates);
        console.log('✅ [AI] ミッション応答生成完了 & 待機状態クリア');
        
      } else {
        // 通常の質問応答
        console.log('💬 [AI] 通常の質問応答処理');
        console.log('🔄 [RAG] generateKnowledgeOnlyResponse 呼び出し中...');
        
        response = await RAGSystem.generateKnowledgeOnlyResponse(
          questionText,
          imageUrls
        );
        
        console.log('✅ [AI] 通常応答生成完了');
      }

      console.log(`📊 [RAG] 応答長: ${response?.length || 0}文字`);

      // ✨ Typing Indicator 停止 ✨
      stopTypingIndicator(typingInterval);
      typingInterval = null;

      if (!response || response.trim().length === 0) {
        throw new Error('RAGシステムから空の応答が返されました');
      }

      // === 9. Discord送信 ===
      console.log('📤 [DISCORD] メッセージ送信準備');
      
      if (response.length <= 2000) {
        console.log('📤 [DISCORD] 単一メッセージとして送信');
        botReply = await message.reply(response);
      } else {
        console.log('📤 [DISCORD] 分割送信（2000文字超過）');
        const chunks = response.match(/[\s\S]{1,2000}/g) || [];
        console.log(`📤 [DISCORD] 分割数: ${chunks.length}`);
        
        for (let i = 0; i < chunks.length; i++) {
          console.log(`📤 [DISCORD] チャンク${i + 1}/${chunks.length} 送信中...`);
          if (i === 0) {
            botReply = await message.reply(chunks[i]);
          } else {
            await message.channel.send(chunks[i]);
          }
        }
      }

      console.log('✅ [DISCORD] 送信完了');

    } catch (ragError) {
      console.error('❌ [RAG] エラー発生:', ragError);
      console.error('❌ [RAG] スタックトレース:', ragError.stack);
      stopTypingIndicator(typingInterval);
      await message.reply('エラーが発生しました。しばらくしてから再度お試しください。');
      return;
    }

    // === 10. ボタン追加 ===
    if (botReply && hasButtonHandler) {
      console.log('🎮 [BUTTON] ボタン追加処理開始');
      try {
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('button_3')
            .setLabel('③ 画像生成')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎨'),
          new ButtonBuilder()
            .setCustomId('button_4')
            .setLabel('④ もっと詳しく')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📚'),
          new ButtonBuilder()
            .setCustomId('button_5')
            .setLabel('⑤ 別の質問')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💬')
        );

        await botReply.edit({ components: [buttons] });
        console.log('✅ [BUTTON] ボタン追加完了');

      } catch (buttonError) {
        console.error('⚠️ [BUTTON] ボタン追加失敗:', buttonError);
      }
    } else {
      console.log('⚠️ [BUTTON] スキップ（botReplyなし or ハンドラー未登録）');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ [MENTION] メンション処理完了 v15.5.9');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌❌❌ [CRITICAL] 予期しないエラー:', error);
    console.error('❌❌❌ [CRITICAL] スタックトレース:', error.stack);
    console.error('❌❌❌ [CRITICAL] エラー詳細:', JSON.stringify(error, null, 2));
    
    stopTypingIndicator(typingInterval);
    
    try {
      await message.reply('予期しないエラーが発生しました。管理者に連絡してください。');
    } catch (replyError) {
      console.error('❌ 返信送信にも失敗:', replyError);
    }
  }
}

// === メンション処理メイン関数（Q&A記録版） ===
async function handleMessageWithQALogging(message, client, qaLoggerService) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔔 [MENTION+LOG] メンションハンドラー起動 v15.5.9（Q&A記録版）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let typingInterval = null;

  try {
    // === 1. メンション検出 ===
    const botMentioned = message.mentions.has(client.user.id);
    console.log(`👤 送信者: ${message.author.tag} (ID: ${message.author.id})`);
    console.log(`📝 メッセージ内容: "${message.content}"`);
    console.log(`🤖 ボットへのメンション: ${botMentioned ? 'あり ✅' : 'なし ❌'}`);

    if (!botMentioned) {
      console.log('❌ ボットへのメンションなし → 処理スキップ');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return;
    }

    console.log('✅ メンション検出成功 → 処理続行');

    // === 2. 権限チェック ===
    const botMember = message.guild?.members.cache.get(client.user.id);
    if (botMember && !message.channel.permissionsFor(botMember).has(PermissionsBitField.Flags.SendMessages)) {
      console.warn('⚠️ 送信権限なし');
      return;
    }

    // === 3. コンテンツ抽出 ===
    const botMention = `<@${client.user.id}>`;
    const botMentionNick = `<@!${client.user.id}>`;
    let questionText = message.content
      .replace(new RegExp(botMention, 'g'), '')
      .replace(new RegExp(botMentionNick, 'g'), '')
      .trim();

    console.log(`📝 抽出されたコンテンツ: "${questionText}"`);

    // ✨ === v15.5.8: 空メンション時の特別処理（クラシックスタイル） === ✨
    if (!questionText) {
      console.log('✨ 質問内容が空 → クラシックスタイルのボタンを表示');
      
      const welcomeMessage = `🤖 **わなみさんです！**

どのようなご相談でしょうか？下のボタンから選択してください✨

📘 **知識ベース限定回答システム**
• @わなみさん【質問】で知識ベースから正確な回答
• VTuber活動に特化した専門情報のみ回答

📖 **専門サポートメニュー**
下のボタンから選択して、より詳しいサポートを受けられます！`;

      try {
        const buttons = createClassicButtons();
        const botReply = await message.reply({
          content: welcomeMessage,
          components: buttons
        });
        console.log('✅ 空メンション応答送信完了（クラシックボタン付き）');
      } catch (error) {
        console.error('❌ 空メンション応答送信失敗:', error);
      }
      
      return; // ここで処理終了
    }

    console.log('✅ コンテンツ抽出成功 → AI回答処理へ');

    // ✨ === Typing Indicator 開始 === ✨
    typingInterval = startTypingIndicator(message.channel);

    // === 4. 画像URL抽出 ===
    console.log('🖼️ [IMAGE] 画像URL抽出開始');
    const imageUrls = extractImageUrls(message);
    
    console.log(`🖼️ 画像添付: ${imageUrls.length > 0 ? `${imageUrls.length}件` : 'なし'}`);
    if (imageUrls.length > 0) {
      console.log('📸 検出された画像URL:');
      imageUrls.forEach((url, i) => {
        console.log(`  ${i + 1}. ${url}`);
      });
    }

    // === 5. ✨ v15.5.9 修正: 待機状態チェック（状態タイプを取得） ===
    console.log('🔍 [CHECK-1] isUserWaitingForQuestion チェック開始');
    const interactionStates = global.interactionStates || new Map();
    const waitingType = isUserWaitingForQuestion(message.author.id, interactionStates);
    console.log(`🔍 [CHECK-1] 結果: ${waitingType ? `待機中 (${waitingType}) ⏳` : '待機なし ✅'}`);

    // === 6. require文のテスト（services/パス対応版） ===
    console.log('🔍 [CHECK-2] require文テスト開始');
    let RAGSystem;
    try {
      console.log('📦 [REQUIRE] ../services/rag-system を読み込み中...');
      RAGSystem = require('../services/rag-system');
      console.log('✅ [REQUIRE] rag-system 読み込み成功');
      
      console.log(`📦 [REQUIRE] RAGSystem型: ${typeof RAGSystem}`);
      console.log(`📦 [REQUIRE] generateKnowledgeOnlyResponse型: ${typeof RAGSystem?.generateKnowledgeOnlyResponse}`);
      console.log(`📦 [REQUIRE] generateMissionResponse型: ${typeof RAGSystem?.generateMissionResponse}`);
      
    } catch (requireError) {
      console.error('❌ [REQUIRE] エラー発生:', requireError);
      console.error('❌ [REQUIRE] スタックトレース:', requireError.stack);
      stopTypingIndicator(typingInterval);
      await message.reply('システムエラー: モジュールの読み込みに失敗しました。');
      return;
    }

    console.log('✅ [CHECK-2] 通過 - require成功');

    // === 7. ✨ v15.5.9 修正: RAGシステム呼び出し（待機状態に応じて分岐） ===
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧠 [AI] 応答生成開始（Q&A記録版 v15.5.9）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📝 質問: "${questionText}"`);
    console.log(`🖼️ 画像: ${imageUrls.length}件`);
    console.log(`🔍 待機状態: ${waitingType || 'なし'}`);

    let botReply, responseText;
    try {
      // ✨ 待機状態に応じて適切なRAGメソッドを呼び出し ✨
      if (waitingType && waitingType.includes('mission')) {
        // ミッション提出処理
        console.log('🎯 [AI] ミッション提出処理開始:', waitingType);
        console.log('🔄 [RAG] generateMissionResponse 呼び出し中...');
        
        responseText = await RAGSystem.generateMissionResponse(
          waitingType,
          questionText,
          imageUrls
        );
        
        // 待機状態をクリア
        clearWaitingQuestion(message.author.id, interactionStates);
        console.log('✅ [AI] ミッション応答生成完了 & 待機状態クリア');
        
      } else {
        // 通常の質問応答
        console.log('💬 [AI] 通常の質問応答処理');
        console.log('🔄 [RAG] generateKnowledgeOnlyResponse 呼び出し中...');
        
        responseText = await RAGSystem.generateKnowledgeOnlyResponse(
          questionText,
          imageUrls
        );
        
        console.log('✅ [AI] 通常応答生成完了');
      }

      console.log(`📊 [RAG] 応答長: ${responseText?.length || 0}文字`);

      // ✨ Typing Indicator 停止 ✨
      stopTypingIndicator(typingInterval);
      typingInterval = null;

      if (!responseText || responseText.trim().length === 0) {
        throw new Error('RAGシステムから空の応答が返されました');
      }

      // === 8. Discord送信 ===
      console.log('📤 [DISCORD] メッセージ送信準備');
      
      if (responseText.length <= 2000) {
        console.log('📤 [DISCORD] 単一メッセージとして送信');
        botReply = await message.reply(responseText);
      } else {
        console.log('📤 [DISCORD] 分割送信（2000文字超過）');
        const chunks = responseText.match(/[\s\S]{1,2000}/g) || [];
        console.log(`📤 [DISCORD] 分割数: ${chunks.length}`);
        
        for (let i = 0; i < chunks.length; i++) {
          console.log(`📤 [DISCORD] チャンク${i + 1}/${chunks.length} 送信中...`);
          if (i === 0) {
            botReply = await message.reply(chunks[i]);
          } else {
            await message.channel.send(chunks[i]);
          }
        }
      }

      console.log('✅ [DISCORD] 送信完了');

    } catch (ragError) {
      console.error('❌ [RAG] エラー発生:', ragError);
      console.error('❌ [RAG] スタックトレース:', ragError.stack);
      stopTypingIndicator(typingInterval);
      await message.reply('エラーが発生しました。しばらくしてから再度お試しください。');
      return;
    }

    // === 9. Q&A記録 ===
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 [QA-LOG] Q&A記録開始');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      if (qaLoggerService && typeof qaLoggerService.logQA === 'function') {
        await qaLoggerService.logQA({
          userId: message.author.id,
          username: message.author.tag,
          question: questionText,
          answer: responseText,
          hasImage: imageUrls.length > 0,
          channelId: message.channel.id,
          messageId: message.id,
          missionType: waitingType || null // ✨ ミッションタイプを記録
        });
        console.log('✅ [QA-LOG] 記録完了');
      } else {
        console.log('⚠️ [QA-LOG] スキップ（qaLoggerService未初期化）');
      }
    } catch (logError) {
      console.error('⚠️ [QA-LOG] 記録失敗（処理は続行）:', logError);
    }

    // === 10. ボタン追加 ===
    const hasButtonHandler = typeof global.handleButtonInteraction === 'function';
    if (botReply && hasButtonHandler) {
      console.log('🎮 [BUTTON] ボタン追加処理開始');
      try {
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('button_3')
            .setLabel('③ 画像生成')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🎨'),
          new ButtonBuilder()
            .setCustomId('button_4')
            .setLabel('④ もっと詳しく')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📚'),
          new ButtonBuilder()
            .setCustomId('button_5')
            .setLabel('⑤ 別の質問')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💬')
        );

        await botReply.edit({ components: [buttons] });
        console.log('✅ [BUTTON] ボタン追加完了');

      } catch (buttonError) {
        console.error('⚠️ [BUTTON] ボタン追加失敗:', buttonError);
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ [MENTION+LOG] メンション処理完了 v15.5.9');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌❌❌ [CRITICAL] 予期しないエラー:', error);
    console.error('❌❌❌ [CRITICAL] スタックトレース:', error.stack);
    console.error('❌❌❌ [CRITICAL] エラー詳細:', JSON.stringify(error, null, 2));
    
    stopTypingIndicator(typingInterval);
    
    try {
      await message.reply('予期しないエラーが発生しました。管理者に連絡してください。');
    } catch (replyError) {
      console.error('❌ 返信送信にも失敗:', replyError);
    }
  }
}

module.exports = { 
  handleMessage,
  handleMessageWithQALogging 
};
