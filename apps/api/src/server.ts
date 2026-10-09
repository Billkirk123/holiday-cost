import { createApp } from "./app.js";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { pool } from "./db/pool.js";

async function start(): Promise<void> {
  try {
    await runMigrations();
    const server = createApp().listen(config.port);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    console.log(`The Holiday calculator API listening on http://localhost:${config.port}`);
  } catch (error) {
    console.error("Could not start the API:", error);
    try {
      await pool.end();
    } catch (closeError) {
      console.error("Could not close the database pool after startup failed:", closeError);
    }
    process.exitCode = 1;
  }
}

void start();
