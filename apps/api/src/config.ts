import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

export const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(apiDirectory, ".env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set to start the API. Copy apps/api/.env.example to apps/api/.env.",
  );
}

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid port number.");
}

export const config = {
  databaseUrl,
  port,
  isProduction: process.env.NODE_ENV === "production",
  sessionCookieName: "holiday_cost_session",
  sessionDurationMs: 30 * 24 * 60 * 60 * 1000,
  frankfurterApi: "https://api.frankfurter.dev/v2",
};
