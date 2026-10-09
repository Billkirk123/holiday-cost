import { useCallback, useEffect, useState } from "react";
import type {
  AuthResponse,
  CurrencyOption,
  Expense,
  Trip,
  User,
} from "@holiday-cost/shared";
import { apiRequest } from "./lib/api";
import type { Credentials } from "./features/auth/AuthPage";
import { AuthPage } from "./features/auth/AuthPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { NewTripModal } from "./features/dashboard/NewTripModal";
import type { NewTripInput } from "./features/dashboard/NewTripModal";
import { TripDetailPage } from "./features/trips/TripDetailPage";
import type { ExpenseInput } from "./features/trips/TripDetailPage";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currencyListError, setCurrencyListError] = useState("");
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
          setCurrencyListError(errorMessage(error, "Could not load currency options."));
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
      setPageError(errorMessage(error, "Could not load trips."));
    });
  }, [user, loadTrips]);

  async function handleAuth(
    mode: "login" | "register",
    credentials: Credentials,
  ): Promise<void> {
    setBusy(true);
    setPageError("");
    try {
      const result = await apiRequest<AuthResponse>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      setUser(result.user);
    } catch (error) {
      setPageError(errorMessage(error, "Could not sign in."));
    } finally {
      setBusy(false);
    }
  }

  async function openTrip(trip: Trip): Promise<void> {
    setPageError("");
    try {
      const result = await apiRequest<{ trip: Trip; expenses: Expense[] }>(
        `/api/trips/${trip.id}`,
      );
      setSelectedTrip(result.trip);
      setExpenses(result.expenses);
    } catch (error) {
      setPageError(errorMessage(error, "Could not open this trip."));
    }
  }

  async function handleCreateTrip(trip: NewTripInput): Promise<boolean> {
    setBusy(true);
    setPageError("");
    try {
      const result = await apiRequest<{ trip: Trip }>("/api/trips", {
        method: "POST",
        body: JSON.stringify(trip),
      });
      await loadTrips();
      setShowTripForm(false);
      await openTrip(result.trip);
      return true;
    } catch (error) {
      setPageError(errorMessage(error, "Could not create this trip."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleAddExpense(expense: ExpenseInput): Promise<boolean> {
    if (!selectedTrip) return false;
    const trip = selectedTrip;
    setBusy(true);
    setPageError("");
    try {
      await apiRequest<{ expense: Expense }>(`/api/trips/${trip.id}/expenses`, {
        method: "POST",
        body: JSON.stringify(expense),
      });
      await openTrip(trip);
      await loadTrips();
      return true;
    } catch (error) {
      setPageError(errorMessage(error, "Could not add this expense."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout(): Promise<void> {
    setBusy(true);
    try {
      await apiRequest<void>("/api/auth/logout", { method: "POST" });
      setUser(null);
      setPageError("");
    } catch (error) {
      setPageError(errorMessage(error, "Could not sign out."));
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return <main className="loading-screen">Getting your trip plans ready…</main>;
  }

  if (!user) {
    return <AuthPage busy={busy} error={pageError} onSubmit={handleAuth} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            setSelectedTrip(null);
            setPageError("");
          }}
        >
          <span className="brand-mark">T</span> The Holiday calculator
        </a>
        <div className="account-actions">
          <span className="account-email">{user.email}</span>
          <button
            className="button button--quiet"
            type="button"
            disabled={busy}
            onClick={() => void handleLogout()}
          >
            Sign out
          </button>
        </div>
      </header>

      {pageError && <p className="notice notice--error page-notice" role="alert">{pageError}</p>}

      {selectedTrip ? (
        <TripDetailPage
          trip={selectedTrip}
          expenses={expenses}
          currencies={currencies}
          currencyListError={currencyListError}
          busy={busy}
          onBack={() => {
            setSelectedTrip(null);
            setPageError("");
          }}
          onAddExpense={handleAddExpense}
        />
      ) : (
        <DashboardPage
          email={user.email}
          trips={trips}
          onCreateTrip={() => {
            setShowTripForm(true);
            setPageError("");
          }}
          onOpenTrip={(trip) => void openTrip(trip)}
        />
      )}

      <footer className="app-footer">
        <span>The Holiday calculator</span>
        <span>Trip plans and expenses</span>
      </footer>

      {showTripForm && (
        <NewTripModal
          busy={busy}
          onClose={() => setShowTripForm(false)}
          onSubmit={handleCreateTrip}
        />
      )}
    </main>
  );
}

export default App;
