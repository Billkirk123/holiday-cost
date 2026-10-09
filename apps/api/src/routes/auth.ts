import { Router } from "express";
import bcrypt from "bcryptjs";
import type { AuthResponse } from "@holiday-cost/shared";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth, deleteSession } from "../middleware/require-auth.js";
import { stringField } from "../domain.js";
import {
  clearSessionCookie,
  createSession,
  readSessionToken,
} from "../services/sessions.js";

interface UserRow {
  id: string;
  email: string;
}

export const authRouter = Router();

authRouter.post("/register", asyncHandler(async (request, response) => {
  const email = stringField(request.body?.email, 254)?.toLowerCase();
  const password = request.body?.password;
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    response.status(400).json({
      error: "Enter a valid email and a password between 8 and 72 characters.",
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<UserRow>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash],
    );
    await createSession(client, result.rows[0].id, response);
    await client.query("COMMIT");
    const auth: AuthResponse = { user: result.rows[0] };
    response.status(201).json(auth);
  } catch (error) {
    await client.query("ROLLBACK");
    if (
      typeof error === "object" && error !== null &&
      "code" in error && error.code === "23505"
    ) {
      response.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    throw error;
  } finally {
    client.release();
  }
}));

authRouter.post("/login", asyncHandler(async (request, response) => {
  const email = stringField(request.body?.email, 254)?.toLowerCase();
  const password = request.body?.password;
  if (!email || typeof password !== "string" || Buffer.byteLength(password, "utf8") > 72) {
    response.status(400).json({ error: "Enter your email and password." });
    return;
  }

  const result = await pool.query<UserRow & { password_hash: string }>(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [email],
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    response.status(401).json({ error: "Email or password is incorrect." });
    return;
  }

  const client = await pool.connect();
  try {
    await createSession(client, user.id, response);
  } finally {
    client.release();
  }
  const auth: AuthResponse = { user: { id: user.id, email: user.email } };
  response.json(auth);
}));

authRouter.get("/me", requireAuth, asyncHandler(async (request, response) => {
  const result = await pool.query<UserRow>(
    "SELECT id, email FROM users WHERE id = $1",
    [request.userId],
  );
  response.json({ user: result.rows[0] });
}));

authRouter.post("/logout", asyncHandler(async (request, response) => {
  const token = readSessionToken(request.headers.cookie);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await deleteSession(token);
  }
  clearSessionCookie(response);
  response.status(204).end();
}));
