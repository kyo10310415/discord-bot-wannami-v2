// utils/logger.js - ログ管理システム

const winston = require('winston');

// ログレベル定義
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// カスタムログフォーマット
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    if (stack) {
      return `[${timestamp}] [${level.toUpperCase()}] ${message}\n${stack}`;
    }
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  })
);

// Winston ロガー設定
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // コンソール出力
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // ファイル出力（エラーログ）
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // ファイル出力（全ログ）
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

class Logger {
  constructor() {
    this.winston = winstonLogger;
  }

  // 基本ログメソッド
  info(message, ...args) {
    const formattedMessage = this.formatMessage(message, args);
    this.winston.info(formattedMessage);
    console.log(`ℹ️ ${formattedMessage}`);
  }

  warn(message, ...args) {
    const formattedMessage = this.formatMessage(message, args);
    this.winston.warn(formattedMessage);
    console.warn(`⚠️ ${formattedMessage}`);
  }

  error(message, ...args) {
    const formattedMessage = this.formatMessage(message, args);
    this.winston.error(formattedMessage);
    console.error(`❌ ${formattedMessage}`);
  }

  debug(message, ...args) {
    const formattedMessage = this.formatMessage(message, args);
    this.winston.debug(formattedMessage);
    if (process.env.NODE_ENV === 'development') {
      console.debug(`🐛 ${formattedMessage}`);
    }
  }

  // 詳細エラーログ（スタックトレース付き）
  errorDetail(message, error) {
    const errorMessage = `${message} ${error?.message || error}`;
    const stack = error?.stack || new Error().stack;
    
    this.winston.error(errorMessage, { stack });
    console.error(`❌ ${errorMessage}`);
    
    if (stack && process.env.NODE_ENV === 'development') {
      console.error(`📍 Stack trace:\n${stack}`);
    }
  }

  // 成功ログ
  success(message, ...args) {
    const formattedMessage = this.formatMessage(message, args);
    this.winston.info(`SUCCESS: ${formattedMessage}`);
    console.log(`✅ ${formattedMessage}`);
  }

  // Discord関連ログ
  discord(message, ...args) {
    const formattedMessage = this.formatMessage(message, args);
    this.winston.info(`DISCORD: ${formattedMessage}`);
    console.log(`💬 ${formattedMessage}`);
  }

  // AI関連ログ
  ai(message, ...args) {
    const formattedMessage = this.formatMessage(message, args);
    this.winston.info(`AI: ${formattedMessage}`);
    console.log(`🤖 ${formattedMessage}`);
  }

  // 画像関連ログ
  image(message, ...args) {
    const formattedMessage = this.formatMessage(message, args);
    this.winston.info(`IMAGE: ${formattedMessage}`);
    console.log(`🖼️ ${formattedMessage}`);
  }

  // API関連ログ
  api(message, ...args) {
    const formattedMessage = this.formatMessage(message, args);
    this.winston.info(`API: ${formattedMessage}`);
    console.log(`🔗 ${formattedMessage}`);
  }

  // 知識ベース関連ログ
  knowledge(message, ...args) {
    const formattedMessage = this.formatMessage(message, args);
    this.winston.info(`KNOWLEDGE: ${formattedMessage}`);
    console.log(`📚 ${formattedMessage}`);
  }

  // スケジューラー関連ログ
  scheduler(message, ...args) {
    const formattedMessage = this.formatMessage(message, args);
    this.winston.info(`SCHEDULER: ${formattedMessage}`);
    console.log(`⏰ ${formattedMessage}`);
  }

  // メッセージ整形
  formatMessage(message, args) {
    if (args.length === 0) {
      return message;
    }
    
    const formattedArgs = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    });
    
    return `${message} ${formattedArgs.join(' ')}`;
  }

  // ログレベル設定
  setLevel(level) {
    this.winston.level = level;
  }

  // ログファイルのクリア
  clearLogs() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const logsDir = path.join(process.cwd(), 'logs');
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir);
        files.forEach(file => {
          const filePath = path.join(logsDir, file);
          fs.unlinkSync(filePath);
        });
        this.info('ログファイルをクリアしました');
      }
    } catch (error) {
      this.error('ログファイルクリアエラー:', error.message);
    }
  }

  // 統計情報取得
  getStats() {
    return {
      level: this.winston.level,
      transports: this.winston.transports.length,
      timestamp: new Date().toISOString()
    };
  }
}

// シングルトンインスタンス
const logger = new Logger();

// ログディレクトリの作成
const fs = require('fs');
const path = require('path');
const logsDir = path.join(process.cwd(), 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = logger;
