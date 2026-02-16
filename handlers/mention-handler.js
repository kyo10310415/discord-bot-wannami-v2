/**
 * メンション処理ハンドラー v16.1.1（YouTube企画相談ボタン連動版）
 * 
 * 【v16.1.1 変更点】🔧 修正
 * - YouTube URL検出を「YouTubeの企画相談」ボタン押下時のみに限定
 * - YouTube企画相談モード以外ではYouTube分析をスキップ
 * - 無駄なAPI消費を防止
 * 
 * 【v16.1.0 変更点】🎬 新機能
 * - YouTube URL検出機能を追加
 * - YouTubeチャンネル分析機能（YouTube Data API利用）
 * - チャンネル情報に基づいた企画提案機能
 * - ユーザーのチャンネルと近い活動内容のVTuberを参考にした企画生成
 * 
 * 【v15.6.1 変更点】🔧 修正
 * - 隠しキーワード検出のデバッグログを大幅に強化
 * - 検出後の処理終了を確実にするため、ログと return を明示化
 * - 固定レスポンスが確実に返されることを保証
 * 
 * 【v15.6.0 変更点】🎁 新機能
 * - 隠しキーワード検出機能を追加
 * - レッスン質問ボタン後に「WannaV最高」と入力すると特別なURLを表示
 * - コンテキスト依存の隠しキーワード対応（特定のボタンを押した後のみ有効）
 * 
 * 【v15.5.15 変更点】🚨 重要
 * - 通常質問でも画像分析に対応（ミッション以外でも画像添付を処理）
 * - generateKnowledgeOnlyResponse 呼び出し時に imageUrls を context に含める
 * 
 * 【v15.5.14 変更点】🚨 重要
 * - Q&A記録のフィールド名を修正: answer → response
 * - 新規フィールド追加: channelName, guildName, responseLength, processingTime, questionType
 * - 処理時間計測機能を追加（startTime/processingTime）
 * 
 * 【v15.5.12 変更点】
 * - @everyone / @here メンション除外機能を追加
 * - message.mentions.everyoneチェックを実装
 * 
 * 【v15.5.11 変更点】🚨 重要
 * - 無限ループ対策: Botメッセージ検出チェックを最優先で追加
 * - message.author.bot チェックを両関数の冒頭に実装
 * - システムメッセージ・Webhookメッセージの除外も追加
 * 
 * 【機能】
 * 1. メンション検索: ボット宛のメンションを検出
 * 2. 画像URL抽出: 添付画像・埋め込み画像を自動検出
 * 3. 知識ベース検索: RAGシステムで関連情報を取得
 * 4. Q&A記録: 質問と回答をスプレッドシートに自動保存
 * 5. Typing Indicator: 「わなみさんが入力中...」表示
 * 6. 空メンション対応: 質問なしでもボタン表示
 * 7. 無限ループ対策: Botメッセージを自動的に無視
 * 8. @everyone/@here除外: 全体メンションには反応しない
 */

const { PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { HIDDEN_KEYWORDS } = require('../config/hidden-keywords');
const { youtubeAnalyzer } = require('../services/youtube-analyzer');

// === YouTube URL検出関数 ===
function extractYouTubeUrl(text) {
  const youtubeRegex = /https?:\/\/(www\.)?(youtube\.com\/(channel\/|c\/|@|user\/)|youtu\.be\/)[\w\-@]+/gi;
  const matches = text.match(youtubeRegex);
  if (matches && matches.length > 0) {
    console.log(`📺 [YOUTUBE] YouTube URL検出: ${matches[0]}`);
    return matches[0];
  }
  return null;
}

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

// === ユーザー状態チェック関数（状態タイプを返す） ===
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

// === 待機状態クリア関数 ===
function clearWaitingQuestion(userId, interactionStates) {
  if (interactionStates && interactionStates.has(userId)) {
    interactionStates.delete(userId);
    console.log(`✅ [STATE] 待機状態クリア: ${userId}`);
  }
}

// === 🎁 隠しキーワード検出関数 ===
function checkHiddenKeyword(questionText, waitingType) {
  console.log(`🔍 [HIDDEN-FUNC] 検出関数開始`);
  console.log(`📝 [HIDDEN-FUNC] 入力テキスト: "${questionText}"`);
  console.log(`🎯 [HIDDEN-FUNC] コンテキスト: "${waitingType}"`);
  console.log(`📚 [HIDDEN-FUNC] 登録キーワード数: ${HIDDEN_KEYWORDS.length}`);
  
  // キーワードをチェック
  for (let i = 0; i < HIDDEN_KEYWORDS.length; i++) {
    const hidden = HIDDEN_KEYWORDS[i];
    console.log(`🔎 [HIDDEN-FUNC] キーワード${i + 1}/${HIDDEN_KEYWORDS.length}: "${hidden.keyword}"`);
    
    // 質問テキストに隠しキーワードが含まれているか（大文字小文字区別なし、スペース除去）
    const normalizedQuestion = questionText.toLowerCase().replace(/\s+/g, '');
    const normalizedKeyword = hidden.keyword.toLowerCase().replace(/\s+/g, '');
    
    console.log(`  📝 正規化後の質問: "${normalizedQuestion}"`);
    console.log(`  🔑 正規化後のキーワード: "${normalizedKeyword}"`);
    console.log(`  🔍 includes結果: ${normalizedQuestion.includes(normalizedKeyword)}`);
    
    if (normalizedQuestion.includes(normalizedKeyword)) {
      console.log(`  ✅ キーワード一致！`);
      
      // コンテキストが指定されている場合はチェック
      if (hidden.requiredContext) {
        console.log(`  🎯 必要コンテキスト: "${hidden.requiredContext}"`);
        console.log(`  🎯 現在のコンテキスト: "${waitingType}"`);
        console.log(`  🎯 一致判定: ${waitingType === hidden.requiredContext}`);
        
        if (waitingType !== hidden.requiredContext) {
          console.log(`  ⚠️ コンテキスト不一致 → スキップ`);
          continue;
        }
      } else {
        console.log(`  🎯 コンテキスト制限なし`);
      }
      
      console.log(`  🎉 隠しキーワード検出成功！`);
      return {
        keyword: hidden.keyword,
        response: hidden.response
      };
    } else {
      console.log(`  ❌ キーワード不一致`);
    }
  }
  
  console.log(`🔍 [HIDDEN-FUNC] 検出なし → null を返す`);
  return null;
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
  // 1行目: レッスン・SNS・ミッションボタン（3つ）
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('lesson_question')
      .setLabel('①レッスン質問')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('sns_consultation')
      .setLabel('②SNS運用相談')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('mission_submission')
      .setLabel('③ミッション提出')
      .setStyle(ButtonStyle.Primary)
  );

  // 2行目: 企画相談ボタン（2つ）
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('x_planning')
      .setLabel('📱 Xの企画相談')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('youtube_planning')
      .setLabel('🎬 YouTubeの企画相談')
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2];
}

// === メンション処理メイン関数（既存） ===
async function handleMessage(message, client) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔔 [MENTION] メンションハンドラー起動 v15.5.14');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let typingInterval = null;

  try {
    // =====================================
    // 🛡️ 【最優先】無限ループ対策 + @everyone除外
    // =====================================
    
    // 1. Botメッセージを完全に無視
    if (message.author.bot) {
      console.log('🤖 [LOOP PREVENTION] Botメッセージ検出 → スキップ');
      return;
    }
    
    // 2. システムメッセージを無視
    if (message.system) {
      console.log('⚙️ [LOOP PREVENTION] システムメッセージ検出 → スキップ');
      return;
    }
    
    // 3. Webhookメッセージを無視
    if (message.webhookId) {
      console.log('🔗 [LOOP PREVENTION] Webhookメッセージ検出 → スキップ');
      return;
    }
    
    // 4. 自分自身のIDを再確認（二重チェック）
    if (message.author.id === client.user.id) {
      console.log('⚠️ [LOOP PREVENTION] 自分自身のメッセージ検出 → スキップ');
      return;
    }

    // 5. @everyone / @here メンションを除外
    if (message.mentions.everyone) {
      console.log('🔕 [@EVERYONE] @everyone/@here メンション検出 → スキップ');
      console.log(`   送信者: ${message.author.username} (ID: ${message.author.id})`);
      return;
    }

    // === 1. メンション検出 ===
    const botMentioned = message.mentions.has(client.user.id);
    console.log(`👤 送信者: ${message.author.tag} (ID: ${message.author.id}, Bot: ${message.author.bot})`);
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

    // === 空メンション時の特別処理（クラシックスタイル） ===
    if (!questionText) {
      console.log('✨ 質問内容が空 → クラシックスタイルのボタンを表示');

      const welcomeMessage = `🤖 **わなみさんです！**

どのようなご相談でしょうか？下のボタンから選択してください✨

📘 **知識ベース限定回答システム**
• @わなみさん【質問】で知識ベースから正確な回答
• VTuber活動に特化した専門情報のみ回答

📖 **専門サポートメニュー**
下のボタンから選択して、より詳しいサポートを受けられます！`;

      // ✅ ここから「失敗ログ＋保険送信」を追加
      const buttons = createClassicButtons();
      console.log(`🔘 [EMPTY-MENTION] components rows = ${Array.isArray(buttons) ? buttons.length : 'not-array'}`);

      try {
        const botReply = await message.reply({
          content: welcomeMessage,
          components: buttons,
          allowedMentions: { repliedUser: false }
        });
        console.log(`✅ [EMPTY-MENTION] 空メンション応答送信完了 messageId=${botReply?.id || 'unknown'}`);
      } catch (error) {
        console.error('❌ [EMPTY-MENTION] 空メンション応答送信失敗:', error);
        console.error('❌ [EMPTY-MENTION] details:', {
          name: error?.name,
          message: error?.message,
          code: error?.code,
          status: error?.status,
          rawError: error?.rawError
        });

        // 🔥 保険：ボタン無しでも送る（ここすら出ないなら「送信自体が死んでる」）
        try {
          const fallback = await message.channel.send({
            content: '⚠️ ボタン付きメッセージの送信に失敗しました。まずはテキストで質問を送ってください。'
          });
          console.log(`✅ [EMPTY-MENTION] フォールバック送信成功 messageId=${fallback?.id || 'unknown'}`);
        } catch (e2) {
          console.error('❌ [EMPTY-MENTION] フォールバック送信も失敗:', e2);
          console.error('❌ [EMPTY-MENTION] fallback details:', {
            name: e2?.name,
            message: e2?.message,
            code: e2?.code,
            status: e2?.status,
            rawError: e2?.rawError
          });
        }
      }
      // ✅ 追加ここまで

      return; // ここで処理終了
    }

    console.log('✅ コンテンツ抽出成功 → AI回答処理へ');

    // === Typing Indicator 開始 ===
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

    // === 5. 待機状態チェック（状態タイプを取得） ===
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

    // === 8. RAGシステム呼び出し（待機状態に応じて分岐） ===
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧠 [AI] 応答生成開始（v15.5.14）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📝 質問: "${questionText}"`);
    console.log(`🖼️ 画像: ${imageUrls.length}件`);
    console.log(`🔍 待機状態: ${waitingType || 'なし'}`);

    let botReply, response;
    try {
      // 待機状態に応じて適切なRAGメソッドを呼び出し
      if (waitingType && waitingType.includes('mission')) {
        // ミッション提出処理
        console.log('🎯 [AI] ミッション提出処理開始:', waitingType);
        console.log('🔄 [RAG] generateMissionResponse 呼び出し中...');
        console.log(`📝 [DEBUG] 引数1 questionText: "${questionText}"`);
        console.log(`🖼️ [DEBUG] 引数2 imageUrls: ${imageUrls.length}件`);
        
        response = await RAGSystem.generateMissionResponse(
          questionText,     // ← ユーザーの質問内容
          imageUrls,        // ← 画像URL配列
          {
            missionType: waitingType,
            buttonContext: waitingType
          }
        );
        
        // 待機状態をクリア
        clearWaitingQuestion(message.author.id, interactionStates);
        console.log('✅ [AI] ミッション応答生成完了 & 待機状態クリア');
        
      } else {
        // 通常の質問応答
        console.log('💬 [AI] 通常の質問応答処理');
        
        // YouTube URL検出とチャンネル分析（youtube_planningボタンを押したときのみ）
        const youtubeUrl = extractYouTubeUrl(questionText);
        let youtubeContext = null;
        
        if (youtubeUrl && waitingType === 'youtube_planning') {
          console.log('📺 [YOUTUBE] チャンネル分析開始（YouTube企画相談モード）...');
          try {
            // YouTube API初期化
            if (!youtubeAnalyzer.initialized) {
              youtubeAnalyzer.initialize();
            }
            
            // チャンネル分析実行
            const analysis = await youtubeAnalyzer.analyzeChannel(youtubeUrl);
            
            if (analysis.success) {
              console.log(`✅ [YOUTUBE] 分析成功: ${analysis.channel.name}`);
              youtubeContext = youtubeAnalyzer.buildPlanningContext(analysis, questionText);
              console.log('📊 [YOUTUBE] 企画提案用コンテキストを生成しました');
            } else {
              console.warn(`⚠️ [YOUTUBE] 分析失敗: ${analysis.error}`);
              // エラーメッセージをユーザーに通知
              await message.reply(`⚠️ ${analysis.error}`);
              stopTypingIndicator(typingInterval);
              return;
            }
          } catch (ytError) {
            console.error('❌ [YOUTUBE] チャンネル分析エラー:', ytError.message);
            await message.reply('⚠️ YouTubeチャンネルの分析中にエラーが発生しました。URLをご確認ください。');
            stopTypingIndicator(typingInterval);
            return;
          }
        } else if (youtubeUrl && waitingType !== 'youtube_planning') {
          console.log('⚠️ [YOUTUBE] YouTube URLが検出されましたが、YouTube企画相談ボタンを押していないためスキップします');
        }
        
        console.log('🔄 [RAG] generateKnowledgeOnlyResponse 呼び出し中...');
        
        // youtubeContextがあれば追加情報として渡す
        const context = {
          imageUrls: imageUrls,
          youtubeContext: youtubeContext
        };
        
        response = await RAGSystem.generateKnowledgeOnlyResponse(
          questionText,
          context
        );
        
        console.log('✅ [AI] 通常応答生成完了');
      }

      console.log(`📊 [RAG] 応答長: ${response?.length || 0}文字`);

      // Typing Indicator 停止
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
    console.log('✅ [MENTION] メンション処理完了 v15.5.14');
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
  console.log('🔔 [MENTION+LOG] メンションハンドラー起動 v15.5.14（Q&A記録版）');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let typingInterval = null;
  const startTime = Date.now(); // ✅ 処理時間計測開始

  try {
    // =====================================
    // 🛡️ 【最優先】無限ループ対策 + @everyone除外
    // =====================================
    
    // 1. Botメッセージを完全に無視
    if (message.author.bot) {
      console.log('🤖 [LOOP PREVENTION] Botメッセージ検出 → スキップ');
      return;
    }
    
    // 2. システムメッセージを無視
    if (message.system) {
      console.log('⚙️ [LOOP PREVENTION] システムメッセージ検出 → スキップ');
      return;
    }
    
    // 3. Webhookメッセージを無視
    if (message.webhookId) {
      console.log('🔗 [LOOP PREVENTION] Webhookメッセージ検出 → スキップ');
      return;
    }
    
    // 4. 自分自身のIDを再確認（二重チェック）
    if (message.author.id === client.user.id) {
      console.log('⚠️ [LOOP PREVENTION] 自分自身のメッセージ検出 → スキップ');
      return;
    }

    // 5. @everyone / @here メンションを除外
    if (message.mentions.everyone) {
      console.log('🔕 [@EVERYONE] @everyone/@here メンション検出 → スキップ');
      console.log(`   送信者: ${message.author.username} (ID: ${message.author.id})`);
      return;
    }

    // === 1. メンション検出 ===
    const botMentioned = message.mentions.has(client.user.id);
    console.log(`👤 送信者: ${message.author.tag} (ID: ${message.author.id}, Bot: ${message.author.bot})`);
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

    // === 空メンション時の特別処理（クラシックスタイル） ===
    if (!questionText) {
      console.log('✨ 質問内容が空 → クラシックスタイルのボタンを表示');

      const welcomeMessage = `🤖 **わなみさんです！**

どのようなご相談でしょうか？下のボタンから選択してください✨

📘 **知識ベース限定回答システム**
• @わなみさん【質問】で知識ベースから正確な回答
• VTuber活動に特化した専門情報のみ回答

📖 **専門サポートメニュー**
下のボタンから選択して、より詳しいサポートを受けられます！`;

      // ✅ ここから「失敗ログ＋保険送信」を追加
      const buttons = createClassicButtons();
      console.log(`🔘 [EMPTY-MENTION] components rows = ${Array.isArray(buttons) ? buttons.length : 'not-array'}`);

      try {
        const botReply = await message.reply({
          content: welcomeMessage,
          components: buttons,
          allowedMentions: { repliedUser: false }
        });
        console.log(`✅ [EMPTY-MENTION] 空メンション応答送信完了 messageId=${botReply?.id || 'unknown'}`);
      } catch (error) {
        console.error('❌ [EMPTY-MENTION] 空メンション応答送信失敗:', error);
        console.error('❌ [EMPTY-MENTION] details:', {
          name: error?.name,
          message: error?.message,
          code: error?.code,
          status: error?.status,
          rawError: error?.rawError
        });

        // 🔥 保険：ボタン無しでも送る
        try {
          const fallback = await message.channel.send({
            content: '⚠️ ボタン付きメッセージの送信に失敗しました。まずはテキストで質問を送ってください。'
          });
          console.log(`✅ [EMPTY-MENTION] フォールバック送信成功 messageId=${fallback?.id || 'unknown'}`);
        } catch (e2) {
          console.error('❌ [EMPTY-MENTION] フォールバック送信も失敗:', e2);
          console.error('❌ [EMPTY-MENTION] fallback details:', {
            name: e2?.name,
            message: e2?.message,
            code: e2?.code,
            status: e2?.status,
            rawError: e2?.rawError
          });
        }
      }
      // ✅ 追加ここまで

      return; // ここで処理終了
    }

    console.log('✅ コンテンツ抽出成功 → AI回答処理へ');

    // === Typing Indicator 開始 ===
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

    // === 5. 待機状態チェック（状態タイプを取得） ===
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

    // === 🎁 隠しキーワード検出 ===
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 [HIDDEN] 隠しキーワードチェック開始');
    console.log(`📝 [HIDDEN] 検査対象テキスト: "${questionText}"`);
    console.log(`🎯 [HIDDEN] コンテキスト: ${waitingType || 'なし'}`);
    
    const hiddenKeywordResult = checkHiddenKeyword(questionText, waitingType);
    
    console.log(`🔎 [HIDDEN] チェック結果: ${hiddenKeywordResult ? 'キーワード検出！' : 'なし'}`);
    
    if (hiddenKeywordResult) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🎉 [HIDDEN] ✨ 隠しキーワード発見！ ✨`);
      console.log(`🔑 [HIDDEN] キーワード: "${hiddenKeywordResult.keyword}"`);
      console.log(`📤 [HIDDEN] 固定レスポンスを返します`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Typing Indicator を停止
      stopTypingIndicator(typingInterval);
      
      // 待機状態をクリア
      clearWaitingQuestion(message.author.id, interactionStates);
      
      // 固定レスポンスを送信
      await message.reply(hiddenKeywordResult.response);
      
      console.log('✅ [HIDDEN] 隠しキーワード応答送信完了 → 処理終了');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return; // ← 🚨 ここで処理を完全に終了
    }
    
    console.log('✅ [HIDDEN] 隠しキーワードなし → 通常処理続行');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // === 7. RAGシステム呼び出し（待機状態に応じて分岐） ===
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧠 [AI] 応答生成開始（Q&A記録版 v15.5.14）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📝 質問: "${questionText}"`);
    console.log(`🖼️ 画像: ${imageUrls.length}件`);
    console.log(`🔍 待機状態: ${waitingType || 'なし'}`);

    let botReply, responseText;
    try {
      // 待機状態に応じて適切なRAGメソッドを呼び出し
      if (waitingType && waitingType.includes('mission')) {
        // ミッション提出処理
        console.log('🎯 [AI] ミッション提出処理開始:', waitingType);
        console.log('🔄 [RAG] generateMissionResponse 呼び出し中...');
        console.log(`📝 [DEBUG] 引数1 questionText: "${questionText}"`);
        console.log(`🖼️ [DEBUG] 引数2 imageUrls: ${imageUrls.length}件`);
        
        responseText = await RAGSystem.generateMissionResponse(
          questionText,     // ← ユーザーの質問内容
          imageUrls,        // ← 画像URL配列
          {
            missionType: waitingType,
            buttonContext: waitingType
          }
        );
        
        // 待機状態をクリア
        clearWaitingQuestion(message.author.id, interactionStates);
        console.log('✅ [AI] ミッション応答生成完了 & 待機状態クリア');
        
      } else {
        // 通常の質問応答
        console.log('💬 [AI] 通常の質問応答処理');
        
        // YouTube URL検出とチャンネル分析（youtube_planningボタンを押したときのみ）
        const youtubeUrl = extractYouTubeUrl(questionText);
        let youtubeContext = null;
        
        if (youtubeUrl && waitingType === 'youtube_planning') {
          console.log('📺 [YOUTUBE] チャンネル分析開始（YouTube企画相談モード）...');
          try {
            // YouTube API初期化
            if (!youtubeAnalyzer.initialized) {
              youtubeAnalyzer.initialize();
            }
            
            // チャンネル分析実行
            const analysis = await youtubeAnalyzer.analyzeChannel(youtubeUrl);
            
            if (analysis.success) {
              console.log(`✅ [YOUTUBE] 分析成功: ${analysis.channel.name}`);
              youtubeContext = youtubeAnalyzer.buildPlanningContext(analysis, questionText);
              console.log('📊 [YOUTUBE] 企画提案用コンテキストを生成しました');
            } else {
              console.warn(`⚠️ [YOUTUBE] 分析失敗: ${analysis.error}`);
              // エラーメッセージをユーザーに通知
              await message.reply(`⚠️ ${analysis.error}`);
              stopTypingIndicator(typingInterval);
              return;
            }
          } catch (ytError) {
            console.error('❌ [YOUTUBE] チャンネル分析エラー:', ytError.message);
            await message.reply('⚠️ YouTubeチャンネルの分析中にエラーが発生しました。URLをご確認ください。');
            stopTypingIndicator(typingInterval);
            return;
          }
        } else if (youtubeUrl && waitingType !== 'youtube_planning') {
          console.log('⚠️ [YOUTUBE] YouTube URLが検出されましたが、YouTube企画相談ボタンを押していないためスキップします');
        }
        
        console.log('🔄 [RAG] generateKnowledgeOnlyResponse 呼び出し中...');
        console.log(`🖼️ [DEBUG] 画像を含むcontextを渡します: ${imageUrls.length}件`);
        
        // 🎯 企画相談ボタンのフィルタ情報を取得
        let filterOptions = {};
        if (waitingType === 'x_planning') {
          filterOptions = {
            filterCategory: 'X',
            filterKeyword: '企画'
          };
          console.log(`🎯 [FILTER] Xの企画相談: カテゴリ="X", キーワード="企画"`);
        } else if (waitingType === 'youtube_planning') {
          filterOptions = {
            filterCategory: '配信',
            filterKeyword: '企画'
          };
          console.log(`🎯 [FILTER] YouTubeの企画相談: カテゴリ="配信", キーワード="企画"`);
        }
        
        responseText = await RAGSystem.generateKnowledgeOnlyResponse(
          questionText,
          {
            imageUrls: imageUrls,  // ← 画像URLを context として渡す
            youtubeContext: youtubeContext, // ← YouTube企画提案コンテキスト
            ...filterOptions       // ← フィルタオプションを展開
          }
        );
        
        console.log('✅ [AI] 通常応答生成完了');
      }

      console.log(`📊 [RAG] 応答長: ${responseText?.length || 0}文字`);

      // Typing Indicator 停止
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

    // ✅ 処理時間計測終了
    const processingTime = Date.now() - startTime;

    // === 9. Q&A記録 ===
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 [QA-LOG] Q&A記録開始');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      if (qaLoggerService && typeof qaLoggerService.logQA === 'function') {
        // ✅ 修正版: フィールド名を qa-logger.js に合わせる
        const qaData = {
          userId: message.author.id,
          username: message.author.tag,
          channelName: message.channel.name || 'DM',
          channelId: message.channel.id,
          guildName: message.guild?.name || 'DM',
          guildId: message.guild?.id || '',              // ✅ 追加
          question: questionText,
          response: responseText,
          responseLength: responseText.length,
          processingTime: processingTime,
          questionType: waitingType || '通常質問',
          responseStatus: '成功',                        // ✅ 追加
          hasImage: imageUrls.length > 0,
          messageId: message.id
        };
        
        console.log('📊 [DEBUG] Q&A記録データ:');
        console.log(`  ユーザー: ${qaData.username}`);
        console.log(`  チャンネル: ${qaData.channelName}`);
        console.log(`  サーバー: ${qaData.guildName} (${qaData.guildId})`);
        console.log(`  質問長: ${qaData.question.length}文字`);
        console.log(`  回答長: ${qaData.responseLength}文字`);
        console.log(`  処理時間: ${qaData.processingTime}ms`);
        console.log(`  質問タイプ: ${qaData.questionType}`);
        console.log(`  回答ステータス: ${qaData.responseStatus}`);
        
        await qaLoggerService.logQA(qaData);
        console.log('✅ [QA-LOG] 記録完了');
      } else {
        console.log('⚠️ [QA-LOG] スキップ（qaLoggerService未初期化）');
      }
    } catch (logError) {
      console.error('⚠️ [QA-LOG] 記録失敗（処理は続行）:', logError);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

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
    console.log('✅ [MENTION+LOG] メンション処理完了 v15.5.14');
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
