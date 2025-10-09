// config/constants.js - 定数・設定値

module.exports = {
  // Bot設定
  BOT_USER_ID: process.env.BOT_USER_ID || '1420328163497607199',
  
  // Webhook URLs
  N8N_WEBHOOK_URL: 'https://kyo10310405.app.n8n.cloud/webhook/053be54b-55c7-4c3e-8eb7-4f9b6c63656d',
  
  // 知識ベース設定
  KNOWLEDGE_SPREADSHEET_ID: '16BO2pz7Wi36MKwxFZFo5YyaANzVfajkPkXtw1xtSJbQ',
  
  // AI対象ボタンの定義
  AI_TARGET_BUTTONS: {
    lesson_question: true,
    sns_consultation: true,
    mission_submission: true
  },
  
  // OpenAI設定
  OPENAI_MODELS: {
    VISION: 'gpt-4o',
    TEXT: 'gpt-4o-mini',
    EMBEDDING: 'text-embedding-3-small'
  },
  
  // RAG設定
  RAG_CONFIG: {
    MAX_CHUNK_SIZE: 1000,
    CHUNK_OVERLAP: 200,
    MAX_CONTEXT_LENGTH: 40000,
    MAX_IMAGES: 5,
    TOP_K_CHUNKS: 15,
    SIMILARITY_THRESHOLD: 0.3
  },
  
  // Discord設定
  DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY || '63d73edbad916c2ee14b390d729061d40200f2d82753cb094ed89af67873dadd',
  
  // Google APIs スコープ
  GOOGLE_SCOPES: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/presentations.readonly',
    'https://www.googleapis.com/auth/documents.readonly'
  ],
  
  // システム情報
  VERSION: '13.0.0', // RAG統合版
  FEATURES: {
    slash_commands: true,
    mention_support: true,
    image_support: true,
    document_image_support: true,
    rag_system: true,
    button_interactions: true,
    static_responses: true,
    ai_responses: 'rag_enhanced',
    question_input_system: true,
    spreadsheet_integration: true,
    google_slides_docs_support: true,
    notion_support: true,
    website_support: true,
    image_url_support: true,
    gpt4_vision: true
  }
};
