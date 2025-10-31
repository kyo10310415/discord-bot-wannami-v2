// utils/logger.js - ログ管理システム（chalk不使用版）

// ANSI色コード
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // 文字色
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  // 背景色
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

// 色付けヘルパー関数
const colorize = (color, text) => `${color}${text}${colors.reset}`;

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  // ログレベルチェック
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  // タイムスタンプ生成
  getTimestamp() {
    const now = new Date();
    return `[${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
  }

  // 基本ログ出力
  log(level, message, ...args) {
    if (!this.shouldLog(level)) return;
    
    const timestamp = this.getTimestamp();
    const levelColors = {
      error: colors.red,
      warn: colors.yellow,
      info: colors.cyan,
      debug: colors.gray
    };
    
    const levelColor = levelColors[level] || colors.white;
    const levelStr = `[${level.toUpperCase()}]`;
    
    console.log(
      `${colorize(colors.gray, timestamp)} ${colorize(levelColor, levelStr)} ${message}`,
      ...args
    );
  }

  // エラーログ
  error(message, ...args) {
    console.log(colorize(colors.red, `❌ ${message}`), ...args);
  }

  // 警告ログ
  warn(message, ...args) {
    console.log(colorize(colors.yellow, `⚠️ ${message}`), ...args);
  }

  // 情報ログ
  info(message, ...args) {
    console.log(colorize(colors.cyan, `ℹ️ ${message}`), ...args);
  }

  // デバッグログ
  debug(message, ...args) {
    if (this.shouldLog('debug')) {
      console.log(colorize(colors.gray, `🐛 ${message}`), ...args);
    }
  }

  // 成功ログ
  success(message, ...args) {
    console.log(colorize(colors.green, `✅ ${message}`), ...args);
  }

  // Discord関連ログ
  discord(message, ...args) {
    this.log('info', `💬 ${message}`, ...args);
  }

  // API関連ログ
  api(message, ...args) {
    this.log('info', `🔗 [API] ${message}`, ...args);
  }

  // AI関連ログ
  ai(message, ...args) {
    this.log('info', `🧠 [AI] ${message}`, ...args);
  }

  // 画像関連ログ
  image(message, ...args) {
    this.log('info', `🖼️ ${message}`, ...args);
  }

  // 知識ベース関連ログ
  knowledge(message, ...args) {
    this.log('info', `📚 [Knowledge] ${message}`, ...args);
  }

  // パフォーマンス測定開始
  time(label) {
    console.time(colorize(colors.blue, `⏱️ ${label}`));
  }

  // パフォーマンス測定終了
  timeEnd(label) {
    console.timeEnd(colorize(colors.blue, `⏱️ ${label}`));
  }

  // オブジェクトの詳細ログ
  object(message, obj) {
    this.info(`${message}:`);
    console.log(JSON.stringify(obj, null, 2));
  }

  // ファイル操作ログ
  file(action, filename, ...args) {
    this.log('info', `📁 [File] ${action}: ${filename}`, ...args);
  }

  // HTTP リクエストログ
  http(method, url, status, ...args) {
    const statusColor = status >= 400 ? colors.red : status >= 300 ? colors.yellow : colors.green;
    this.log('info', `🌐 [HTTP] ${method} ${url} ${colorize(statusColor, status)}`, ...args);
  }

  // セキュリティ関連ログ
  security(message, ...args) {
    this.log('warn', `🔒 [Security] ${message}`, ...args);
  }

  // 統計情報ログ
  stats(message, data, ...args) {
    this.log('info', `📊 [Stats] ${message}`, ...args);
    if (data && typeof data === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        console.log(`  ${colorize(colors.cyan, key)}: ${colorize(colors.white, value)}`);
      });
    }
  }

  // エラーハンドリング用の詳細ログ
  errorDetail(message, error) {
    this.error(message);
    if (error && error.stack) {
      console.error(colorize(colors.red, error.stack));
    } else if (error) {
      console.error(colorize(colors.red, String(error)));
    }
  }

  // 設定情報表示
  config(configName, configData) {
    this.info(`🔧 [Config] ${configName}:`);
    Object.entries(configData).forEach(([key, value]) => {
      const displayValue = key.toLowerCase().includes('password') || 
                          key.toLowerCase().includes('token') || 
                          key.toLowerCase().includes('key') ? 
                          '***' : value;
      console.log(`  ${colorize(colors.yellow, key)}: ${colorize(colors.white, displayValue)}`);
    });
  }

  // 起動完了ログ（特別なフォーマット）
  startup(appName, version, port) {
    const line = '='.repeat(50);
    console.log(colorize(colors.green, '\n' + line));
    console.log(colorize(colors.green + colors.bright, `🚀 ${appName} Started Successfully!`));
    console.log(colorize(colors.green, `📦 Version: ${version}`));
    console.log(colorize(colors.green, `🌐 Port: ${port}`));
    console.log(colorize(colors.green, `🕐 Time: ${new Date().toISOString()}`));
    console.log(colorize(colors.green, `🔧 Node.js: ${process.version}`));
    console.log(colorize(colors.green, `🎯 Environment: ${process.env.NODE_ENV || 'development'}`));
    console.log(colorize(colors.green, line + '\n'));
  }

  // 終了ログ（特別なフォーマット）
  shutdown(appName, reason) {
    const line = '='.repeat(50);
    console.log(colorize(colors.yellow, '\n' + line));
    console.log(colorize(colors.yellow + colors.bright, `🛑 ${appName} Shutting Down`));
    console.log(colorize(colors.yellow, `📝 Reason: ${reason}`));
    console.log(colorize(colors.yellow, `🕐 Time: ${new Date().toISOString()}`));
    console.log(colorize(colors.yellow, line + '\n'));
  }
}

module.exports = new Logger();
