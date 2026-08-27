const { KNOWLEDGE_SPREADSHEET_ID } = require('../config/constants');
const { runMigrations } = require('../db/migrate');
const { googleAPIsService } = require('./google-apis');
const { knowledgeSourceRepository } = require('./knowledge-source-repository');
const { validateSourceUrl } = require('../utils/source-validation');
const logger = require('../utils/logger');

async function importKnowledgeSourcesFromSpreadsheet(options = {}) {
  const spreadsheetId = options.spreadsheetId ||
    process.env.KNOWLEDGE_BASE_SPREADSHEET_ID ||
    process.env.KNOWLEDGE_SPREADSHEET_ID ||
    KNOWLEDGE_SPREADSHEET_ID;
  const actor = options.actor || 'migration-script';

  await runMigrations();
  const importId = await knowledgeSourceRepository.createImportRun({ spreadsheetId, actor });
  const summary = { importId, imported: 0, created: 0, updated: 0, errors: 0 };

  try {
    const rows = await googleAPIsService.loadUrlListFromSpreadsheet(spreadsheetId);
    for (const row of rows) {
      try {
        const normalizedRow = { ...row, url: validateSourceUrl(row.url) };
        const result = await knowledgeSourceRepository.upsertImported(normalizedRow, { actor, importId });
        summary.imported += 1;
        if (result.created) summary.created += 1;
        else summary.updated += 1;
      } catch (error) {
        summary.errors += 1;
        logger.error(`❌ ソース移行失敗 (${row.fileName}): ${error.message}`);
      }
    }

    await knowledgeSourceRepository.finishImportRun(importId, summary);
    return summary;
  } catch (error) {
    await knowledgeSourceRepository.finishImportRun(importId, summary, error);
    throw error;
  }
}

module.exports = { importKnowledgeSourcesFromSpreadsheet };
