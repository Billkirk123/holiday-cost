import { Router } from "express";
import type { Expense, ExpenseCategory, ExchangeRate, LocationSuggestion, Trip } from "@holiday-cost/shared";
import { convertAmountCents, isExpenseCategory, isUuid, parseAmountCents, parseDate, splitPerPersonCents, stringField } from "../domain.js";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { getExchangeRate } from "../services/currency.js";

interface TripRow {
  id: string;
  name: string;
  destination: string;
  location_id: string | null;
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
    locationId: row.location_id,
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

function locationFromRequest(value: unknown): LocationSuggestion | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;

  const fields = value as Record<string, unknown>;
  const providerPlaceId = stringField(fields.providerPlaceId, 255);
  const formatted = stringField(fields.formatted, 120);
  const city = stringField(fields.city, 120);
  const country = stringField(fields.country, 120);
  const countryCode = fields.countryCode === null
    ? null
    : typeof fields.countryCode === "string"
      ? fields.countryCode.toUpperCase()
      : undefined;
  const latitude = fields.latitude;
  const longitude = fields.longitude;

  if (
    !providerPlaceId || !formatted || !city || !country ||
    (countryCode !== null && (countryCode === undefined || !/^[A-Z]{2}$/.test(countryCode))) ||
    typeof latitude !== "number" || !Number.isFinite(latitude) ||
    latitude < -90 || latitude > 90 ||
    typeof longitude !== "number" || !Number.isFinite(longitude) ||
    longitude < -180 || longitude > 180
  ) {
    return undefined;
  }

  return { providerPlaceId, formatted, city, country, countryCode, latitude, longitude };
}

const tripSelect = `SELECT trips.id, trips.name, trips.destination, trips.location_id,
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
  const location = locationFromRequest(request.body?.location);
  const startDate = parseDate(request.body?.startDate);
  const endDate = parseDate(request.body?.endDate);
  const travelers = Number(request.body?.travelers);
  const currency = typeof request.body?.currency === "string"
    ? request.body.currency.toUpperCase()
    : "";

  if (
    !name || !destination || location === undefined ||
    (location && location.formatted !== destination) ||
    startDate === undefined || endDate === undefined ||
    !Number.isInteger(travelers) || travelers < 1 || travelers > 100 ||
    !/^[A-Z]{3}$/.test(currency) ||
    (startDate && endDate && endDate < startDate)
  ) {
    response.status(400).json({ error: "Check the trip details and try again." });
    return;
  }

  const result = await pool.query<TripRow>(
    `WITH saved_location AS (
       INSERT INTO locations (
         provider, provider_place_id, city, country, country_code, latitude, longitude
       )
       SELECT 'geoapify', $8, $9, $10, $11, $12, $13
       WHERE $8::text IS NOT NULL
       ON CONFLICT (provider_place_id) DO UPDATE SET
         city = EXCLUDED.city,
         country = EXCLUDED.country,
         country_code = EXCLUDED.country_code,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude
       RETURNING id
     )
     INSERT INTO trips (
       user_id, name, destination, location_id, start_date, end_date, travelers, currency
     )
     VALUES ($1, $2, $3, (SELECT id FROM saved_location), $4, $5, $6, $7)
     RETURNING id, name, destination, location_id, start_date::text, end_date::text,
       travelers, currency, 0::int AS expense_count, '0'::text AS total_cents`,
    [
      request.userId,
      name,
      destination,
      startDate,
      endDate,
      travelers,
      currency,
      location?.providerPlaceId ?? null,
      location?.city ?? null,
      location?.country ?? null,
      location?.countryCode ?? null,
      location?.latitude ?? null,
      location?.longitude ?? null,
    ],
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
