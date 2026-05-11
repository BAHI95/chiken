const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env"), quiet: true });

const config = {
  environment: String(process.env.PUBLIC_ENVIRONMENT || process.env.NODE_ENV || "development").trim(),
  apiBaseUrl: String(
    process.env.PUBLIC_API_BASE_URL ||
      process.env.API_BASE_URL ||
      "http://127.0.0.1:8787/api",
  ).trim(),
  webBaseUrl: String(
    process.env.PUBLIC_WEB_BASE_URL ||
      process.env.WEB_BASE_URL ||
      "http://127.0.0.1:5500",
  ).trim(),
  supportEmail: String(process.env.PUBLIC_SUPPORT_EMAIL || process.env.SUPPORT_EMAIL || "support@example.com").trim(),
};

const targetFile = path.join(root, "js", "runtime-config.js");
const payload = `window.__FARM_RUNTIME_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`;
fs.writeFileSync(targetFile, payload, "utf8");
console.log(`[runtime-config] generated ${targetFile}`);
