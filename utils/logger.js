// シンプルなloggerモジュール例

const levels = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG'
};

function format(level, message) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
}

const logger = {
  info: (msg) => console.log(format(levels.info, msg)),
  warn: (msg) => console.warn(format(levels.warn, msg)),
  error: (msg) => console.error(format(levels.error, msg)),
  debug: (msg) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(format(levels.debug, msg));
    }
  }
};

module.exports = logger;
