const path = require("path");
const dotenv = require("dotenv");

const rootEnvPath = path.resolve(__dirname, "..", "..", "..", ".env");
dotenv.config({ path: rootEnvPath, quiet: true });

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function asNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function required(name, fallback = "") {
  const value = String(process.env[name] || fallback).trim();
  if (!value) throw new Error(`متغير البيئة ${name} مطلوب`);
  return value;
}

const nodeEnv = String(process.env.NODE_ENV || "development").trim().toLowerCase();
const isProduction = nodeEnv === "production";

const config = {
  nodeEnv,
  isProduction,
  host: String(process.env.HOST || "127.0.0.1").trim(),
  port: asNumber(process.env.PORT, 8787),
  sessionDays: asNumber(process.env.SESSION_DAYS, 30),
  sessionSecret: required(
    "SESSION_SECRET",
    isProduction ? "" : "dev-only-session-secret-change-me",
  ),
  databaseUrl: required("DATABASE_URL", isProduction ? "" : ""),
  databaseSsl: asBoolean(process.env.DATABASE_SSL, false),
  databasePoolMax: asNumber(process.env.DATABASE_POOL_MAX, 10),
  databaseIdleTimeoutMs: asNumber(process.env.DATABASE_IDLE_TIMEOUT_MS, 30_000),
  databaseConnectTimeoutMs: asNumber(process.env.DATABASE_CONNECT_TIMEOUT_MS, 10_000),
  webBaseUrl: required("WEB_BASE_URL", "http://127.0.0.1:5500"),
  appBaseUrl: String(process.env.APP_BASE_URL || process.env.WEB_BASE_URL || "http://127.0.0.1:5500").trim(),
  apiBaseUrl: String(process.env.API_BASE_URL || "http://127.0.0.1:8787/api").trim(),
  supportEmail: String(process.env.SUPPORT_EMAIL || "support@example.com").trim(),
  emailFrom: String(process.env.EMAIL_FROM || "").trim(),
  resendApiKey: String(process.env.RESEND_API_KEY || "").trim(),
  requireEmailVerification:
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === undefined
      ? isProduction
      : asBoolean(process.env.AUTH_REQUIRE_EMAIL_VERIFICATION, isProduction),
  passwordResetHours: asNumber(process.env.PASSWORD_RESET_HOURS, 2),
  verificationHours: asNumber(process.env.VERIFICATION_HOURS, 48),
  allowedOrigins: String(process.env.ALLOWED_ORIGINS || process.env.WEB_BASE_URL || "http://127.0.0.1:5500")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  rateLimitWindowMs: asNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  rateLimitMaxAuth: asNumber(process.env.RATE_LIMIT_MAX_AUTH, 25),
  backupDir: path.resolve(
    path.join(__dirname, "..", "..", ".."),
    String(process.env.BACKUP_DIR || "apps/api/backups").trim(),
  ),
  backupRetentionCount: asNumber(process.env.BACKUP_RETENTION_COUNT, 14),
};

if (config.isProduction && config.requireEmailVerification) {
  if (!config.emailFrom) throw new Error("EMAIL_FROM مطلوب في بيئة الإنتاج عند تفعيل التحقق بالبريد");
  if (!config.resendApiKey) throw new Error("RESEND_API_KEY مطلوب في بيئة الإنتاج عند تفعيل التحقق بالبريد");
}

module.exports = {
  config,
};
