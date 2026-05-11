const { config } = require("../lib/env.cjs");

async function main() {
  const url = `${config.apiBaseUrl.replace(/\/$/, "")}/health`;
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || `health check failed for ${url}`);
  }
  console.log(`[farm-api] health check OK: ${url}`);
}

main().catch((error) => {
  console.error(`[farm-api] health check failed: ${error.message}`);
  process.exit(1);
});
