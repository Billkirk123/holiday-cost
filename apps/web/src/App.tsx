import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  AuthResponse,
  CurrencyOption,
  Expense,
  ExpenseCategory,
  ExchangeRate,
  Trip,
  User,
} from "@holiday-cost/shared";

const categoryLabels: Record<ExpenseCategory, string> = {
  transport: "Transport",
  accommodation: "Accommodation",
  food: "Food & drink",
  activities: "Activities",
  other: "Other",
};

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new Error("Could not reach the API. Check that the API and database are running.");
  }
  if (response.status === 204) return undefined as T;

  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Could not reach the API. Check that the API and database are running.");
  }
  const result = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? "Something went wrong. Please try again.");
  }
  return result;
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

function formatDateRange(startDate: string | null, endDate: string | null): string {
  if (!startDate && !endDate) return "Dates not set";
  const format = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  if (startDate && endDate) return `${format(startDate)} – ${format(endDate)}`;
    if (startDate) return `From ${format(startDate)}`;
    if (endDate) return `Until ${format(endDate)}`;
    return "Dates not set";
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState("");
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState("");
  const [currencyListError, setCurrencyListError] = useState("");
  const [expenseCurrency, setExpenseCurrency] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseRate, setExpenseRate] = useState<ExchangeRate | null>(null);
  const [expenseRateLoading, setExpenseRateLoading] = useState(false);
  const [expenseRateError, setExpenseRateError] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [showTripForm, setShowTripForm] = useState(false);
  const [pageError, setPageError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void apiRequest<{ user: User }>("/api/auth/me")
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch((error: unknown) => {
        if (active && error instanceof Error && !error.message.includes("sign in")) {
          setPageError(error.message);
        }
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadTrips = useCallback(async () => {
    const result = await apiRequest<{ trips: Trip[] }>("/api/trips");
    setTrips(result.trips);
  }, []);

  useEffect(() => {
    if (!user) {
      setCurrencies([]);
      setCurrencyListError("");
      return;
    }

    let active = true;
    void apiRequest<{ currencies: CurrencyOption[] }>("/api/currency/currencies")
      .then(({ currencies: options }) => {
        if (active) setCurrencies(options);
      })
      .catch((error: unknown) => {
        if (active) {
          setCurrencyListError(
            error instanceof Error ? error.message : "Could not load currency options.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setTrips([]);
      setSelectedTrip(null);
      setExpenses([]);
      return;
    }
    void loadTrips().catch((error: unknown) => {
      setPageError(error instanceof Error ? error.message : "Could not load trips.");
    });
  }, [user, loadTrips]);

  useEffect(() => {
    if (!user || !selectedTrip || !displayCurrency) {
      setExchangeRate(null);
      setRateLoading(false);
      setRateError("");
      return;
    }

    if (displayCurrency === selectedTrip.currency) {
      setExchangeRate(null);
      setRateLoading(false);
      setRateError("");
      return;
    }

    let active = true;
    const controller = new AbortController();
    setRateLoading(true);
    setRateError("");
    setExchangeRate(null);

    void apiRequest<{ exchangeRate: ExchangeRate }>(
      `/api/currency/rate?base=${selectedTrip.currency}&quote=${displayCurrency}`,
      { signal: controller.signal },
    )
      .then(({ exchangeRate: result }) => {
        if (active) setExchangeRate(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setRateError(
            error instanceof Error ? error.message : "Could not load the exchange rate.",
          );
        }
      })
      .finally(() => {
        if (active) setRateLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [user, selectedTrip, displayCurrency]);

  useEffect(() => {
    if (!user || !selectedTrip || !expenseCurrency || expenseCurrency === selectedTrip.currency) {
      setExpenseRate(null);
      setExpenseRateLoading(false);
      setExpenseRateError("");
      return;
    }

    let active = true;
    const controller = new AbortController();
    setExpenseRate(null);
    setExpenseRateLoading(true);
    setExpenseRateError("");

    void apiRequest<{ exchangeRate: ExchangeRate }>(
      `/api/currency/rate?base=${expenseCurrency}&quote=${selectedTrip.currency}`,
      { signal: controller.signal },
    )
      .then(({ exchangeRate: result }) => {
        if (active) setExpenseRate(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setExpenseRateError(
            error instanceof Error ? error.message : "Could not load the conversion rate.",
          );
        }
      })
      .finally(() => {
        if (active) setExpenseRateLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [user, selectedTrip, expenseCurrency]);

  async function openTrip(trip: Trip) {
    setPageError("");
    try {
      const result = await apiRequest<{ trip: Trip; expenses: Expense[] }>(
        `/api/trips/${trip.id}`,
      );
      setSelectedTrip(result.trip);
      setDisplayCurrency(result.trip.currency);
      setExpenseCurrency(result.trip.currency);
      setExpenseAmount("");
      setExpenses(result.expenses);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not open this trip.");
    }
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setPageError("");
    try {
      const result = await apiRequest<AuthResponse>(`/api/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      setUser(result.user);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setPageError("");
    try {
      const result = await apiRequest<{ trip: Trip }>("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          destination: form.get("destination"),
          startDate: form.get("startDate"),
          endDate: form.get("endDate"),
          travelers: Number(form.get("travelers")),
          currency: form.get("currency"),
        }),
      });
      await loadTrips();
      setShowTripForm(false);
      await openTrip(result.trip);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not create this trip.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTrip) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setPageError("");
    try {
      await apiRequest<{ expense: Expense }>(
        `/api/trips/${selectedTrip.id}/expenses`,
        {
          method: "POST",
          body: JSON.stringify({
            name: form.get("name"),
            category: form.get("category"),
            amount: form.get("amount"),
            currency: form.get("currency"),
          }),
        },
      );
      formElement.reset();
      setExpenseAmount("");
      setExpenseCurrency(selectedTrip.currency);
      await openTrip(selectedTrip);
      await loadTrips();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not add this expense.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await apiRequest<void>("/api/auth/logout", { method: "POST" });
      setUser(null);
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return <main className="loading-screen">Getting your trip plans ready…</main>;
  }

  if (!user) {
    return (
      <main className="auth-layout">
        <section className="auth-story">
          <a className="brand brand--light" href="/">
            <span className="brand-mark">T</span> The Holiday calculator
          </a>
          <div className="auth-story-copy">
            <p className="eyebrow">Trip planning</p>
            <h1>Trips and expenses</h1>
            <p>Create trip plans, record expenses, and view costs per person.</p>
          </div>
        </section>
        <section className="auth-panel">
          <div className="auth-form-wrap">
            <p className="eyebrow">{authMode === "register" ? "Get started" : "Welcome back"}</p>
            <h2>{authMode === "register" ? "Create your account" : "Sign in to your account"}</h2>
            <p className="form-intro">
              {authMode === "register"
                ? "Create an account to save and manage your trips."
                : "Sign in to view and manage your trips."}
            </p>
            {pageError && <p className="notice notice--error" role="alert">{pageError}</p>}
            <form className="form-stack" onSubmit={handleAuth}>
              <label>
                Email address
                <input name="email" type="email" autoComplete="email" required maxLength={254} />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete={authMode === "register" ? "new-password" : "current-password"}
                  required
                  minLength={authMode === "register" ? 8 : undefined}
                  maxLength={72}
                />
                {authMode === "register" && <span className="field-hint">At least 8 characters</span>}
              </label>
              <button className="button button--primary button--wide" type="submit" disabled={busy}>
                {busy ? "Please wait…" : authMode === "register" ? "Create account" : "Sign in"}
                <span aria-hidden="true">↗</span>
              </button>
            </form>
            <p className="form-switch">
              {authMode === "register" ? "Already have an account?" : "Need an account?"}{" "}
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "register" ? "login" : "register");
                  setPageError("");
                }}
              >
                {authMode === "register" ? "Sign in" : "Create an account"}
              </button>
            </p>
          </div>
        </section>
      </main>
    );
  }

  const displayName = user.email.split("@")[0];
  const rateIsCurrent = selectedTrip && exchangeRate &&
    exchangeRate.base === selectedTrip.currency &&
    exchangeRate.quote === displayCurrency;
  const displayRate = selectedTrip && displayCurrency === selectedTrip.currency
    ? 1
    : rateIsCurrent
      ? exchangeRate.rate
      : undefined;
  const displayedCurrency = displayRate === undefined
    ? selectedTrip?.currency ?? ""
    : displayCurrency;
  const formatTripMoney = (cents: number) => formatMoney(
    displayRate === undefined ? cents : Math.round(cents * displayRate),
    displayedCurrency,
  );
  const expenseConversionRate = selectedTrip && expenseCurrency === selectedTrip.currency
    ? 1
    : expenseRate?.base === expenseCurrency && expenseRate.quote === selectedTrip?.currency
      ? expenseRate.rate
      : undefined;
  const expensePreviewCents = expenseConversionRate !== undefined && expenseAmount
    ? Math.round(Number(expenseAmount) * 100 * expenseConversionRate)
    : undefined;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => {
          event.preventDefault();
          setSelectedTrip(null);
          setPageError("");
        }}>
          <span className="brand-mark">T</span> The Holiday calculator
        </a>
        <div className="account-actions">
          <span className="account-email">{user.email}</span>
          <button className="button button--quiet" type="button" disabled={busy} onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      {pageError && <p className="notice notice--error page-notice" role="alert">{pageError}</p>}

      {selectedTrip ? (
        <section className="content-area">
          <button className="back-link" type="button" onClick={() => {
            setSelectedTrip(null);
            setPageError("");
          }}>
            <span aria-hidden="true">←</span> All trips
          </button>
          <div className="trip-heading">
            <div>
              <p className="eyebrow">{formatDateRange(selectedTrip.startDate, selectedTrip.endDate)}</p>
              <h1>{selectedTrip.name}</h1>
              <p className="trip-destination">{selectedTrip.destination} <span>·</span> {selectedTrip.travelers} {selectedTrip.travelers === 1 ? "traveller" : "travellers"}</p>
            </div>
            <span className="trip-currency">{selectedTrip.currency}</span>
          </div>

          <section className="currency-convert" aria-label="Display trip costs in another currency">
            <label htmlFor="display-currency">Display prices in</label>
            <select
              id="display-currency"
              value={displayCurrency || selectedTrip.currency}
              onChange={(event) => setDisplayCurrency(event.target.value)}
              disabled={currencies.length === 0}
            >
              {!currencies.some((currency) => currency.code === selectedTrip.currency) && (
                <option value={selectedTrip.currency}>{selectedTrip.currency}</option>
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
                : rateLoading
                  ? "Loading the daily reference rate…"
                  : rateError
                    ? `${rateError} Showing prices in ${selectedTrip.currency}.`
                    : rateIsCurrent
                      ? <>1 {exchangeRate.base} = {exchangeRate.rate.toLocaleString(undefined, { maximumSignificantDigits: 7 })} {exchangeRate.quote} · Rate dated {exchangeRate.date}. Indicative rates from <a href="https://frankfurter.dev/" target="_blank" rel="noreferrer">Frankfurter</a>.</>
                      : "Showing prices in the trip currency."}
            </p>
          </section>

          <div className="summary-grid">
            <article className="summary-card summary-card--total">
              <span className="summary-label">Trip total</span>
              <strong>{formatTripMoney(selectedTrip.totalCents)}</strong>
              <span className="summary-foot">{selectedTrip.expenseCount} {selectedTrip.expenseCount === 1 ? "expense" : "expenses"} added</span>
            </article>
            <article className="summary-card">
              <span className="summary-label">Per person</span>
              <strong>{formatTripMoney(selectedTrip.perPersonCents)}</strong>
              <span className="summary-foot">Split between {selectedTrip.travelers} {selectedTrip.travelers === 1 ? "traveller" : "travellers"}</span>
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
                        {expense.category === "transport" ? "↗" :
                          expense.category === "accommodation" ? "⌂" :
                            expense.category === "food" ? "✳" :
                              expense.category === "activities" ? "☼" : "＋"}
                      </span>
                      <span className="expense-description">
                        <strong>{expense.name}</strong>
                        <span>
                          {categoryLabels[expense.category]}
                          {expense.inputCurrency !== selectedTrip.currency &&
                            ` · Rate to ${selectedTrip.currency} dated ${expense.exchangeRateDate}`}
                        </span>
                      </span>
                      <span className="expense-prices">
                        <strong className="expense-amount">
                          {formatMoney(expense.inputAmountCents, expense.inputCurrency)}
                        </strong>
                        {expense.inputCurrency !== displayedCurrency && (
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
              <form className="form-stack" onSubmit={handleAddExpense}>
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
                    value={expenseCurrency || selectedTrip.currency}
                    onChange={(event) => setExpenseCurrency(event.target.value)}
                    required
                  >
                    {!currencies.some((currency) => currency.code === selectedTrip.currency) && (
                      <option value={selectedTrip.currency}>{selectedTrip.currency}</option>
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
                  Amount ({expenseCurrency || selectedTrip.currency})
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
                {expenseCurrency !== selectedTrip.currency && (
                  <p className="expense-conversion-preview" aria-live="polite">
                    {expenseRateLoading
                      ? "Loading the daily conversion rate…"
                      : expenseRateError
                        ? expenseRateError
                        : expensePreviewCents !== undefined && expenseRate
                          ? `Approximately ${formatMoney(expensePreviewCents, selectedTrip.currency)} in ${selectedTrip.currency} · rate dated ${expenseRate.date}`
                          : `The amount will be converted to ${selectedTrip.currency} when added.`}
                  </p>
                )}
                <button className="button button--primary button--wide" type="submit" disabled={busy}>
                  {busy ? "Adding…" : "Add expense"} <span aria-hidden="true">＋</span>
                </button>
              </form>
              <p className="helper-copy">Add the full cost in its original currency. It will be converted to {selectedTrip.currency} for the trip total.</p>
            </section>
          </div>
        </section>
      ) : (
        <section className="content-area dashboard">
          <div className="dashboard-heading">
            <div>
              <p className="eyebrow">Dashboard</p>
              <h1>Good to see you, {displayName}.</h1>
              <p className="dashboard-subtitle">All your plans, and what they’ll really cost.</p>
            </div>
            <button className="button button--primary" type="button" onClick={() => {
              setShowTripForm(true);
              setPageError("");
            }}>
              Plan a trip <span aria-hidden="true">＋</span>
            </button>
          </div>

          <div className="section-heading trips-heading">
            <div>
              <p className="eyebrow">Your plans</p>
              <h2>Current trips</h2>
            </div>
            <span className="trip-count">{trips.length} {trips.length === 1 ? "trip" : "trips"}</span>
          </div>

          {trips.length === 0 ? (
            <section className="empty-trips">
              <span className="empty-icon" aria-hidden="true">✈</span>
              <h2>No trips yet</h2>
              <p>Create a trip, add expenses, and see the total and cost per person.</p>
              <button className="button button--primary" type="button" onClick={() => setShowTripForm(true)}>
                Create your first trip <span aria-hidden="true">＋</span>
              </button>
            </section>
          ) : (
            <div className="trip-grid">
              {trips.map((trip) => (
                <button className="trip-card" type="button" key={trip.id} onClick={() => void openTrip(trip)}>
                  <span className="trip-card-top">
                    <span className="trip-card-destination">{trip.destination}</span>
                    <span className="trip-arrow" aria-hidden="true">↗</span>
                  </span>
                  <strong className="trip-card-name">{trip.name}</strong>
                  <span className="trip-card-dates">{formatDateRange(trip.startDate, trip.endDate)}</span>
                  <span className="trip-card-rule" />
                  <span className="trip-card-totals">
                    <span><small>Trip total</small><strong>{formatMoney(trip.totalCents, trip.currency)}</strong></span>
                    <span><small>Per person</small><strong>{formatMoney(trip.perPersonCents, trip.currency)}</strong></span>
                  </span>
                  <span className="trip-card-foot">{trip.travelers} {trip.travelers === 1 ? "traveller" : "travellers"} · {trip.expenseCount} {trip.expenseCount === 1 ? "expense" : "expenses"}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="app-footer">
        <span>The Holiday calculator</span>
        <span>Trip plans and expenses</span>
      </footer>

      {showTripForm && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowTripForm(false);
        }}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="trip-form-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">New trip</p>
                <h2 id="trip-form-title">Plan a new trip</h2>
              </div>
              <button className="modal-close" type="button" aria-label="Close" onClick={() => setShowTripForm(false)}>×</button>
            </div>
            <form className="form-stack" onSubmit={handleCreateTrip}>
              <label>
                Trip name
                <input name="name" placeholder="e.g. Summer in Sicily" required maxLength={100} />
              </label>
              <label>
                Destination
                <input name="destination" placeholder="e.g. Palermo, Italy" required maxLength={120} />
              </label>
              <div className="form-row">
                <label>
                  Start date
                  <input name="startDate" type="date" />
                </label>
                <label>
                  End date
                  <input name="endDate" type="date" />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Travellers
                  <input name="travelers" type="number" min="1" max="100" defaultValue="2" required />
                </label>
                <label>
                  Currency
                  <input name="currency" defaultValue="GBP" pattern="[A-Za-z]{3}" maxLength={3} title="Enter a 3-letter currency code, e.g. GBP" required />
                </label>
              </div>
              <p className="helper-copy">All expenses for this trip use the same currency.</p>
              <div className="modal-actions">
                <button className="button button--quiet" type="button" onClick={() => setShowTripForm(false)}>Cancel</button>
                <button className="button button--primary" type="submit" disabled={busy}>
                  {busy ? "Creating…" : "Create trip"} <span aria-hidden="true">↗</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
