/**
 * Minimal ambient declaration for process.env on Cloudflare Workers.
 * The nodejs_compat flag populates process.env from vars/secrets at
 * runtime; this keeps TypeScript happy without pulling in @types/node.
 */
declare const process: { env: Record<string, string | undefined> };
