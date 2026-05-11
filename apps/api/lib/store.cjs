const { withTransaction } = require("./postgres.cjs");

function mapPublicUser(row) {
  return {
    id: row.account_id || row.user_id || row.id,
    fullName: row.full_name,
    farmName: row.farm_name,
    email: row.email,
    plan: row.plan || "trial",
    emailVerifiedAt: row.email_verified_at || null,
  };
}

function createStore(pool) {
  return {
    async findUserByEmail(email) {
      const result = await pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [email]);
      return result.rows[0] || null;
    },

    async findUserById(id) {
      const result = await pool.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
      return result.rows[0] || null;
    },

    async createUserWithState({ user, initialState }) {
      return withTransaction(pool, async (client) => {
        await client.query(
          `
            INSERT INTO users (
              id, full_name, farm_name, email, password_hash, password_salt, plan, created_at, updated_at, email_verified_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [
            user.id,
            user.fullName,
            user.farmName,
            user.email,
            user.passwordHash,
            user.passwordSalt,
            user.plan,
            user.createdAt,
            user.updatedAt,
            user.emailVerifiedAt || null,
          ],
        );

        await client.query(
          `
            INSERT INTO farm_states (user_id, state_json, updated_at)
            VALUES ($1, $2::jsonb, $3)
            ON CONFLICT (user_id)
            DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = EXCLUDED.updated_at
          `,
          [user.id, JSON.stringify(initialState || {}), user.updatedAt],
        );
      });
    },

    async createSession(session) {
      await pool.query(
        `
          INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          session.id,
          session.userId,
          session.tokenHash,
          session.createdAt,
          session.lastSeenAt,
          session.expiresAt,
        ],
      );
    },

    async findSessionByTokenHashes(tokenHashes) {
      const result = await pool.query(
        `
          SELECT
            s.id AS session_id,
            s.user_id AS user_id,
            s.created_at AS session_created_at,
            s.last_seen_at AS last_seen_at,
            s.expires_at AS expires_at,
            u.id AS account_id,
            u.full_name,
            u.farm_name,
            u.email,
            u.plan,
            u.email_verified_at
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ANY($1::text[])
          LIMIT 1
        `,
        [tokenHashes],
      );
      return result.rows[0] || null;
    },

    async touchSession(sessionId, timestamp) {
      await pool.query("UPDATE sessions SET last_seen_at = $1 WHERE id = $2", [timestamp, sessionId]);
    },

    async deleteSessionById(sessionId) {
      await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
    },

    async deleteSessionsByUserId(userId) {
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    },

    async getStateByUserId(userId) {
      const result = await pool.query("SELECT state_json FROM farm_states WHERE user_id = $1 LIMIT 1", [userId]);
      return result.rows[0] || null;
    },

    async upsertState(userId, state, updatedAt) {
      await pool.query(
        `
          INSERT INTO farm_states (user_id, state_json, updated_at)
          VALUES ($1, $2::jsonb, $3)
          ON CONFLICT (user_id)
          DO UPDATE SET state_json = EXCLUDED.state_json, updated_at = EXCLUDED.updated_at
        `,
        [userId, JSON.stringify(state || {}), updatedAt],
      );
    },

    async createAuthToken(tokenRecord) {
      await pool.query(
        `
          INSERT INTO auth_tokens (id, user_id, type, token_hash, created_at, expires_at, consumed_at, meta_json)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `,
        [
          tokenRecord.id,
          tokenRecord.userId,
          tokenRecord.type,
          tokenRecord.tokenHash,
          tokenRecord.createdAt,
          tokenRecord.expiresAt,
          tokenRecord.consumedAt || null,
          JSON.stringify(tokenRecord.meta || {}),
        ],
      );
    },

    async invalidateAuthTokensByUser(userId, type) {
      await pool.query(
        `
          UPDATE auth_tokens
          SET consumed_at = COALESCE(consumed_at, NOW())
          WHERE user_id = $1
            AND type = $2
            AND consumed_at IS NULL
        `,
        [userId, type],
      );
    },

    async findActiveAuthTokenByHash(tokenHash, type) {
      const result = await pool.query(
        `
          SELECT *
          FROM auth_tokens
          WHERE token_hash = $1
            AND type = $2
            AND consumed_at IS NULL
          LIMIT 1
        `,
        [tokenHash, type],
      );
      return result.rows[0] || null;
    },

    async consumeAuthToken(tokenId) {
      await pool.query("UPDATE auth_tokens SET consumed_at = NOW() WHERE id = $1", [tokenId]);
    },

    async markEmailVerified(userId, timestamp) {
      const result = await pool.query(
        `
          UPDATE users
          SET email_verified_at = COALESCE(email_verified_at, $2), updated_at = $2
          WHERE id = $1
          RETURNING *
        `,
        [userId, timestamp],
      );
      return result.rows[0] || null;
    },

    async updatePassword(userId, passwordHash, passwordSalt, updatedAt) {
      const result = await pool.query(
        `
          UPDATE users
          SET password_hash = $2, password_salt = $3, updated_at = $4
          WHERE id = $1
          RETURNING *
        `,
        [userId, passwordHash, passwordSalt, updatedAt],
      );
      return result.rows[0] || null;
    },

    async updateProfile(userId, fullName, farmName, updatedAt) {
      const result = await pool.query(
        `
          UPDATE users
          SET full_name = $2, farm_name = $3, updated_at = $4
          WHERE id = $1
          RETURNING *
        `,
        [userId, fullName, farmName, updatedAt],
      );
      return result.rows[0] || null;
    },

    async ping() {
      await pool.query("SELECT 1");
    },

    mapPublicUser,
  };
}

module.exports = {
  createStore,
  mapPublicUser,
};
