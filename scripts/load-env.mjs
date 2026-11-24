// Load .env.local then .env (like `next dev` does) for plain Node scripts and tool configs.
// Existing environment variables always win (CI and Render set them directly).
import { existsSync } from "node:fs";

export function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file) && typeof process.loadEnvFile === "function") process.loadEnvFile(file);
  }
}
