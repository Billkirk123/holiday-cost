import type { RequestHandler } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "./async-handler.js";
import {
  clearSessionCookie,
  findSessionUser,
  hashSessionToken,
  readSessionToken,
} from "../services/sessions.js";

export const requireAuth: RequestHandler = asyncHandler(async (request, response, next) => {
  const token = readSessionToken(request.headers.cookie);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  const user = await findSessionUser(token);
  if (!user) {
    clearSessionCookie(response);
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  request.userId = user.id;
  next();
});

export async function deleteSession(token: string): Promise<void> {
  await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashSessionToken(token)]);
}
