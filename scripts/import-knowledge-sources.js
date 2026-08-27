require('dotenv').config();
process.env.SKIP_APP_ENV_VALIDATION = 'true';

async function main() {
  const { importKnowledgeSourcesFromSpreadsheet } = require('../services/knowledge-source-importer');
  const { closePool } = require('../db/pool');

  try {
    const result = await importKnowledgeSourcesFromSpreadsheet({ actor: 'migration-script' });
    console.log(JSON.stringify({ success: true, ...result }, null, 2));
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  console.error('❌ AI回答用ソース一覧の移行に失敗しました:', error.message);
  process.exitCode = 1;
});
