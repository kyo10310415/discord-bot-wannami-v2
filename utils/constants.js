// utils/constants.js - システム定数

// Discord関連定数
const DISCORD = {
  INTERACTION_TYPES: {
    PING: 1,
    APPLICATION_COMMAND: 2,
    MESSAGE_COMPONENT: 3,
    APPLICATION_COMMAND_AUTOCOMPLETE: 4,
    MODAL_SUBMIT: 5
  },
  
  RESPONSE_TYPES: {
    PONG: 1,
    CHANNEL_MESSAGE_WITH_SOURCE: 4,
    DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
    DEFERRED_UPDATE_MESSAGE: 6,
    UPDATE_MESSAGE: 7
  },
  
  COMPONENT_TYPES: {
    ACTION_ROW: 1,
    BUTTON: 2,
    SELECT_MENU: 3,
    TEXT_INPUT: 4
  },
  
  BUTTON_STYLES: {
    PRIMARY: 1,
    SECONDARY: 2,
    SUCCESS: 3,
    DANGER: 4,
    LINK: 5
  },
  
  MESSAGE_FLAGS: {
    EPHEMERAL: 64
  }
};

// AI関連定数
const AI = {
  MAX_TOKENS: 4000,
  TEMPERATURE: 0.7,
  MAX_CONTEXT_LENGTH: 25000,
  MAX_IMAGES: 5,
  
  MODELS: {
    GPT4_VISION: 'gpt-4-vision-preview',
    GPT4: 'gpt-4',
    GPT35_TURBO: 'gpt-3.5-turbo'
  }
};

// 画像関連定数
const IMAGES = {
  MAX_SIZE: 20 * 1024 * 1024, // 20MB
  SUPPORTED_FORMATS: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
  MAX_COUNT: 5,
  
  VISION_DETAIL: {
    LOW: 'low',
    HIGH: 'high'
  }
};

// システム制限
const LIMITS = {
  MESSAGE_LENGTH: 2000,
  EMBED_DESCRIPTION_LENGTH: 4096,
  EMBED_FIELD_VALUE_LENGTH: 1024,
  KNOWLEDGE_BASE_CHUNK_SIZE: 1500,
  API_TIMEOUT: 30000,
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000,
  MAX_CONTEXT_LENGTH: 25000
};

// ボタンID定数
const BUTTON_IDS = {
  PAYMENT_CONSULTATION: 'payment_consultation',
  PRIVATE_CONSULTATION: 'private_consultation',
  LESSON_QUESTION: 'lesson_question',
  SNS_CONSULTATION: 'sns_consultation',
  MISSION_SUBMISSION: 'mission_submission'
};

// AI対象ボタン（AI機能を使用するボタン）
const AI_TARGET_BUTTONS = new Set([
  BUTTON_IDS.LESSON_QUESTION,
  BUTTON_IDS.SNS_CONSULTATION,
  BUTTON_IDS.MISSION_SUBMISSION
]);

// ログレベル
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// エラーコード
const ERROR_CODES = {
  DISCORD_SIGNATURE_INVALID: 'DISCORD_SIGNATURE_INVALID',
  OPENAI_API_ERROR: 'OPENAI_API_ERROR',
  GOOGLE_API_ERROR: 'GOOGLE_API_ERROR',
  KNOWLEDGE_BASE_ERROR: 'KNOWLEDGE_BASE_ERROR',
  IMAGE_PROCESSING_ERROR: 'IMAGE_PROCESSING_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED'
};

// デフォルト設定
const DEFAULTS = {
  RESPONSE_LANGUAGE: 'ja',
  TIMEZONE: 'Asia/Tokyo',
  BOT_NAME: 'わなみさん',
  SUPPORT_EMAIL: 'support@wannami-school.com'
};

// 正規表現パターン
const PATTERNS = {
  MENTION: /<@!?(\d+)>/g,
  URL: /https?:\/\/[^\s]+/gi,
  IMAGE_URL: /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i,
  NOTION_URL: /https:\/\/[^\/]*notion\.so\/[^\s]+/gi,
  GOOGLE_DRIVE_URL: /https:\/\/drive\.google\.com\/[^\s]+/gi
};

// カラーコード
const COLORS = {
  SUCCESS: 0x00ff00,
  ERROR: 0xff0000,
  WARNING: 0xffff00,
  INFO: 0x0099ff,
  PRIMARY: 0x5865f2
};

module.exports = {
  DISCORD,
  AI,
  IMAGES,
  LIMITS,
  BUTTON_IDS,
  AI_TARGET_BUTTONS,
  LOG_LEVELS,
  ERROR_CODES,
  DEFAULTS,
  PATTERNS,
  COLORS
};
