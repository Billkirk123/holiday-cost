import { Router } from "express";
import type { Expense, ExpenseCategory, ExchangeRate, Trip } from "@holiday-cost/shared";
import { convertAmountCents, isExpenseCategory, isUuid, parseAmountCents, parseDate, splitPerPersonCents, stringField } from "../domain.js";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { getExchangeRate } from "../services/currency.js";

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
    perPersonCents: splitPerPersonCents(totalCents, row.travelers),
  };
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

const tripSelect = `SELECT trips.id, trips.name, trips.destination,
       trips.start_date::text, trips.end_date::text, trips.travelers, trips.currency,
       COUNT(expenses.id)::int AS expense_count,
       COALESCE(SUM(expenses.amount_cents), 0)::text AS total_cents
     FROM trips
     LEFT JOIN expenses ON expenses.trip_id = trips.id`;

export const tripsRouter = Router();

tripsRouter.use(requireAuth);

tripsRouter.get("/", asyncHandler(async (request, response) => {
  const result = await pool.query<TripRow>(
    `${tripSelect}
     WHERE trips.user_id = $1
     GROUP BY trips.id
     ORDER BY trips.start_date ASC NULLS LAST, trips.created_at DESC`,
    [request.userId],
  );
  response.json({ trips: result.rows.map(tripFromRow) });
}));

tripsRouter.post("/", asyncHandler(async (request, response) => {
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

tripsRouter.get("/:tripId", asyncHandler(async (request, response) => {
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

tripsRouter.post("/:tripId/expenses", asyncHandler(async (request, response) => {
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
  let tripAmountCents: number;
  try {
    tripAmountCents = convertAmountCents(inputAmountCents, storedRate);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
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
