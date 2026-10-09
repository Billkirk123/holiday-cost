import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import { Pool, type PoolClient } from "pg";
import bcrypt from "bcryptjs";
import type {
  ApiHealthResponse,
  AuthResponse,
  CurrencyOption,
  Expense,
  ExpenseCategory,
  ExchangeRate,
  Trip,
} from "@holiday-cost/shared";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(apiDirectory, ".env") });

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

const pool = new Pool({ connectionString: databaseUrl });
const app = express();
const sessionCookieName = "holiday_cost_session";
const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;
const frankfurterApi = "https://api.frankfurter.dev/v2";
const categories: ExpenseCategory[] = [
  "transport",
  "accommodation",
  "food",
  "activities",
  "other",
];
const currencyCacheTtlMs = 24 * 60 * 60 * 1000;
const rateCacheTtlMs = 60 * 60 * 1000;
let currencyCache: { expiresAt: number; currencies: CurrencyOption[] } | undefined;
const rateCache = new Map<string, { expiresAt: number; rate: ExchangeRate }>();

interface FrankfurterRate {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

interface AuthenticatedRequest extends Request {
  userId?: string;
}

interface UserRow {
  id: string;
  email: string;
}

interface TripRow {
  id: string;
  name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  travelers: number;
  currency: string;
  expense_count: number;
  total_cents: string;
}

interface ExpenseRow {
  id: string;
  trip_id: string;
  name: string;
  category: ExpenseCategory;
  amount_cents: string;
  input_amount_cents: string;
  input_currency: string;
  exchange_rate: string;
  exchange_rate_date: string;
  created_at: Date;
}

function expenseFromRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    tripId: row.trip_id,
    name: row.name,
    category: row.category,
    amountCents: Number(row.amount_cents),
    inputAmountCents: Number(row.input_amount_cents),
    inputCurrency: row.input_currency,
    exchangeRate: Number(row.exchange_rate),
    exchangeRateDate: row.exchange_rate_date,
    createdAt: row.created_at.toISOString(),
  };
}

function asyncHandler(
  handler: (request: AuthenticatedRequest, response: Response, next: NextFunction) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request as AuthenticatedRequest, response, next).catch(next);
  };
}

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;

  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie?.slice(name.length + 1);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && categories.includes(value as ExpenseCategory);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function fetchFrankfurter(path: string): Promise<unknown> {
  const response = await fetch(`${frankfurterApi}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Frankfurter returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<unknown>;
}

async function getExchangeRate(base: string, quote: string): Promise<ExchangeRate> {
  if (base === quote) {
    return {
      date: new Date().toISOString().slice(0, 10),
      base,
      quote,
      rate: 1,
    };
  }

  const cacheKey = `${base}:${quote}`;
  const cached = rateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  const result: unknown = await fetchFrankfurter(
    `/rate/${encodeURIComponent(base.toLowerCase())}/${encodeURIComponent(quote.toLowerCase())}`,
  );
  if (
    typeof result !== "object" || result === null ||
    !("date" in result) || typeof result.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(result.date) ||
    !("base" in result) || result.base !== base ||
    !("quote" in result) || result.quote !== quote ||
    !("rate" in result) || typeof result.rate !== "number" ||
    !Number.isFinite(result.rate) || result.rate <= 0
  ) {
    throw new Error("Frankfurter returned an invalid exchange rate.");
  }

  const exchangeRate: ExchangeRate = {
    date: result.date,
    base,
    quote,
    rate: result.rate,
  };
  rateCache.set(cacheKey, {
    expiresAt: Date.now() + rateCacheTtlMs,
    rate: exchangeRate,
  });
  return exchangeRate;
}

function parseAmountCents(value: unknown): number | undefined {
  const amountText = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : typeof value === "string"
      ? value.trim()
      : "";
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(amountText);
  if (!match) return undefined;

  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents >= 1 && cents <= 999_999_999 ? cents : undefined;
}

function setSessionCookie(response: Response, token: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionDurationMs / 1000}${secure}`,
  );
}

function clearSessionCookie(response: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  );
}

async function createSession(
  client: Pick<PoolClient, "query">,
  userId: string,
  response: Response,
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  await client.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashToken(token), userId, expiresAt],
  );
  setSessionCookie(response, token);
}

const requireAuth = asyncHandler(async (request, response, next) => {
  const token = readCookie(request, sessionCookieName);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  const result = await pool.query<UserRow>(
    `SELECT users.id, users.email
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW()`,
    [hashToken(token)],
  );
  if (result.rowCount !== 1) {
    clearSessionCookie(response);
    response.status(401).json({ error: "Please sign in to continue." });
    return;
  }

  request.userId = result.rows[0].id;
  next();
});

function stringField(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : undefined;
}

function parseDate(value: unknown): string | null | undefined {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

function tripFromRow(row: TripRow): Trip {
  const totalCents = Number(row.total_cents);
  return {
    id: row.id,
    name: row.name,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    travelers: row.travelers,
    currency: row.currency,
    expenseCount: Number(row.expense_count),
    totalCents,
    perPersonCents: Math.round(totalCents / row.travelers),
  };
}

const tripSelect = `SELECT trips.id, trips.name, trips.destination,
       trips.start_date::text, trips.end_date::text, trips.travelers, trips.currency,
       COUNT(expenses.id)::int AS expense_count,
       COALESCE(SUM(expenses.amount_cents), 0)::text AS total_cents
     FROM trips
     LEFT JOIN expenses ON expenses.trip_id = trips.id`;

app.use(express.json({ limit: "16kb" }));

app.get("/api/health", asyncHandler(async (_request, response) => {
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

app.get("/api/currency/currencies", requireAuth, asyncHandler(async (_request, response) => {
  if (currencyCache && currencyCache.expiresAt > Date.now()) {
    response.json({ currencies: currencyCache.currencies });
    return;
  }

  try {
    const result: unknown = await fetchFrankfurter("/currencies");
    if (!Array.isArray(result)) {
      throw new Error("Frankfurter returned an invalid currency list.");
    }
    const currencies = result.map((item: unknown) => {
      if (
        typeof item !== "object" || item === null ||
        !("iso_code" in item) || typeof item.iso_code !== "string" ||
        !/^[A-Z]{3}$/.test(item.iso_code) ||
        !("name" in item) || typeof item.name !== "string"
      ) {
        throw new Error("Frankfurter returned an invalid currency entry.");
      }
      return { code: item.iso_code, name: item.name };
    }).sort((left, right) => left.name.localeCompare(right.name));

    currencyCache = { expiresAt: Date.now() + currencyCacheTtlMs, currencies };
    response.json({ currencies });
  } catch (error) {
    console.error("Could not load currency list from Frankfurter:", error);
    response.status(502).json({ error: "Currency options are temporarily unavailable." });
  }
}));

app.get("/api/currency/rate", requireAuth, asyncHandler(async (request, response) => {
  const base = request.query.base;
  const quote = request.query.quote;
  if (
    typeof base !== "string" || !/^[A-Z]{3}$/.test(base) ||
    typeof quote !== "string" || !/^[A-Z]{3}$/.test(quote)
  ) {
    response.status(400).json({ error: "Enter valid three-letter currency codes." });
    return;
  }

  try {
    response.json({ exchangeRate: await getExchangeRate(base, quote) });
  } catch (error) {
    console.error(`Could not load ${base}/${quote} rate from Frankfurter:`, error);
    response.status(502).json({ error: "The exchange rate is temporarily unavailable." });
  }
}));

app.post("/api/auth/register", asyncHandler(async (request, response) => {
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
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      response.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    throw error;
  } finally {
    client.release();
  }
}));

app.post("/api/auth/login", asyncHandler(async (request, response) => {
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

app.get("/api/auth/me", requireAuth, asyncHandler(async (request, response) => {
  const result = await pool.query<UserRow>(
    "SELECT id, email FROM users WHERE id = $1",
    [request.userId],
  );
  response.json({ user: result.rows[0] });
}));

app.post("/api/auth/logout", asyncHandler(async (request, response) => {
  const token = readCookie(request, sessionCookieName);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  clearSessionCookie(response);
  response.status(204).end();
}));

app.get("/api/trips", requireAuth, asyncHandler(async (request, response) => {
  const result = await pool.query<TripRow>(
    `${tripSelect}
     WHERE trips.user_id = $1
     GROUP BY trips.id
     ORDER BY trips.start_date ASC NULLS LAST, trips.created_at DESC`,
    [request.userId],
  );
  response.json({ trips: result.rows.map(tripFromRow) });
}));

app.post("/api/trips", requireAuth, asyncHandler(async (request, response) => {
  const name = stringField(request.body?.name, 100);
  const destination = stringField(request.body?.destination, 120);
  const startDate = parseDate(request.body?.startDate);
  const endDate = parseDate(request.body?.endDate);
  const travelers = Number(request.body?.travelers);
  const currency = typeof request.body?.currency === "string"
    ? request.body.currency.toUpperCase()
    : "";

  if (
    !name || !destination || startDate === undefined || endDate === undefined ||
    !Number.isInteger(travelers) || travelers < 1 || travelers > 100 ||
    !/^[A-Z]{3}$/.test(currency) ||
    (startDate && endDate && endDate < startDate)
  ) {
    response.status(400).json({ error: "Check the trip details and try again." });
    return;
  }

  const result = await pool.query<TripRow>(
    `INSERT INTO trips (user_id, name, destination, start_date, end_date, travelers, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, destination, start_date::text, end_date::text, travelers, currency,
       0::int AS expense_count, '0'::text AS total_cents`,
    [request.userId, name, destination, startDate, endDate, travelers, currency],
  );
  response.status(201).json({ trip: tripFromRow(result.rows[0]) });
}));

app.get("/api/trips/:tripId", requireAuth, asyncHandler(async (request, response) => {
  const tripId = request.params.tripId;
  if (typeof tripId !== "string" || !isUuid(tripId)) {
    response.status(404).json({ error: "Trip not found." });
    return;
  }
  const tripResult = await pool.query<TripRow>(
    `${tripSelect}
     WHERE trips.id = $1 AND trips.user_id = $2
     GROUP BY trips.id`,
    [tripId, request.userId],
  );
  if (tripResult.rowCount !== 1) {
    response.status(404).json({ error: "Trip not found." });
    return;
  }

  const expenseResult = await pool.query<ExpenseRow>(
    `SELECT id, trip_id, name, category, amount_cents::text,
       input_amount_cents::text, input_currency,
       exchange_rate::text, exchange_rate_date::text, created_at
     FROM expenses WHERE trip_id = $1 ORDER BY created_at DESC`,
    [tripId],
  );
  response.json({
    trip: tripFromRow(tripResult.rows[0]),
    expenses: expenseResult.rows.map(expenseFromRow),
  });
}));

app.post("/api/trips/:tripId/expenses", requireAuth, asyncHandler(async (request, response) => {
  const tripId = request.params.tripId;
  if (typeof tripId !== "string" || !isUuid(tripId)) {
    response.status(404).json({ error: "Trip not found." });
    return;
  }
  const name = stringField(request.body?.name, 120);
  const category: unknown = request.body?.category;
  const inputAmountCents = parseAmountCents(request.body?.amount);
  const inputCurrency = typeof request.body?.currency === "string"
    ? request.body.currency.toUpperCase()
    : "";

  if (
    !name || !isExpenseCategory(category) ||
    inputAmountCents === undefined || !/^[A-Z]{3}$/.test(inputCurrency)
  ) {
    response.status(400).json({
      error: "Enter a description, a valid category, amount, and three-letter currency.",
    });
    return;
  }

  const tripResult = await pool.query<{ id: string; currency: string }>(
    "SELECT id, currency FROM trips WHERE id = $1 AND user_id = $2",
    [tripId, request.userId],
  );
  if (tripResult.rowCount !== 1) {
    response.status(404).json({ error: "Trip not found." });
    return;
  }

  const tripCurrency = tripResult.rows[0].currency;
  let exchangeRate: ExchangeRate;
  try {
    exchangeRate = await getExchangeRate(inputCurrency, tripCurrency);
  } catch (error) {
    console.error(`Could not convert ${inputCurrency} to ${tripCurrency}:`, error);
    response.status(502).json({ error: "The currency conversion is temporarily unavailable." });
    return;
  }

  const storedRate = Number(exchangeRate.rate.toFixed(10));
  const tripAmountCents = Math.round(inputAmountCents * storedRate);
  if (tripAmountCents < 1 || tripAmountCents > 999_999_999) {
    response.status(400).json({ error: "The converted amount is outside the supported range." });
    return;
  }

  const result = await pool.query<ExpenseRow>(
    `INSERT INTO expenses (
       trip_id, name, category, amount_cents, input_amount_cents,
       input_currency, exchange_rate, exchange_rate_date
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, trip_id, name, category, amount_cents::text,
       input_amount_cents::text, input_currency, exchange_rate::text,
       exchange_rate_date::text, created_at`,
    [
      tripId,
      name,
      category,
      tripAmountCents,
      inputAmountCents,
      inputCurrency,
      storedRate,
      exchangeRate.date,
    ],
  );
  response.status(201).json({ expense: expenseFromRow(result.rows[0]) });
}));

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error("API request failed:", error);
  if (response.headersSent) return;
  response.status(500).json({ error: "Something went wrong. Please try again." });
});

async function start(): Promise<void> {
  try {
    await pool.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const migrationsDirectory = resolve(apiDirectory, "migrations");
    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
      .sort();

    for (const name of migrationFiles) {
      const applied = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE name = $1",
        [name],
      );
      if (applied.rowCount) continue;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(await readFile(resolve(migrationsDirectory, name), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        console.log(`Applied database migration ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    app.listen(port, () => {
      console.log(`The Holiday calculator API listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Could not start the API:", error);
    await pool.end();
    process.exitCode = 1;
  }
}

void start();
