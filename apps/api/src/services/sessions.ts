import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import type { PoolClient } from "pg";
import { config } from "../config.js";
import { pool } from "../db/pool.js";

export interface SessionUser {
  id: string;
  email: string;
}

export function readSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${config.sessionCookieName}=`));
  return cookie?.slice(config.sessionCookieName.length + 1);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  client: Pick<PoolClient, "query">,
  userId: string,
  response: Response,
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + config.sessionDurationMs);
  await client.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashSessionToken(token), userId, expiresAt],
  );
  setSessionCookie(response, token);
}

export function setSessionCookie(response: Response, token: string): void {
  const secure = config.isProduction ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${config.sessionCookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${config.sessionDurationMs / 1000}${secure}`,
  );
}

export function clearSessionCookie(response: Response): void {
  const secure = config.isProduction ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${config.sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  );
}

export async function findSessionUser(token: string): Promise<SessionUser | undefined> {
  const result = await pool.query<SessionUser>(
    `SELECT users.id, users.email
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW()`,
    [hashSessionToken(token)],
  );
  return result.rows[0];
}
