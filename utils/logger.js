// utils/logger.js - ログ管理システム

const chalk = require('chalk');

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    
    // 色分け設定
    this.colors = {
      error: chalk.red,
      warn: chalk.yellow,
      info: chalk.cyan,
      debug: chalk.gray,
      success: chalk.green
    };
  }

  // ログレベルチェック
  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  // 基本ログ出力
  log(level, message, ...args) {
    if (!this.shouldLog(level)) return;
    
    const timestamp = new Date().toISOString();
    const colorFn = this.colors[level] || chalk.white;
    const levelStr = level.toUpperCase().padEnd(5);
    
    console.log(`${chalk.gray(timestamp)} ${colorFn(levelStr)} ${message}`, ...args);
  }

  // エラーログ
  error(message, ...args) {
    this.log('error', `❌ ${message}`, ...args);
  }

  // 警告ログ
  warn(message, ...args) {
    this.log('warn', `⚠️ ${message}`, ...args);
  }

  // 情報ログ
  info(message, ...args) {
    this.log('info', `ℹ️ ${message}`, ...args);
  }

  // デバッグログ
  debug(message, ...args) {
    this.log('debug', `🐛 ${message}`, ...args);
  }

  // 成功ログ
  success(message, ...args) {
    this.log('info', this.colors.success(`✅ ${message}`), ...args);
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
    console.time(chalk.blue(`⏱️ ${label}`));
  }

  // パフォーマンス測定終了
  timeEnd(label) {
    console.timeEnd(chalk.blue(`⏱️ ${label}`));
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
    const statusColor = status >= 400 ? chalk.red : status >= 300 ? chalk.yellow : chalk.green;
    this.log('info', `🌐 [HTTP] ${method} ${url} ${statusColor(status)}`, ...args);
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
        console.log(`  ${chalk.cyan(key)}: ${chalk.white(value)}`);
      });
    }
  }

  // エラーハンドリング用の詳細ログ
  errorDetail(message, error) {
    this.error(message);
    if (error && error.stack) {
      console.error(chalk.red(error.stack));
    } else if (error) {
      console.error(chalk.red(error));
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
      console.log(`  ${chalk.yellow(key)}: ${chalk.white(displayValue)}`);
    });
  }

  // 起動完了ログ（特別なフォーマット）
  startup(appName, version, port) {
    console.log(chalk.green('\n' + '='.repeat(50)));
    console.log(chalk.green.bold(`🚀 ${appName} Started Successfully!`));
    console.log(chalk.green(`📦 Version: ${version}`));
    console.log(chalk.green(`🌐 Port: ${port}`));
    console.log(chalk.green(`🕐 Time: ${new Date().toISOString()}`));
    console.log(chalk.green(`🔧 Node.js: ${process.version}`));
    console.log(chalk.green(`🎯 Environment: ${process.env.NODE_ENV || 'development'}`));
    console.log(chalk.green('='.repeat(50) + '\n'));
  }

  // 終了ログ（特別なフォーマット）
  shutdown(appName, reason) {
    console.log(chalk.yellow('\n' + '='.repeat(50)));
    console.log(chalk.yellow.bold(`🛑 ${appName} Shutting Down`));
    console.log(chalk.yellow(`📝 Reason: ${reason}`));
    console.log(chalk.yellow(`🕐 Time: ${new Date().toISOString()}`));
    console.log(chalk.yellow('='.repeat(50) + '\n'));
  }
}

// チョーク（色付け）がない場合のフォールバック
if (!chalk.supportsColor) {
  // カラーサポートがない環境では色を削除
  Object.keys(chalk).forEach(key => {
    if (typeof chalk[key] === 'function') {
      chalk[key] = (text) => text;
    }
  });
}

module.exports = new Logger();
