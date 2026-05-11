const http = require("http");
const crypto = require("crypto");
const path = require("path");

const { config } = require("./lib/env.cjs");
const { createPool } = require("./lib/postgres.cjs");
const { runMigrations } = require("./lib/migrations.cjs");
const { createStore } = require("./lib/store.cjs");
const { createEmailClient } = require("./lib/email.cjs");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const pool = createPool();
const store = createStore(pool);
const emailClient = createEmailClient(config);
const metrics = {
  startedAt: new Date().toISOString(),
  requestsTotal: 0,
  authLogins: 0,
  authRegisters: 0,
  passwordResetRequests: 0,
  passwordResetCompletions: 0,
  emailVerificationRequests: 0,
  emailVerificationCompletions: 0,
  healthChecks: 0,
  errorsTotal: 0,
};
const authRateLimitBucket = new Map();

function nowIso() {
  return new Date().toISOString();
}

function sendJson(req, res, statusCode, payload) {
  const origin = req.headers.origin || "";
  const allowOrigin = config.allowedOrigins.includes(origin)
    ? origin
    : (!origin && !config.isProduction ? "*" : config.allowedOrigins[0] || "*");

  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Credentials": "false",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5_000_000) {
        reject(Object.assign(new Error("الحمولة كبيرة جدًا"), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("بيانات JSON غير صالحة"), { statusCode: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  return { salt, hash };
}

function comparePassword(password, storedHash, storedSalt) {
  const next = hashPassword(password, storedSalt);
  return crypto.timingSafeEqual(Buffer.from(next, "hex"), Buffer.from(storedHash, "hex"));
}

function hashOpaqueToken(token) {
  return crypto.createHmac("sha256", config.sessionSecret).update(token).digest("hex");
}

function hashOpaqueTokenLegacy(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildTokenHashes(token) {
  return [hashOpaqueToken(token), hashOpaqueTokenLegacy(token)];
}

function createOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function logEvent(level, message, extra = {}) {
  const record = {
    ts: nowIso(),
    level,
    message,
    ...extra,
  };
  console.log(JSON.stringify(record));
}

function requireBodyField(value, message) {
  if (!String(value || "").trim()) throw Object.assign(new Error(message), { statusCode: 400 });
}

function recordRateLimit(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.socket.remoteAddress || "unknown";
  const key = `${ip}:${req.url}`;
  const now = Date.now();
  const existing = authRateLimitBucket.get(key) || { count: 0, startedAt: now };
  if (now - existing.startedAt > config.rateLimitWindowMs) {
    existing.count = 0;
    existing.startedAt = now;
  }
  existing.count += 1;
  authRateLimitBucket.set(key, existing);
  if (existing.count > config.rateLimitMaxAuth) {
    throw Object.assign(new Error("تم تجاوز عدد المحاولات المسموح بها. حاول لاحقًا."), {
      statusCode: 429,
    });
  }
}

async function createSession(userId) {
  const token = createOpaqueToken();
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionDays * 24 * 60 * 60 * 1000);
  const session = {
    id: `SES-${crypto.randomUUID()}`,
    userId,
    tokenHash: hashOpaqueToken(token),
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };
  await store.createSession(session);
  return token;
}

async function createAuthToken(userId, type, hours, meta = {}) {
  const token = createOpaqueToken();
  const now = new Date();
  const expires = new Date(now.getTime() + hours * 60 * 60 * 1000);
  await store.createAuthToken({
    id: `TOK-${crypto.randomUUID()}`,
    userId,
    type,
    tokenHash: hashOpaqueToken(token),
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    meta,
  });
  return token;
}

async function requireAuth(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) throw Object.assign(new Error("غير مصرح"), { statusCode: 401 });
  const token = header.slice("Bearer ".length).trim();
  const session = await store.findSessionByTokenHashes(buildTokenHashes(token));
  if (!session) throw Object.assign(new Error("انتهت الجلسة أو الرمز غير صالح"), { statusCode: 401 });
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await store.deleteSessionById(session.session_id);
    throw Object.assign(new Error("انتهت الجلسة، يرجى تسجيل الدخول مجددًا"), { statusCode: 401 });
  }
  await store.touchSession(session.session_id, nowIso());
  return store.mapPublicUser(session);
}

async function sendVerificationIfNeeded(user) {
  if (!config.requireEmailVerification) return { skipped: true };
  await store.invalidateAuthTokensByUser(user.id, "email_verification");
  const token = await createAuthToken(user.id, "email_verification", config.verificationHours);
  const verifyUrl = `${config.webBaseUrl.replace(/\/$/, "")}/?verify=${encodeURIComponent(token)}`;
  await emailClient.sendVerificationEmail({
    to: user.email,
    fullName: user.fullName || user.full_name,
    verifyUrl,
  });
  metrics.emailVerificationRequests += 1;
  return { sent: true, verifyUrl };
}

async function sendPasswordReset(user) {
  await store.invalidateAuthTokensByUser(user.id, "password_reset");
  const token = await createAuthToken(user.id, "password_reset", config.passwordResetHours);
  const resetUrl = `${config.webBaseUrl.replace(/\/$/, "")}/?reset=${encodeURIComponent(token)}`;
  await emailClient.sendPasswordResetEmail({
    to: user.email,
    fullName: user.fullName || user.full_name,
    resetUrl,
  });
  metrics.passwordResetRequests += 1;
  return { sent: true, resetUrl };
}

async function handleRegister(req, res) {
  recordRateLimit(req);
  const body = await readBody(req);
  const fullName = String(body.fullName || "").trim();
  const farmName = String(body.farmName || "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const initialState = body.initialState;

  requireBodyField(fullName, "الاسم الكامل مطلوب");
  requireBodyField(farmName, "اسم المزرعة مطلوب");
  requireBodyField(email, "البريد الإلكتروني مطلوب");
  requireBodyField(password, "كلمة المرور مطلوبة");

  if (password.length < 6) {
    throw Object.assign(new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"), { statusCode: 400 });
  }
  if (await store.findUserByEmail(email)) {
    throw Object.assign(new Error("هذا البريد مسجل بالفعل"), { statusCode: 409 });
  }

  const timestamp = nowIso();
  const userId = `USR-${crypto.randomUUID()}`;
  const passwordRecord = createPasswordRecord(password);
  const emailVerifiedAt = config.requireEmailVerification ? null : timestamp;

  await store.createUserWithState({
    user: {
      id: userId,
      fullName,
      farmName,
      email,
      passwordHash: passwordRecord.hash,
      passwordSalt: passwordRecord.salt,
      plan: "trial",
      createdAt: timestamp,
      updatedAt: timestamp,
      emailVerifiedAt,
    },
    initialState,
  });

  metrics.authRegisters += 1;

  if (config.requireEmailVerification) {
    await sendVerificationIfNeeded({ id: userId, email, fullName });
    sendJson(req, res, 201, {
      ok: true,
      requiresVerification: true,
      message: "تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتفعيل الدخول.",
      user: {
        id: userId,
        fullName,
        farmName,
        email,
        plan: "trial",
        emailVerifiedAt: null,
      },
    });
    return;
  }

  const token = await createSession(userId);
  sendJson(req, res, 201, {
    ok: true,
    token,
    user: {
      id: userId,
      fullName,
      farmName,
      email,
      plan: "trial",
      emailVerifiedAt,
    },
  });
}

async function handleLogin(req, res) {
  recordRateLimit(req);
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  requireBodyField(email, "البريد الإلكتروني مطلوب");
  requireBodyField(password, "كلمة المرور مطلوبة");

  const user = await store.findUserByEmail(email);
  if (!user || !comparePassword(password, user.password_hash, user.password_salt)) {
    throw Object.assign(new Error("بيانات الدخول غير صحيحة"), { statusCode: 401 });
  }

  if (config.requireEmailVerification && !user.email_verified_at) {
    throw Object.assign(new Error("يجب تأكيد البريد الإلكتروني قبل تسجيل الدخول"), {
      statusCode: 403,
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  const token = await createSession(user.id);
  metrics.authLogins += 1;
  sendJson(req, res, 200, { ok: true, token, user: store.mapPublicUser(user) });
}

async function handleLogout(req, res) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    const session = await store.findSessionByTokenHashes(buildTokenHashes(token));
    if (session) await store.deleteSessionById(session.session_id);
  }
  sendJson(req, res, 200, { ok: true });
}

async function handleForgotPassword(req, res) {
  recordRateLimit(req);
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  requireBodyField(email, "البريد الإلكتروني مطلوب");
  const user = await store.findUserByEmail(email);
  if (user) await sendPasswordReset(user);
  sendJson(req, res, 200, {
    ok: true,
    message: "إذا كان البريد مسجلًا، فسيصلك رابط إعادة تعيين كلمة المرور.",
  });
}

async function handleResetPassword(req, res) {
  recordRateLimit(req);
  const body = await readBody(req);
  const token = String(body.token || "").trim();
  const password = String(body.password || "");
  requireBodyField(token, "رمز إعادة التعيين مطلوب");
  requireBodyField(password, "كلمة المرور الجديدة مطلوبة");
  if (password.length < 6) {
    throw Object.assign(new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"), { statusCode: 400 });
  }

  const tokenRow = await store.findActiveAuthTokenByHash(hashOpaqueToken(token), "password_reset");
  if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error("رمز إعادة التعيين غير صالح أو منتهي"), { statusCode: 400 });
  }

  const passwordRecord = createPasswordRecord(password);
  const updatedAt = nowIso();
  await store.updatePassword(tokenRow.user_id, passwordRecord.hash, passwordRecord.salt, updatedAt);
  await store.consumeAuthToken(tokenRow.id);
  await store.deleteSessionsByUserId(tokenRow.user_id);
  metrics.passwordResetCompletions += 1;
  sendJson(req, res, 200, { ok: true, message: "تم تحديث كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن." });
}

async function handleVerifyEmail(req, res) {
  recordRateLimit(req);
  const body = await readBody(req);
  const token = String(body.token || "").trim();
  requireBodyField(token, "رمز التحقق مطلوب");

  const tokenRow = await store.findActiveAuthTokenByHash(hashOpaqueToken(token), "email_verification");
  if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error("رابط التحقق غير صالح أو منتهي"), { statusCode: 400 });
  }

  await store.markEmailVerified(tokenRow.user_id, nowIso());
  await store.consumeAuthToken(tokenRow.id);
  metrics.emailVerificationCompletions += 1;
  sendJson(req, res, 200, { ok: true, message: "تم تأكيد البريد الإلكتروني بنجاح. يمكنك تسجيل الدخول الآن." });
}

async function handleResendVerification(req, res) {
  recordRateLimit(req);
  const body = await readBody(req);
  const email = normalizeEmail(body.email);
  requireBodyField(email, "البريد الإلكتروني مطلوب");
  const user = await store.findUserByEmail(email);
  if (user && !user.email_verified_at) {
    await sendVerificationIfNeeded(store.mapPublicUser(user));
  }
  sendJson(req, res, 200, {
    ok: true,
    message: "إذا كان الحساب بحاجة لتأكيد، فسيصلك رابط تحقق جديد.",
  });
}

async function handleUpdateProfile(req, res, user) {
  const body = await readBody(req);
  const fullName = String(body.fullName || "").trim();
  const farmName = String(body.farmName || "").trim();
  requireBodyField(fullName, "الاسم الكامل مطلوب");
  requireBodyField(farmName, "اسم المزرعة مطلوب");
  const updated = await store.updateProfile(user.id, fullName, farmName, nowIso());
  sendJson(req, res, 200, { ok: true, user: store.mapPublicUser(updated) });
}

const server = http.createServer(async (req, res) => {
  metrics.requestsTotal += 1;

  if (req.method === "OPTIONS") {
    sendJson(req, res, 200, { ok: true });
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || `${config.host}:${config.port}`}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      metrics.healthChecks += 1;
      await store.ping();
      sendJson(req, res, 200, {
        ok: true,
        service: "farm-auth-api",
        environment: config.nodeEnv,
        database: "postgres",
        port: config.port,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ready") {
      await store.ping();
      sendJson(req, res, 200, { ok: true, ready: true, uptimeSeconds: process.uptime() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/metrics") {
      await store.ping();
      sendJson(req, res, 200, {
        ok: true,
        metrics: {
          ...metrics,
          uptimeSeconds: Math.round(process.uptime()),
        },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      await handleRegister(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      await handleLogin(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      await handleLogout(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/forgot-password") {
      await handleForgotPassword(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
      await handleResetPassword(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/verify-email") {
      await handleVerifyEmail(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/resend-verification") {
      await handleResendVerification(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const user = await requireAuth(req);
      sendJson(req, res, 200, { ok: true, user });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/auth/profile") {
      const user = await requireAuth(req);
      await handleUpdateProfile(req, res, user);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      const user = await requireAuth(req);
      const row = await store.getStateByUserId(user.id);
      sendJson(req, res, 200, {
        ok: true,
        state: row ? row.state_json : {},
      });
      return;
    }

    if (req.method === "PUT" && url.pathname === "/api/state") {
      const user = await requireAuth(req);
      const body = await readBody(req);
      if (!body || typeof body.state !== "object") {
        throw Object.assign(new Error("الحالة المرسلة غير صالحة"), { statusCode: 400 });
      }
      await store.upsertState(user.id, body.state, nowIso());
      sendJson(req, res, 200, { ok: true });
      return;
    }

    sendJson(req, res, 404, { error: "المسار غير موجود" });
  } catch (error) {
    metrics.errorsTotal += 1;
    logEvent("error", "api-request-failed", {
      path: req.url,
      method: req.method,
      statusCode: error.statusCode || 500,
      error: error.message,
      code: error.code || null,
    });
    sendJson(req, res, error.statusCode || 500, {
      error: error.message || "حدث خطأ داخلي",
      code: error.code || undefined,
    });
  }
});

async function start() {
  await runMigrations(pool, MIGRATIONS_DIR);
  server.listen(config.port, config.host, () => {
    logEvent("info", "farm-api-started", {
      url: `http://${config.host}:${config.port}`,
      environment: config.nodeEnv,
      webBaseUrl: config.webBaseUrl,
    });
  });
}

async function stop(signal) {
  logEvent("info", "farm-api-stopping", { signal });
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => {
  stop("SIGINT").catch(() => process.exit(1));
});
process.on("SIGTERM", () => {
  stop("SIGTERM").catch(() => process.exit(1));
});

start().catch(async (error) => {
  logEvent("fatal", "farm-api-startup-failed", { error: error.message });
  try {
    await pool.end();
  } catch {
    // best effort
  }
  process.exit(1);
});
