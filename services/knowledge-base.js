// services/knowledge-base.js - 知識ベース構築サービス v2.6.0（G列完全一致強化版）

const { googleAPIsService, detectUrlType, loadGoogleSlides, loadGoogleDocs, loadTextFile, convertGoogleDriveUrl } = require('./google-apis');
const { KNOWLEDGE_SPREADSHEET_ID } = require('../config/constants');
const { loadNotionContent, loadWebsiteContent, loadImageUrlInfo } = require('../utils/content-loaders');
const logger = require('../utils/logger');

class KnowledgeBaseService {
  constructor() {
    this.documentImages = [];
    this.documents = [];
    this.lastBuildTime = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      console.log('📚 知識ベースサービス初期化開始...');
      
      const result = await this.buildKnowledgeBase();
      
      if (result) {
        this.isInitialized = true;
        logger.info('✅ 知識ベースサービス初期化完了');
        logger.info(`📊 初期化後の文書数: ${this.documents.length}`);
        
        // 🔍 デバッグ: レッスン14が知識ベースに存在するか確認
        const lesson14 = this.documents.find(doc => doc.source && doc.source.includes('レッスン14'));
        if (lesson14) {
          console.log('\n✅ ===== レッスン14が知識ベースに存在 =====');
          console.log('📄 ファイル名:', lesson14.source);
          console.log('📏 コンテンツ文字数:', lesson14.content.length);
          console.log('🏷️ 備考:', lesson14.remarks);
          console.log('📂 カテゴリ:', lesson14.category);
          console.log('📝 コンテンツの最初の500文字:\n', lesson14.content.substring(0, 500));
          console.log('===== レッスン14確認完了 =====\n');
        } else {
          console.log('\n❌ レッスン14が知識ベースに見つかりません！');
        }
        
        return result;
      } else {
        console.log('⚠️ 知識ベース構築に失敗しましたが、サービスは初期化されました');
        this.isInitialized = true;
        return null;
      }
    } catch (error) {
      console.error('❌ 知識ベースサービス初期化エラー:', error.message);
      this.isInitialized = false;
      throw error;
    }
  }

  async buildKnowledgeBase() {
    try {
      console.log('📚 知識ベース構築開始...');
      
      this.documentImages = [];
      this.documents = [];
      
      const urlList = await googleAPIsService.loadUrlListFromSpreadsheet(KNOWLEDGE_SPREADSHEET_ID);
      if (urlList.length === 0) {
        console.log('❌ スプレッドシートにURLが見つかりません');
        return null;
      }

      console.log(`📄 ${urlList.length}件のコンテンツを読み込み開始`);

      const documents = [];
      let totalImages = 0;

      for (const urlInfo of urlList) {
        // 🔍 デバッグ: レッスン14の処理を詳細にログ出力
        const isLesson14 = urlInfo.fileName && urlInfo.fileName.includes('レッスン14');
        
        if (isLesson14) {
          console.log('\n🎯 ===== レッスン14の処理開始 =====');
          console.log('📄 ファイル名:', urlInfo.fileName);
          console.log('🔗 URL:', urlInfo.url);
          console.log('📂 分類:', urlInfo.classification);
          console.log('📋 種類:', urlInfo.type);
          console.log('🏷️ カテゴリ:', urlInfo.category);
          console.log('🏷️ 備考:', urlInfo.remarks);
        } else {
          console.log(`📖 読み込み中: ${urlInfo.fileName}`);
        }
        
        try {
          const result = await this.loadContentFromUrl(urlInfo);
          
          if (result) {
            const doc = {
              source: urlInfo.fileName,
              url: urlInfo.url,
              classification: urlInfo.classification || '',
              type: urlInfo.type || '',
              category: urlInfo.category || '',
              goodBadExample: urlInfo.goodBadExample || '',
              remarks: urlInfo.remarks || '',
              content: result.content,
              images: result.images || [],
              metadata: {
                classification: urlInfo.classification || '',
                type: urlInfo.type || '',
                category: urlInfo.category || '',
                goodBadExample: urlInfo.goodBadExample || '',
                remarks: urlInfo.remarks || ''
              }
            };
            
            documents.push(doc);

            // 🔍 デバッグ: レッスン14の読み込み完了ログ
            if (isLesson14) {
              console.log('✅ レッスン14の読み込み完了');
              console.log('📏 コンテンツ文字数:', result.content.length);
              console.log('📝 コンテンツの最初の500文字:\n', result.content.substring(0, 500));
              console.log('📝 コンテンツの最後の500文字:\n', result.content.substring(result.content.length - 500));
              console.log('✅ レッスン14を知識ベースに追加しました');
              console.log('===== レッスン14の処理完了 =====\n');
            }

            if (result.images && result.images.length > 0) {
              this.documentImages.push(...result.images);
              totalImages += result.images.length;
            }
          }
        } catch (error) {
          console.error(`❌ ${urlInfo.fileName} 読み込み失敗:`, error.message);
          documents.push({
            source: urlInfo.fileName,
            url: urlInfo.url,
            classification: urlInfo.classification || '',
            type: 'error',
            category: urlInfo.category || '',
            goodBadExample: urlInfo.goodBadExample || '',
            remarks: urlInfo.remarks || '',
            content: `${urlInfo.fileName}: 読み込みエラー - ${error.message}`,
            images: [],
            metadata: {
              classification: urlInfo.classification || '',
              type: 'error',
              category: urlInfo.category || '',
              goodBadExample: urlInfo.goodBadExample || '',
              remarks: urlInfo.remarks || ''
            }
          });
        }
        
        await this.sleep(200);
      }

      this.documents = documents;
      this.lastBuildTime = new Date().toISOString();

      console.log(`✅ 知識ベース構築完了`);
      console.log(`📄 文書数: ${documents.length}`);
      console.log(`🖼️ 総画像数: ${totalImages}`);
      console.log(`📊 総文字数: ${documents.reduce((sum, doc) => sum + doc.content.length, 0)}`);

      const classificationCounts = documents.reduce((acc, doc) => {
        const cls = doc.classification || '未分類';
        acc[cls] = (acc[cls] || 0) + 1;
        return acc;
      }, {});
      console.log('📊 分類別集計:', classificationCounts);

      return documents;

    } catch (error) {
      console.error('❌ 知識ベース構築エラー:', error);
      return null;
    }
  }

  _tokenizeQuery(query) {
    const tokens = [];
    
    const alphanumericWords = query.match(/[a-zA-Z0-9]+/g) || [];
    tokens.push(...alphanumericWords);
    
    const hiragana = query.match(/[ぁ-ん]{2,}/g) || [];
    const katakana = query.match(/[ァ-ヴ]{2,}/g) || [];
    const kanji = query.match(/[一-龯]{2,}/g) || [];
    
    tokens.push(...hiragana, ...katakana, ...kanji);
    
    const singleChars = query.match(/[ァ-ヴA-Z]/g) || [];
    tokens.push(...singleChars);
    
    const uniqueTokens = [...new Set(tokens.map(t => t.toLowerCase()))];
    
    return uniqueTokens;
  }

  /**
   * ✨ Phase 12: G列完全一致判定を強化
   * N-gram分解の前に、G列キーワードと検索クエリを直接比較
   * 
   * @param {string} remarks - G列（備考）の内容
   * @param {string} query - 検索クエリ
   * @returns {Object} { matched: boolean, matchedKeywords: string[] }
   */
  _checkExactRemarksMatch(remarks, query) {
    if (!remarks || !query) {
      return { matched: false, matchedKeywords: [] };
    }

    const remarksLower = remarks.toLowerCase();
    const queryLower = query.toLowerCase();
    const matchedKeywords = [];

    // G列に複数のキーワードがカンマ区切りで含まれている可能性を考慮
    // 例: "初配信の企画、誰に向けての配信か、3H、HERO、HUB、HELP"
    const remarksKeywords = remarks.split(/[,、]/).map(k => k.trim()).filter(k => k.length > 0);

    for (const keyword of remarksKeywords) {
      const keywordLower = keyword.toLowerCase();
      
      // 完全一致チェック（検索クエリにG列のキーワードが含まれているか）
      if (queryLower.includes(keywordLower)) {
        matchedKeywords.push(keyword);
      }
    }

    return {
      matched: matchedKeywords.length > 0,
      matchedKeywords: matchedKeywords
    };
  }

  searchKnowledge(query, options = {}) {
    try {
      const {
        maxResults = 5,
        minScore = 0.05,
        topK = 5,
        includeMetadata = true,
        filters = {}
      } = options;

      // 🔍 デバッグ: テスト配信クエリの場合
      const isTestStreamQuery = query.includes('テスト配信');
      if (isTestStreamQuery) {
        console.log('\n🔍 ===== 検索デバッグ開始（テスト配信） =====');
        console.log('🔑 検索クエリ:', query);
      }

      logger.info(`🔍 知識ベース検索: "${query}"`);
      logger.info(`📊 検索オプション: maxResults=${maxResults}, minScore=${minScore}, includeMetadata=${includeMetadata}`);
      logger.info(`📊 検索前の状態: 初期化=${this.isInitialized}, 文書数=${this.documents.length}`);

      if (!this.isInitialized || this.documents.length === 0) {
        logger.warn('⚠️ 知識ベースが初期化されていないか、文書が空です');
        logger.warn(`詳細: isInitialized=${this.isInitialized}, documents.length=${this.documents.length}`);
        return [];
      }

      const queryTokens = this._tokenizeQuery(query);
      logger.info(`🔑 検索キーワード (${queryTokens.length}個): ${queryTokens.join(', ')}`);

      const queryLower = query.toLowerCase();

      let filteredDocuments = this.documents;
      
      if (filters.classification) {
        filteredDocuments = filteredDocuments.filter(doc => 
          doc.classification === filters.classification
        );
        logger.info(`🔍 分類フィルタ適用: ${filters.classification} (${filteredDocuments.length}件)`);
      }

      if (filters.goodBadExample) {
        filteredDocuments = filteredDocuments.filter(doc => 
          doc.goodBadExample === filters.goodBadExample
        );
        logger.info(`🔍 良い例/悪い例フィルタ適用: ${filters.goodBadExample} (${filteredDocuments.length}件)`);
      }

      if (filters.category) {
        filteredDocuments = filteredDocuments.filter(doc => 
          doc.category === filters.category
        );
        logger.info(`🔍 カテゴリフィルタ適用: ${filters.category} (${filteredDocuments.length}件)`);
      }

      const scoredDocuments = filteredDocuments.map(doc => {
        const contentLower = doc.content.toLowerCase();
        let score = 0;
        let matchDetails = [];

        // 🔍 デバッグ: レッスン14のスコア計算を詳細表示
        const isLesson14 = doc.source && doc.source.includes('レッスン14');

        // ✨ Phase 12: G列完全一致の事前チェック（N-gram分解の影響を受けない）
        // この判定をスコア計算の最初に実行することで、N-gramトークン化の前に完全一致を検出
        const remarksMatch = this._checkExactRemarksMatch(doc.remarks, query);
        if (remarksMatch.matched) {
          // 完全一致したキーワードごとに+5.0のボーナス
          const exactMatchBonus = remarksMatch.matchedKeywords.length * 5.0;
          score += exactMatchBonus;
          matchDetails.push(`🎯G列完全一致(${remarksMatch.matchedKeywords.join(', ')})+${exactMatchBonus.toFixed(1)}`);
          
          logger.info(`  🎯 ${doc.source}: G列完全一致「${remarksMatch.matchedKeywords.join(', ')}」 +${exactMatchBonus.toFixed(1)}`);
          
          if (isLesson14 && isTestStreamQuery) {
            console.log(`  📌 レッスン14: G列完全一致「${remarksMatch.matchedKeywords.join(', ')}」 +${exactMatchBonus.toFixed(1)}`);
          }
        }

        // トークンマッチング（既存のロジック）
        queryTokens.forEach(token => {
          const matches = (contentLower.match(new RegExp(token, 'gi')) || []).length;
          if (matches > 0) {
            const tokenScore = Math.min(matches * 0.05, 0.3);
            score += tokenScore;
            matchDetails.push(`"${token}":${matches}回(+${tokenScore.toFixed(2)})`);
            
            if (isLesson14 && isTestStreamQuery) {
              console.log(`  📌 レッスン14: トークン「${token}」${matches}回 +${tokenScore.toFixed(2)}`);
            }
          }
        });

        // 完全一致ボーナス
        if (contentLower.includes(queryLower)) {
          score += 0.5;
          matchDetails.push('完全一致+0.5');
          
          if (isLesson14 && isTestStreamQuery) {
            console.log(`  📌 レッスン14: 完全一致 +0.5`);
          }
        }

        // カテゴリ一致ボーナス
        if (doc.category) {
          const categoryLower = doc.category.toLowerCase();
          if (queryLower.includes(categoryLower) || categoryLower.includes(queryLower)) {
            score += 0.3;
            matchDetails.push('カテゴリ一致+0.3');
            
            if (isLesson14 && isTestStreamQuery) {
              console.log(`  📌 レッスン14: カテゴリ一致 +0.3`);
            }
          }
        }

        // 分類一致ボーナス
        if (doc.classification) {
          const classificationLower = doc.classification.toLowerCase();
          if (queryLower.includes(classificationLower) || classificationLower.includes(queryLower)) {
            score += 0.4;
            matchDetails.push('分類一致+0.4');
            
            if (isLesson14 && isTestStreamQuery) {
              console.log(`  📌 レッスン14: 分類一致 +0.4`);
            }
          }
        }

        // ファイル名一致ボーナス
        const sourceLower = doc.source.toLowerCase();
        queryTokens.forEach(token => {
          if (sourceLower.includes(token)) {
            score += 0.2;
            matchDetails.push(`ファイル名一致("${token}")+0.2`);
            
            if (isLesson14 && isTestStreamQuery) {
              console.log(`  📌 レッスン14: ファイル名一致「${token}」 +0.2`);
            }
          }
        });

        // ✅ 備考欄（G列）のキーワードマッチングを最優先（既存のロジック）
        if (doc.remarks) {
          const remarksLower = doc.remarks.toLowerCase();
          
          // クエリ全体が備考に含まれる場合、超強力なボーナス
          if (remarksLower.includes(queryLower)) {
            score += 3.0;
            matchDetails.push('備考完全一致+3.0');
            
            if (isLesson14 && isTestStreamQuery) {
              console.log(`  📌 レッスン14: 備考完全一致 +3.0`);
            }
          }
          
          // 個別トークンマッチング
          queryTokens.forEach(token => {
            if (remarksLower.includes(token)) {
              score += 1.0;
              matchDetails.push(`備考一致("${token}")+1.0`);
              
              if (isLesson14 && isTestStreamQuery) {
                console.log(`  📌 レッスン14: 備考一致「${token}」 +1.0`);
              }
            }
          });
        }

        if (isLesson14 && isTestStreamQuery) {
          console.log(`  🎯 レッスン14の合計スコア: ${score.toFixed(3)}`);
        }

        return {
          ...doc,
          score: score,
          rawScore: score,
          similarity: score,
          title: doc.source,
          answer: this._extractRelevantContent(doc.content, queryTokens),
          matchDetails: matchDetails,
          metadata: includeMetadata ? {
            source: doc.source,
            classification: doc.classification,
            category: doc.category,
            type: doc.type,
            goodBadExample: doc.goodBadExample,
            remarks: doc.remarks,
            url: doc.url
          } : undefined
        };
      });

      // スコアでソート（降順）
      scoredDocuments.sort((a, b) => b.score - a.score);

      logger.info('\n📊 ===== スコア計算詳細（上位10件） =====');
      scoredDocuments.slice(0, 10).forEach((doc, i) => {
        const details = doc.matchDetails.length > 0 ? doc.matchDetails.join(', ') : 'マッチなし';
        logger.info(`[${i + 1}] ${doc.source} [${doc.classification}/${doc.goodBadExample}]`);
        logger.info(`    スコア: ${doc.score.toFixed(3)} (上限なし)`);
        logger.info(`    マッチ詳細: ${details}`);
      });
      logger.info('==========================================\n');

      // テスト配信クエリの場合、検索結果詳細を表示
      if (isTestStreamQuery) {
        console.log('\n📊 検索結果トップ5:');
        scoredDocuments.slice(0, 5).forEach((doc, index) => {
          console.log(`  [${index + 1}] ${doc.source} - スコア: ${doc.score.toFixed(3)}`);
          if (doc.source.includes('レッスン14')) {
            console.log(`    🎯 レッスン14の詳細:`);
            console.log(`      - 備考: ${doc.remarks}`);
            console.log(`      - カテゴリ: ${doc.category}`);
            console.log(`      - コンテンツ文字数: ${doc.content.length}`);
            console.log(`      - コンテンツの最初の300文字:\n${doc.content.substring(0, 300)}`);
          }
        });
        console.log('===== 検索デバッグ終了 =====\n');
      }

      // minScoreでフィルタリング
      const results = scoredDocuments
        .filter(doc => doc.score >= minScore)
        .slice(0, Math.max(maxResults, topK));

      logger.info(`✅ 検索完了: ${results.length}件ヒット (最高スコア: ${results[0]?.score.toFixed(3) || 0})`);

      if (results.length > 0) {
        logger.info('🔍 検索結果のメタデータサンプル（最初の3件）:');
        results.slice(0, 3).forEach((result, idx) => {
          logger.info(`  ${idx + 1}. [${result.metadata?.classification || 'なし'}/${result.metadata?.goodBadExample || 'なし'}] ${result.source}`);
          logger.info(`     スコア: ${result.score.toFixed(3)}, メタデータ:`, JSON.stringify(result.metadata, null, 2));
        });
      }
      
      if (results.length === 0 && scoredDocuments.length > 0) {
        logger.warn(`⚠️ minScore=${minScore}でフィルタリングされました。最高スコア: ${scoredDocuments[0].score.toFixed(3)}`);
        logger.warn(`💡 ヒント: minScoreを下げるか、より関連性の高いキーワードで検索してください`);
      }

      return results;

    } catch (error) {
      logger.error('❌ 知識ベース検索エラー:', error);
      return [];
    }
  }

  _extractRelevantContent(content, keywords) {
    const maxLength = 2000;
    const contentLower = content.toLowerCase();

    let firstMatchIndex = -1;
    for (const keyword of keywords) {
      const index = contentLower.indexOf(keyword.toLowerCase());
      if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
        firstMatchIndex = index;
      }
    }

    if (firstMatchIndex !== -1) {
      const start = Math.max(0, firstMatchIndex - 100);
      const end = Math.min(content.length, firstMatchIndex + maxLength - 100);
      const excerpt = content.substring(start, end);
      
      return (start > 0 ? '...' : '') + excerpt + (end < content.length ? '...' : '');
    }

    return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
  }

  async loadContentFromUrl(urlInfo) {
    const { url, fileName, category, type } = urlInfo;
    
    let detectedType = detectUrlType(url);
    
    const isLesson14 = fileName && fileName.includes('レッスン14');
    
    if (isLesson14) {
      console.log(`🔍 レッスン14のコンテンツ読み込み開始`);
      console.log(`🔍 スプレッドシートのタイプ: "${type}" → 自動検出: "${detectedType}"`);
    } else {
      console.log(`📖 コンテンツ読み込み開始: ${fileName}`);
      console.log(`🔍 スプレッドシートのタイプ: "${type}" → 自動検出: "${detectedType}"`);
    }
    
    // スプレッドシートのD列（type）が "テキスト" の場合、Google Driveをテキストファイルとして扱う
    if (detectedType === 'google_drive_file') {
      const typeLower = (type || '').toLowerCase();
      
      if (typeLower.includes('テキスト') || typeLower.includes('text') || typeLower.includes('txt')) {
        if (isLesson14) {
          console.log(`📝 レッスン14をテキストとして処理`);
        } else {
          console.log(`📝 Google Driveファイルをテキストとして処理: ${fileName}`);
        }
        detectedType = 'text_file';
        
        // Google Drive URLをダウンロードURLに変換
        const downloadUrl = convertGoogleDriveUrl(url);
        urlInfo.url = downloadUrl;
        
        if (isLesson14) {
          console.log(`✅ レッスン14のダウンロードURL変換完了`);
        } else {
          console.log(`✅ ダウンロードURL変換完了`);
        }
      } else {
        console.log(`⚠️ Google Driveファイルですが、種類が不明です`);
        console.log(`💡 ヒント: スプレッドシートのD列に "テキスト" を指定してください`);
      }
    }
    
    try {
      switch (detectedType) {
        case 'google_slides':
          console.log(`📊 Google Slides読み込み: ${fileName}`);
          return await loadGoogleSlides(url, fileName);
          
        case 'google_docs':
          console.log(`📄 Google Docs読み込み: ${fileName}`);
          return await loadGoogleDocs(url, fileName);
          
        case 'notion':
          console.log(`📝 Notion読み込み: ${fileName}`);
          const notionContent = await loadNotionContent(url, fileName);
          return { content: notionContent, images: this.extractImagesFromNotionContent(notionContent, fileName) };
          
        case 'text_file':
          if (isLesson14) {
            console.log(`📝 レッスン14のテキストファイル読み込み開始`);
          } else {
            console.log(`📝 テキストファイル読み込み: ${fileName}`);
          }
          const textResult = await loadTextFile(urlInfo.url, fileName);
          
          if (isLesson14) {
            console.log(`✅ レッスン14のテキスト読み込み完了`);
            console.log(`📏 文字数: ${textResult.content.length}`);
          }
          
          return textResult;
          
        case 'image':
          console.log(`🖼️ 画像読み込み: ${fileName}`);
          const imageContent = await loadImageUrlInfo(url, fileName);
          return { content: imageContent, images: this.extractDirectImageInfo(url, fileName) };
          
        case 'google_drive_file':
          console.log(`📁 Google Driveファイル読み込み（種類不明）: ${fileName}`);
          console.log(`⚠️ スプレッドシートのD列に "テキスト" などの種類を指定してください`);
          return { 
            content: `${fileName}: Google Driveファイルですが、種類が不明です。スプレッドシートのD列（種類）に "テキスト" を指定してください。`,
            images: [] 
          };
          
        case 'website':
          console.log(`🌐 ウェブサイト読み込み: ${fileName}`);
          const websiteContent = await loadWebsiteContent(url, fileName);
          return { content: websiteContent, images: this.extractImagesFromWebContent(websiteContent, fileName) };
          
        default:
          console.log(`❓ 未対応のURL形式: ${fileName}`);
          return { 
            content: `${fileName}: 未対応のURL形式 - ${url}`,
            images: [] 
          };
      }
    } catch (error) {
      console.error(`❌ コンテンツ読み込み失敗 ${fileName}:`, error.message);
      throw error;
    }
  }

  extractImagesFromNotionContent(content, fileName) {
    const images = [];
    const imageMatches = content.match(/\[🖼️ 画像: ([^\]]+)\]/g);
    
    if (imageMatches) {
      imageMatches.forEach((match, index) => {
        images.push({
          source: 'notion',
          fileName: fileName,
          position: index + 1,
          description: match.replace(/\[🖼️ 画像: ([^\]]+)\]/, '$1'),
          type: 'embedded_image'
        });
      });
    }
    
    return images;
  }

  extractDirectImageInfo(url, fileName) {
    return [{
      source: 'direct_url',
      fileName: fileName,
      url: url,
      description: `${fileName} - 直接画像URL`,
      type: 'direct_image'
    }];
  }

  extractImagesFromWebContent(content, fileName) {
    const images = [];
    const imageMatches = content.match(/\[🖼️ 画像: ([^\]]+)\]/g);
    
    if (imageMatches) {
      imageMatches.forEach((match, index) => {
        images.push({
          source: 'website',
          fileName: fileName,
          position: index + 1,
          description: match.replace(/\[🖼️ 画像: ([^\]]+)\]/, '$1'),
          type: 'embedded_image'
        });
      });
    }
    
    return images;
  }

  getDocumentImages() {
    return this.documentImages;
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      totalDocuments: this.documents.length,
      totalDocumentImages: this.documentImages.length,
      lastBuildTime: this.lastBuildTime,
      imagesBySource: this.documentImages.reduce((acc, img) => {
        acc[img.source] = (acc[img.source] || 0) + 1;
        return acc;
      }, {})
    };
  }

  getStats() {
    return {
      totalDocuments: this.documents.length,
      totalDocumentImages: this.documentImages.length,
      lastBuildTime: this.lastBuildTime,
      imagesBySource: this.documentImages.reduce((acc, img) => {
        acc[img.source] = (acc[img.source] || 0) + 1;
        return acc;
      }, {})
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  reset() {
    this.documents = [];
    this.documentImages = [];
    this.lastBuildTime = null;
    this.isInitialized = false;
    console.log('🔄 知識ベースサービスリセット完了');
  }
}

const knowledgeBaseService = new KnowledgeBaseService();

module.exports = {
  knowledgeBaseService,
  buildKnowledgeBase: () => knowledgeBaseService.buildKnowledgeBase(),
  initialize: () => knowledgeBaseService.initialize(),
  initializeKnowledgeBase: () => knowledgeBaseService.initialize(),
  searchKnowledge: (query, options) => knowledgeBaseService.searchKnowledge(query, options),
  getDocumentImages: () => knowledgeBaseService.getDocumentImages(),
  getStats: () => knowledgeBaseService.getStats(),
  getStatus: () => knowledgeBaseService.getStatus(),
  reset: () => knowledgeBaseService.reset(),
  default: knowledgeBaseService
};
