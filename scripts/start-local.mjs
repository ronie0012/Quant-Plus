import { loadEnv } from "vite";

// The built Node server needs the same server-only settings as local development.
const env = loadEnv("production", process.cwd(), "");
for (const key of [
  "AGENT_SERVICE_URL",
  "AGENT_SERVICE_API_KEY",
  "LOCAL_DATA_FILE",
  "QUANT_PLUS_WORKER",
  "QUANT_PLUS_BOOK_PROVIDER",
  "INSFORGE_URL",
  "INSFORGE_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_CHAT_MODEL",
]) {
  if (process.env[key] === undefined && env[key] !== undefined) process.env[key] = env[key];
}
process.env.HOST = "127.0.0.1";
process.env.PORT ??= "3000";
await import("../.output/server/index.mjs");
