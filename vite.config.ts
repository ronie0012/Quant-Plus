// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Load only these settings into the development server's environment. They
// are never defined in the browser bundle. Production uses host secrets.
const serverEnv = loadEnv(process.env["NODE_ENV"] ?? "development", process.cwd(), "");
for (const key of [
  "AGENT_SERVICE_URL",
  "AGENT_SERVICE_API_KEY",
  "LOCAL_DATA_FILE",
  "QUANT_PLUS_WORKER",
  "QUANT_PLUS_BOOK_PROVIDER",
  "INSFORGE_URL",
  "INSFORGE_API_KEY",
  "INSFORGE_ANON_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_CHAT_MODEL",
]) {
  if (process.env[key] === undefined && serverEnv[key] !== undefined)
    process.env[key] = serverEnv[key];
}

export default defineConfig({
  // Local persistence uses the Node filesystem; no cloud worker target yet.
  nitro: { preset: "node-server" },
  vite: { server: { host: "127.0.0.1" } },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
