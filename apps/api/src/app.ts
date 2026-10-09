import express from "express";
import { authRouter } from "./routes/auth.js";
import { currencyRouter } from "./routes/currency.js";
import { healthRouter } from "./routes/health.js";
import { tripsRouter } from "./routes/trips.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "16kb" }));
  app.use("/api/health", healthRouter);
  app.use("/api/currency", currencyRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/trips", tripsRouter);
  app.use(errorHandler);

  return app;
}
