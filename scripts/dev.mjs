#!/usr/bin/env bun
/**
 * Run the whole stack locally: `bun run dev` from the repo root.
 *
 * Starts the Worker (wrangler dev) and the UI (vite), streams both logs with a
 * prefix, waits until both answer, then opens a browser. Ctrl-C stops both.
 *
 * Two preflight checks run first, because both failure modes produce errors
 * that point somewhere other than the cause:
 *
 *  1. Port conflicts. This machine also runs the bigmini Docker stacks, and
 *     wrangler's default port (8787) belongs to the Bookshelf container. Both
 *     processes bind successfully — Docker takes *:8787, workerd takes
 *     127.0.0.1 — so requests land on whichever won, and the API intermittently
 *     answers with Bookshelf's HTML. Hence the move to 8014, which is the
 *     bigmini PORTS.md dev band for backends.
 *  2. An unseeded local D1, which 500s every data route while /health stays
 *     green. See scripts/seed-local-d1.mjs.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = Number(process.env.API_PORT ?? 8014);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
const UI_URL = `http://localhost:${WEB_PORT}`;

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function die(msg) {
  console.error(`\n${c.red}✗${c.reset} ${msg}\n`);
  process.exit(1);
}

// ── Preflight: ports ───────────────────────────────────

function portOwner(port) {
  const r = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });
  const lines = (r.stdout || "").trim().split("\n").slice(1);
  if (!lines.length || !lines[0]) return null;
  return [...new Set(lines.map((l) => l.split(/\s+/)[0]))].join(", ");
}

for (const [port, name, varName] of [
  [API_PORT, "API", "API_PORT"],
  [WEB_PORT, "UI", "WEB_PORT"],
]) {
  const owner = portOwner(port);
  if (owner) {
    die(
      `${name} port ${port} is already in use by: ${owner}\n\n` +
        `  Stop it, or pick another port:  ${varName}=<port> bun run dev\n` +
        `  Check ~/code/largemarge/bigMini/PORTS.md before choosing one.`
    );
  }
}

// ── Preflight: local D1 ────────────────────────────────

if (!existsSync(join(root, "api", ".wrangler", ".seeded"))) {
  die(
    `Local D1 has not been seeded.\n\n` +
      `  Without it /health returns 200 but every data route fails with\n` +
      `  "Failed query: select ... from users" — the replica has no tables.\n\n` +
      `  Fix (takes about a minute, once):  bun run db:local:setup`
  );
}

// ── Start both processes ───────────────────────────────

const procs = [];

function start(name, color, cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd: join(root, cwd), env: process.env });
  const prefix = `${color}[${name}]${c.reset} `;
  const pipe = (stream) => {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(prefix + line + "\n");
    });
  };
  pipe(p.stdout);
  pipe(p.stderr);
  p.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(`${prefix}${c.red}exited (${signal ?? code})${c.reset}`);
    shutdown(code ?? 1);
  });
  procs.push(p);
  return p;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) p.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(
  `${c.dim}api → http://localhost:${API_PORT}   ui → ${UI_URL}${c.reset}\n`
);

// `bun run` (not npx) so each side resolves its own node_modules. npx walks up
// and out of the repo: it picked up Vite from ~/code/streaming, which then
// refused to serve its own client because the path is outside ui/.
start("api", c.cyan, "bun", ["run", "dev", "--port", String(API_PORT)], "api");
start("ui", c.magenta, "bun", ["run", "dev", "--port", String(WEB_PORT), "--strictPort"], "ui");

// ── Wait for both, then open a browser ─────────────────

async function waitFor(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (shuttingDown) return false;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const [apiUp, uiUp] = await Promise.all([
  waitFor(`http://localhost:${API_PORT}/health`),
  waitFor(UI_URL),
]);

if (shuttingDown) {
  // stopped while starting up
} else if (apiUp && uiUp) {
  console.log(`\n${c.green}✓${c.reset} both up — opening ${UI_URL}\n`);
  spawn("open", [UI_URL], { stdio: "ignore", detached: true }).unref();
} else {
  const which = [!apiUp && "api", !uiUp && "ui"].filter(Boolean).join(" and ");
  console.log(
    `\n${c.yellow}!${c.reset} ${which} did not come up in time — not opening a browser. ` +
      `Logs above.\n`
  );
}
