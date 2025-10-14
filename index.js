// VTuber育成スクール用Discord自動応答チャットボット - 完全機能版 v15.3.0
require('dotenv').config();
const { Client, GatewayIntentBits, InteractionType, InteractionResponseType, EmbedBuilder } = require('discord.js');
const express = require('express');

// サービス統合
const environment = require('./config/environment');
const openaiService = require('./services/openai-service');
const googleApis = require('./services/google-apis');
const ragSystem = require('./services/rag-system');
const knowledgeBase = require('./services/knowledge-base');
const contentLoaders = require('./utils/content-loaders');
const imageUtils = require('./utils/image-utils');
const aiResponseGenerator = require('./ai/ai-response-generator');
const promptTemplates = require('./ai/prompt-templates');

// 知識ベース自動更新スケジューラー
const { knowledgeScheduler } = require('./services/knowledge-scheduler');

// ハンドラー統合
const discordHandler = require('./handlers/discord-handler');
const mentionHandler = require('./handlers/mention-handler');
const buttonHandler = require('./handlers/button-handler');
const adminHandler = require('./handlers/admin-handler');

class WannamiBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });
        
        this.app = express();
        this.port = environment.get('PORT') || 3000;
        this.isReady = false;
        
        this.setupMiddleware();
        this.setupEventHandlers();
        this.setupWebServer();
    }
    
    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
    }
    
    setupEventHandlers() {
        // Bot準備完了
        this.client.once('ready', async () => {
            console.log('✅ わんなみちゃんBot起動完了!');
            console.log(`🤖 ${this.client.user.tag} としてログイン`);
            console.log(`🔗 ${this.client.guilds.cache.size}個のサーバーに接続`);
            
            // 知識ベース初期化
            await this.initializeKnowledgeBase();
            
            // 知識ベース自動更新スケジューラー開始
            try {
                knowledgeScheduler.start();
                console.log('📅 知識ベース自動更新スケジューラー開始完了');
            } catch (schedulerError) {
                console.error('❌ スケジューラー開始エラー:', schedulerError);
            }
            
            this.isReady = true;
            console.log('🚀 全システム初期化完了');
        });
        
        // メッセージ処理 - 高度機能統合版
        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            
            try {
                console.log(`📩 メッセージ受信: ${message.author.tag} - ${message.content}`);
                
                // メンション処理（修正されたハンドラーを使用）
                if (message.mentions.has(this.client.user)) {
                    await mentionHandler.handleMessage(message, this.client);
                    return;
                }
                
                // ロールメンション処理
                if (await this.checkRoleMention(message)) {
                    await mentionHandler.handleRoleMention(message, this.client);
                    return;
                }
                
                // 通常メッセージ処理（知識ベース限定）
                if (await this.shouldRespond(message)) {
                    await this.handleRegularMessage(message);
                }
                
            } catch (error) {
                console.error('❌ メッセージ処理エラー:', error);
                await this.sendErrorMessage(message, error);
            }
        });
        
        // インタラクション処理
        this.client.on('interactionCreate', async (interaction) => {
            try {
                if (interaction.isCommand()) {
                    await this.handleSlashCommand(interaction);
                } else if (interaction.isButton()) {
                    await buttonHandler.handleButtonClick(interaction, this.client);
                }
            } catch (error) {
                console.error('❌ インタラクション処理エラー:', error);
            }
        });
    }
    
    // 知識ベース初期化
    async initializeKnowledgeBase() {
        try {
            console.log('📚 知識ベース初期化中...');
            await knowledgeBase.initialize();
            
            // RAGシステム初期化
            if (ragSystem.initialize) {
                await ragSystem.initialize();
            }
            
            console.log('✅ 知識ベース初期化完了');
        } catch (error) {
            console.error('❌ 知識ベース初期化エラー:', error);
        }
    }
    
    // メンション処理 - 完全機能版
    async handleMentionMessage(message) {
        await message.channel.sendTyping();
        
        try {
            // コンテンツ解析と抽出
            const analysisResult = await this.analyzeMessageContent(message);
            
            // RAGシステムによる知識検索
            const ragResult = await ragSystem.processQuery(
                message.content,
                analysisResult.extractedContent
            );
            
            // AI応答生成（GPT-4 Vision統合）
            const response = await aiResponseGenerator.generateResponse({
                userQuery: message.content,
                knowledgeContext: ragResult.knowledgeContext,
                imageAnalysis: analysisResult.imageAnalysis,
                webContent: analysisResult.webContent,
                userId: message.author.id,
                guildId: message.guild?.id
            });
            
            // 応答送信（長文対応）
            await this.sendLongResponse(message, response);
            
        } catch (error) {
            console.error('❌ メンション処理エラー:', error);
            await this.sendErrorMessage(message, error);
        }
    }
    
    // ロールメンション処理
    async handleRoleMentionMessage(message) {
        try {
            const roleMentionResult = await mentionHandler.processRoleMention(message);
            if (roleMentionResult.shouldRespond) {
                await this.handleMentionMessage(message);
            }
        } catch (error) {
            console.error('❌ ロールメンション処理エラー:', error);
        }
    }
    
    // メッセージコンテンツ解析（画像・Web・Notion対応）
    async analyzeMessageContent(message) {
        const result = {
            extractedContent: '',
            imageAnalysis: '',
            webContent: ''
        };
        
        try {
            // 画像解析（GPT-4 Vision）
            if (message.attachments.size > 0) {
                const imageUrls = await imageUtils.extractImageUrls(message.attachments);
                if (imageUrls.length > 0) {
                    result.imageAnalysis = await openaiService.analyzeImages(imageUrls);
                }
            }
            
            // URL解析（Notion/Web対応）
            const urls = this.extractUrls(message.content);
            if (urls.length > 0) {
                result.webContent = await contentLoaders.loadWebContent(urls);
            }
            
            // 総合コンテンツ抽出
            result.extractedContent = [
                message.content,
                result.imageAnalysis,
                result.webContent
            ].filter(Boolean).join('\n\n');
            
        } catch (error) {
            console.error('❌ コンテンツ解析エラー:', error);
        }
        
        return result;
    }
    
    // 知識ベース限定回答判定
    async shouldRespond(message) {
        try {
            // 知識ベース検索でマッチする内容があるかチェック
            const knowledgeMatch = await knowledgeBase.searchRelevantKnowledge(
                message.content,
                0.3 // 閾値設定
            );
            
            return knowledgeMatch.length > 0;
        } catch (error) {
            console.error('❌ 応答判定エラー:', error);
            return false;
        }
    }
    
    // 通常メッセージ処理（知識ベース限定）
    async handleRegularMessage(message) {
        try {
            const knowledgeResult = await knowledgeBase.searchKnowledge(message.content);
            
            if (knowledgeResult.length > 0) {
                const response = await aiResponseGenerator.generateKnowledgeBasedResponse({
                    query: message.content,
                    knowledgeItems: knowledgeResult,
                    userId: message.author.id
                });
                
                await this.sendResponse(message, response);
            }
        } catch (error) {
            console.error('❌ 通常メッセージ処理エラー:', error);
        }
    }
    
    // 長文応答送信（Discord制限対応）
    async sendLongResponse(message, response) {
        const maxLength = 2000;
        
        if (response.length <= maxLength) {
            await message.reply(response);
            return;
        }
        
        // 分割送信
        const chunks = this.splitMessage(response, maxLength);
        await message.reply(chunks[0]);
        
        for (let i = 1; i < chunks.length; i++) {
            await message.channel.send(chunks[i]);
        }
    }
    
    // メッセージ分割
    splitMessage(text, maxLength) {
        const chunks = [];
        let current = '';
        
        const lines = text.split('\n');
        
        for (const line of lines) {
            if (current.length + line.length + 1 <= maxLength) {
                current += (current ? '\n' : '') + line;
            } else {
                if (current) chunks.push(current);
                current = line;
            }
        }
        
        if (current) chunks.push(current);
        return chunks;
    }
    
    // URL抽出
    extractUrls(text) {
        const urlRegex = /https?:\/\/[^\s]+/g;
        return text.match(urlRegex) || [];
    }
    
    // ロールメンション確認
    async checkRoleMention(message) {
        try {
            return await mentionHandler.checkRoleMention(message);
        } catch (error) {
            console.error('❌ ロールメンション確認エラー:', error);
            return false;
        }
    }
    
    // エラー応答送信
    async sendErrorMessage(message, error) {
        try {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('⚠️ エラーが発生しました')
                .setDescription('申し訳ございません。処理中にエラーが発生しました。')
                .addFields(
                    { name: 'エラー詳細', value: error.message.substring(0, 1000) }
                )
                .setTimestamp();
            
            await message.reply({ embeds: [errorEmbed] });
        } catch (sendError) {
            console.error('❌ エラーメッセージ送信失敗:', sendError);
        }
    }
    
    // スラッシュコマンド処理
    async handleSlashCommand(interaction) {
        try {
            const commandName = interaction.commandName;
            
            switch (commandName) {
                case 'soudan':
                    await discordHandler.handleSlashCommand(interaction);
                    break;
                    
                case 'help':
                    await discordHandler.handleSlashCommand(interaction);
                    break;
                    
                case 'status':
                    await discordHandler.handleSlashCommand(interaction);
                    break;
                    
                case 'knowledge':
                    await adminHandler.handleKnowledgeCommand(interaction);
                    break;
                    
                default:
                    await discordHandler.handleSlashCommand(interaction);
            }
        } catch (error) {
            console.error('❌ スラッシュコマンド処理エラー:', error);
        }
    }
    
    // Webサーバー設定
    setupWebServer() {
        this.app.get('/', (req, res) => {
            const schedulerStatus = knowledgeScheduler.getStatus();
            
            res.json({
                status: 'running',
                botName: 'わんなみちゃんBot',
                version: '15.3.0',
                features: [
                    '知識ベース統合（A-G列対応）',
                    'OpenAI GPT-4 Vision対応',
                    'RAGシステム（トークン最適化済み）',
                    '画像検出・抽出・Vision解析',
                    'Notion/WEBサイト読み込み',
                    '知識ベース限定回答システム',
                    'ロールメンション対応',
                    'AI対話式ボタンメニュー',
                    '知識ベース自動更新スケジューラー'
                ],
                ready: this.isReady,
                knowledgeBase: {
                    autoUpdate: schedulerStatus.isRunning,
                    lastUpdate: schedulerStatus.lastUpdate,
                    nextUpdate: schedulerStatus.nextUpdate,
                    updateInProgress: schedulerStatus.updateInProgress
                }
            });
        });
        
        this.app.get('/health', (req, res) => {
            const schedulerStatus = knowledgeScheduler.getStatus();
            
            res.json({
                status: 'healthy',
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString(),
                scheduler: {
                    running: schedulerStatus.isRunning,
                    updating: schedulerStatus.updateInProgress
                }
            });
        });
        
        // 知識ベース統計API
        this.app.get('/api/knowledge-stats', (req, res) => {
            try {
                const kbStats = knowledgeBase.getStats();
                const schedulerStatus = knowledgeScheduler.getStatus();
                
                res.json({
                    knowledgeBase: kbStats,
                    scheduler: schedulerStatus,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to get knowledge base stats',
                    message: error.message
                });
            }
        });
    }
    
    // Bot起動
    async start() {
        try {
            console.log('🚀 わんなみちゃんBot起動中...');
            
            // Webサーバー起動
            this.app.listen(this.port, () => {
                console.log(`🌐 Webサーバー起動: http://localhost:${this.port}`);
            });
            
            // Discord Bot起動
            await this.client.login(environment.get('DISCORD_BOT_TOKEN'));
            
        } catch (error) {
            console.error('❌ Bot起動エラー:', error);
            process.exit(1);
        }
    }
    
    // 正常終了処理
    async shutdown() {
        console.log('🔄 わんなみちゃんBot終了処理中...');
        
        try {
            // スケジューラー停止
            knowledgeScheduler.stop();
            console.log('📅 知識ベース自動更新スケジューラー停止完了');
            
            // Discord Bot終了
            await this.client.destroy();
            console.log('✅ Bot終了完了');
            process.exit(0);
        } catch (error) {
            console.error('❌ 終了処理エラー:', error);
            process.exit(1);
        }
    }
}

// シグナルハンドリング
process.on('SIGINT', async () => {
    console.log('🛑 SIGINT受信 - 終了処理開始');
    if (global.bot) {
        await global.bot.shutdown();
    }
});

process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM受信 - 終了処理開始');
    if (global.bot) {
        await global.bot.shutdown();
    }
});

// 未処理例外のキャッチ
process.on('uncaughtException', (error) => {
    console.error('❌ 未処理例外:', error);
    if (global.bot) {
        global.bot.shutdown();
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未処理Promise拒否:', reason);
    console.error('Promise:', promise);
});

// Bot起動
const bot = new WannamiBot();
global.bot = bot;
bot.start();

module.exports = WannamiBot;
