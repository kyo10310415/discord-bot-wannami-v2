const axios = require('axios');

// 環境変数から取得（安全）
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const APPLICATION_ID = '1420328163497607199';
const GUILD_ID = '1176426605309083678'; // テストサーバーID

// Slash Command定義
const commands = [
  {
    name: 'soudan',
    description: 'わなみさんに相談する',
    type: 1 // CHAT_INPUT
  }
];

async function registerCommands() {
  try {
    console.log('Slash Commands登録開始...');
    console.log('Application ID:', APPLICATION_ID);
    console.log('Guild ID:', GUILD_ID);
    console.log('Bot Token:', DISCORD_BOT_TOKEN ? 'Set' : 'Not Set');
    
    if (!DISCORD_BOT_TOKEN) {
      console.error('❌ DISCORD_BOT_TOKEN環境変数が設定されていません');
      return;
    }
    
    // Guild-specific command (テスト用)
    const response = await axios.put(
      `https://discord.com/api/v10/applications/${APPLICATION_ID}/guilds/${GUILD_ID}/commands`,
      commands,
      {
        headers: {
          'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Slash Commands登録成功!');
    console.log('登録されたコマンド:', response.data);
    console.log('コマンド数:', response.data.length);
    
    response.data.forEach(cmd => {
      console.log(`- /${cmd.name}: ${cmd.description}`);
    });
    
  } catch (error) {
    console.error('❌ Slash Commands登録エラー:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
  }
}

// 実行
registerCommands();
