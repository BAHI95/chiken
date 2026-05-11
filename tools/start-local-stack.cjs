const { spawn, spawnSync } = require("child_process");
const path = require("path");
const dotenv = require("dotenv");

const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env"), quiet: true });

function ensureDatabaseUrl() {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (databaseUrl) return;

  console.error("[api] DATABASE_URL is required. The local stack now runs on Postgres, not SQLite.");
  console.error("[api] Set DATABASE_URL first, then rerun `npm run dev:local-stack`.");
  process.exit(1);
}

function runStylesBuild() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const runtimeConfigResult = spawnSync(npmCommand, ["run", "runtime:config"], {
    cwd: root,
    shell: false,
    stdio: "inherit",
  });

  if (runtimeConfigResult.status !== 0) {
    console.error("[runtime-config] failed to generate runtime config.");
    process.exit(runtimeConfigResult.status || 1);
  }

  const result = spawnSync(npmCommand, ["run", "styles:build"], {
    cwd: root,
    shell: false,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error("[styles] failed to build Tailwind CSS bundle.");
    process.exit(result.status || 1);
  }
}

function start(name, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    shell: true,
    detached: false,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    console.log(`[${name}] exited with code ${code}`);
  });

  return child;
}

console.log("Starting local farm stack...");
ensureDatabaseUrl();
runStylesBuild();
start("api", "node", ["apps/api/server.cjs"]);
start("web", "node", ["tools/local-static-server.cjs", ".", "5500"]);
