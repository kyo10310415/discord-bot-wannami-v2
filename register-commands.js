const axios = require('axios');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
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
    
    console.log('Slash Commands登録成功:', response.data);
    console.log('登録されたコマンド数:', response.data.length);
    
  } catch (error) {
    console.error('Slash Commands登録エラー:', error.response?.data || error.message);
  }
}

// 実行
registerCommands();
