const fs = require('fs');
const path = require('path');
const { getPool } = require('./pool');
const logger = require('../utils/logger');

const MIGRATION_LOCK_ID = 948103104;
let migrationPromise = null;

async function runMigrations() {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const client = await getPool().connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      const migrationsDirectory = path.join(__dirname, 'migrations');
      const files = fs.readdirSync(migrationsDirectory)
        .filter((file) => file.endsWith('.sql'))
        .sort();

      const appliedResult = await client.query('SELECT name FROM schema_migrations');
      const applied = new Set(appliedResult.rows.map((row) => row.name));

      for (const file of files) {
        if (applied.has(file)) continue;

        const sql = fs.readFileSync(path.join(migrationsDirectory, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
          await client.query('COMMIT');
          logger.info(`✅ PostgreSQLマイグレーション適用: ${file}`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }

      return { applied: files.length };
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
      } finally {
        client.release();
      }
    }
  })().catch((error) => {
    migrationPromise = null;
    throw error;
  });

  return migrationPromise;
}

if (require.main === module) {
  require('dotenv').config();
  runMigrations()
    .then(() => {
      console.log('✅ データベースの準備が完了しました');
      return require('./pool').closePool();
    })
    .catch((error) => {
      console.error('❌ データベースマイグレーション失敗:', error.message);
      process.exitCode = 1;
    });
}

module.exports = { runMigrations };
