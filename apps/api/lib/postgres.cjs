const { Pool } = require("pg");
const { config } = require("./env.cjs");

function getDatabaseUrl() {
  const value = String(config.databaseUrl || "").trim();
  if (!value) {
    throw new Error(
      "DATABASE_URL غير مضبوط. هذه النسخة من الـ API تعمل على Postgres فقط. اضبط DATABASE_URL ثم أعد المحاولة.",
    );
  }
  return value;
}

function shouldUseSsl(connectionString) {
  if (config.databaseSsl === true) return true;
  return /sslmode=require/i.test(connectionString) || /neon\.tech/i.test(connectionString);
}

function createPool() {
  const connectionString = getDatabaseUrl();
  return new Pool({
    connectionString,
    max: config.databasePoolMax,
    idleTimeoutMillis: config.databaseIdleTimeoutMs,
    connectionTimeoutMillis: config.databaseConnectTimeoutMs,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
  });
}

async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // best effort rollback
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createPool,
  getDatabaseUrl,
  withTransaction,
};
