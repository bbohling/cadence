/// <reference types="vite/client" />

/**
 * Type declarations for Vite environment variables.
 *
 * Any env var prefixed with VITE_ is exposed to the client.
 * Declare them here so TypeScript knows about them.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
