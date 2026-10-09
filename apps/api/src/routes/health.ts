import { Router } from "express";
import type { ApiHealthResponse } from "@holiday-cost/shared";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const healthRouter = Router();

healthRouter.get("/", asyncHandler(async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    const health: ApiHealthResponse = { status: "ok", database: "connected" };
    response.json(health);
  } catch (error) {
    console.error("Database health check failed:", error);
    const health: ApiHealthResponse = { status: "error", database: "disconnected" };
    response.status(503).json(health);
  }
}));
