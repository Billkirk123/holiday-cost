import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  CurrencyOption,
  Expense,
  ExpenseCategory,
  Trip,
} from "@holiday-cost/shared";
import { useExchangeRate } from "../../hooks/useExchangeRate";
import { formatDateRange, formatMoney, categoryLabels } from "../../lib/format";

export interface ExpenseInput {
  name: string;
  category: ExpenseCategory;
  amount: string;
  currency: string;
}

interface TripDetailPageProps {
  trip: Trip;
  expenses: Expense[];
  currencies: CurrencyOption[];
  currencyListError: string;
  busy: boolean;
  onBack: () => void;
  onAddExpense: (expense: ExpenseInput) => Promise<boolean>;
}

function expenseIcon(category: ExpenseCategory): string {
  switch (category) {
    case "transport": return "↗";
    case "accommodation": return "⌂";
    case "food": return "✳";
    case "activities": return "☼";
    case "other": return "＋";
  }
}

export function TripDetailPage({
  trip,
  expenses,
  currencies,
  currencyListError,
  busy,
  onBack,
  onAddExpense,
}: TripDetailPageProps) {
  const [displayCurrency, setDisplayCurrency] = useState(trip.currency);
  const [expenseCurrency, setExpenseCurrency] = useState(trip.currency);
  const [expenseAmount, setExpenseAmount] = useState("");
  const displayRateState = useExchangeRate(trip.currency, displayCurrency);
  const expenseRateState = useExchangeRate(expenseCurrency, trip.currency);

  useEffect(() => {
    setDisplayCurrency(trip.currency);
    setExpenseCurrency(trip.currency);
    setExpenseAmount("");
  }, [trip.id, trip.currency]);

  const displayRate = displayCurrency === trip.currency
    ? 1
    : displayRateState.exchangeRate?.base === trip.currency &&
        displayRateState.exchangeRate.quote === displayCurrency
      ? displayRateState.exchangeRate.rate
      : undefined;
  const formatTripMoney = (cents: number) => formatMoney(
    displayRate === undefined ? cents : Math.round(cents * displayRate),
    displayRate === undefined ? trip.currency : displayCurrency,
  );
  const expenseConversionRate = expenseCurrency === trip.currency
    ? 1
    : expenseRateState.exchangeRate?.base === expenseCurrency &&
        expenseRateState.exchangeRate.quote === trip.currency
      ? expenseRateState.exchangeRate.rate
      : undefined;
  const amountNumber = Number(expenseAmount);
  const expensePreviewCents = expenseConversionRate !== undefined &&
      expenseAmount !== "" && Number.isFinite(amountNumber)
    ? Math.round(amountNumber * 100 * expenseConversionRate)
    : undefined;

  async function handleAddExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const added = await onAddExpense({
      name: String(form.get("name")),
      category: String(form.get("category")) as ExpenseCategory,
      amount: String(form.get("amount")),
      currency: String(form.get("currency")),
    });
    if (added) {
      formElement.reset();
      setExpenseAmount("");
      setExpenseCurrency(trip.currency);
    }
  }

  return (
    <section className="content-area">
      <button className="back-link" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> All trips
      </button>
      <div className="trip-heading">
        <div>
          <p className="eyebrow">{formatDateRange(trip.startDate, trip.endDate)}</p>
          <h1>{trip.name}</h1>
          <p className="trip-destination">
            {trip.destination} <span>·</span> {trip.travelers} {trip.travelers === 1 ? "traveller" : "travellers"}
          </p>
        </div>
        <span className="trip-currency">{trip.currency}</span>
      </div>

      <section className="currency-convert" aria-label="Display trip costs in another currency">
        <label htmlFor="display-currency">Display prices in</label>
        <select
          id="display-currency"
          value={displayCurrency}
          onChange={(event) => setDisplayCurrency(event.target.value)}
          disabled={currencies.length === 0}
        >
          {!currencies.some((currency) => currency.code === trip.currency) && (
            <option value={trip.currency}>{trip.currency}</option>
          )}
          {currencies.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.code} — {currency.name}
            </option>
          ))}
        </select>
        <p className="currency-rate-note" aria-live="polite">
          {currencyListError
            ? currencyListError
            : displayRateState.loading
              ? "Loading the daily reference rate…"
              : displayRateState.error
                ? `${displayRateState.error} Showing prices in ${trip.currency}.`
                : displayRateState.exchangeRate
                  ? <>1 {displayRateState.exchangeRate.base} = {displayRateState.exchangeRate.rate.toLocaleString(undefined, { maximumSignificantDigits: 7 })} {displayRateState.exchangeRate.quote} · Rate dated {displayRateState.exchangeRate.date}. Indicative rates from <a href="https://frankfurter.dev/" target="_blank" rel="noreferrer">Frankfurter</a>.</>
                  : "Showing prices in the trip currency."}
        </p>
      </section>

      <div className="summary-grid">
        <article className="summary-card summary-card--total">
          <span className="summary-label">Trip total</span>
          <strong>{formatTripMoney(trip.totalCents)}</strong>
          <span className="summary-foot">{trip.expenseCount} {trip.expenseCount === 1 ? "expense" : "expenses"} added</span>
        </article>
        <article className="summary-card">
          <span className="summary-label">Per person</span>
          <strong>{formatTripMoney(trip.perPersonCents)}</strong>
          <span className="summary-foot">Split between {trip.travelers} {trip.travelers === 1 ? "traveller" : "travellers"}</span>
        </article>
      </div>

      <div className="detail-grid">
        <section className="surface-card expense-list">
          <div className="section-heading">
            <div>
              <p className="eyebrow">The details</p>
              <h2>Trip expenses</h2>
            </div>
            <span className="count-badge">{expenses.length}</span>
          </div>
          {expenses.length === 0 ? (
            <div className="empty-expenses">
              <span className="empty-icon" aria-hidden="true">＋</span>
              <h3>No expenses yet</h3>
              <p>Add your first cost to start building your trip total.</p>
            </div>
          ) : (
            <ul className="expense-items">
              {expenses.map((expense) => (
                <li className="expense-item" key={expense.id}>
                  <span className={`expense-icon expense-icon--${expense.category}`} aria-hidden="true">
                    {expenseIcon(expense.category)}
                  </span>
                  <span className="expense-description">
                    <strong>{expense.name}</strong>
                    <span>
                      {categoryLabels[expense.category]}
                      {expense.inputCurrency !== trip.currency &&
                        ` · Rate to ${trip.currency} dated ${expense.exchangeRateDate}`}
                    </span>
                  </span>
                  <span className="expense-prices">
                    <strong className="expense-amount">
                      {formatMoney(expense.inputAmountCents, expense.inputCurrency)}
                    </strong>
                    {expense.inputCurrency !== (displayRate === undefined ? trip.currency : displayCurrency) && (
                      <small>≈ {formatTripMoney(expense.amountCents)}</small>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="surface-card add-expense">
          <p className="eyebrow">Add a cost</p>
          <h2>New expense</h2>
          <form className="form-stack" onSubmit={(event) => void handleAddExpense(event)}>
            <label>
              What’s it for?
              <input name="name" placeholder="e.g. Return flights" required maxLength={120} />
            </label>
            <label>
              Category
              <select name="category" defaultValue="transport">
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Currency
              <select
                name="currency"
                value={expenseCurrency}
                onChange={(event) => setExpenseCurrency(event.target.value)}
                required
              >
                {!currencies.some((currency) => currency.code === trip.currency) && (
                  <option value={trip.currency}>{trip.currency}</option>
                )}
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} — {currency.name}
                  </option>
                ))}
              </select>
              {currencyListError && (
                <span className="field-hint">
                  {currencyListError} Only the trip currency is available right now.
                </span>
              )}
            </label>
            <label>
              Amount ({expenseCurrency})
              <input
                name="amount"
                type="number"
                min="0.01"
                max="9999999.99"
                step="0.01"
                placeholder="0.00"
                value={expenseAmount}
                onChange={(event) => setExpenseAmount(event.target.value)}
                required
              />
            </label>
            {expenseCurrency !== trip.currency && (
              <p className="expense-conversion-preview" aria-live="polite">
                {expenseRateState.loading
                  ? "Loading the daily conversion rate…"
                  : expenseRateState.error
                    ? expenseRateState.error
                    : expensePreviewCents !== undefined && expenseRateState.exchangeRate
                      ? `Approximately ${formatMoney(expensePreviewCents, trip.currency)} in ${trip.currency} · rate dated ${expenseRateState.exchangeRate.date}`
                      : `The amount will be converted to ${trip.currency} when added.`}
              </p>
            )}
            <button className="button button--primary button--wide" type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add expense"} <span aria-hidden="true">＋</span>
            </button>
          </form>
          <p className="helper-copy">
            Add the full cost in its original currency. It will be converted to {trip.currency} for the trip total.
          </p>
        </section>
      </div>
    </section>
  );
}
