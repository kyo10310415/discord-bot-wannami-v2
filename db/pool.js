const { Pool } = require('pg');
const logger = require('../utils/logger');

let pool = null;

function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function createPoolConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    const error = new Error('DATABASE_URLが設定されていません');
    error.code = 'DATABASE_URL_MISSING';
    throw error;
  }

  const config = {
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 10000),
    application_name: 'wannav-knowledge-admin'
  };

  const sslMode = String(process.env.DATABASE_SSL || '').toLowerCase();
  if (sslMode === 'require' || sslMode === 'true') {
    config.ssl = {
      rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false'
    };
  } else if (sslMode === 'disable' || sslMode === 'false') {
    config.ssl = false;
  }

  return config;
}

function getPool() {
  if (!pool) {
    pool = new Pool(createPoolConfig());
    pool.on('error', (error) => {
      logger.errorDetail('PostgreSQLプールエラー:', error);
    });
  }
  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function checkDatabaseConnection() {
  const result = await query('SELECT NOW() AS server_time');
  return result.rows[0];
}

async function closePool() {
  if (pool) {
    const closingPool = pool;
    pool = null;
    await closingPool.end();
  }
}

module.exports = {
  getPool,
  query,
  withTransaction,
  checkDatabaseConnection,
  closePool,
  isDatabaseConfigured
};
