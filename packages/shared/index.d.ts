export interface ApiHealthResponse {
  status: "ok" | "error";
  database: "connected" | "disconnected";
}

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  user: User;
}

export type ExpenseCategory =
  | "transport"
  | "accommodation"
  | "food"
  | "activities"
  | "other";

export interface Expense {
  id: string;
  tripId: string;
  name: string;
  category: ExpenseCategory;
  /** Amount converted to the trip's currency for trip totals. */
  amountCents: number;
  inputAmountCents: number;
  inputCurrency: string;
  exchangeRate: number;
  exchangeRateDate: string;
  createdAt: string;
}

export interface Trip {
  id: string;
  name: string;
  destination: string;
  locationId: string | null;
  startDate: string | null;
  endDate: string | null;
  travelers: number;
  currency: string;
  expenseCount: number;
  totalCents: number;
  perPersonCents: number;
}

export interface LocationSuggestion {
  providerPlaceId: string;
  formatted: string;
  city: string;
  country: string;
  countryCode: string | null;
  latitude: number;
  longitude: number;
}

export interface CurrencyOption {
  code: string;
  name: string;
}

export interface ExchangeRate {
  date: string;
  base: string;
  quote: string;
  rate: number;
}
