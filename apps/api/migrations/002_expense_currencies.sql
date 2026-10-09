ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS input_currency char(3),
  ADD COLUMN IF NOT EXISTS input_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(20, 10),
  ADD COLUMN IF NOT EXISTS exchange_rate_date date;

UPDATE expenses
SET input_currency = trips.currency,
    input_amount_cents = expenses.amount_cents,
    exchange_rate = 1,
    exchange_rate_date = expenses.created_at::date
FROM trips
WHERE trips.id = expenses.trip_id
  AND (
    expenses.input_currency IS NULL OR
    expenses.input_amount_cents IS NULL OR
    expenses.exchange_rate IS NULL OR
    expenses.exchange_rate_date IS NULL
  );

ALTER TABLE expenses
  ALTER COLUMN input_currency SET NOT NULL,
  ALTER COLUMN input_amount_cents SET NOT NULL,
  ALTER COLUMN exchange_rate SET NOT NULL,
  ALTER COLUMN exchange_rate_date SET NOT NULL,
  ADD CONSTRAINT expenses_input_currency_format
    CHECK (input_currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT expenses_input_amount_cents_positive
    CHECK (input_amount_cents BETWEEN 1 AND 999999999),
  ADD CONSTRAINT expenses_exchange_rate_positive
    CHECK (exchange_rate > 0);
