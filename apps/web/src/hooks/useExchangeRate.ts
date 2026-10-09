import { useEffect, useState } from "react";
import type { ExchangeRate } from "@holiday-cost/shared";
import { apiRequest } from "../lib/api";

interface ExchangeRateState {
  exchangeRate: ExchangeRate | null;
  loading: boolean;
  error: string;
}

export function useExchangeRate(base: string, quote: string): ExchangeRateState {
  const [state, setState] = useState<ExchangeRateState>({
    exchangeRate: null,
    loading: false,
    error: "",
  });

  useEffect(() => {
    if (!base || !quote || base === quote) {
      setState({ exchangeRate: null, loading: false, error: "" });
      return;
    }

    let active = true;
    const controller = new AbortController();
    setState({ exchangeRate: null, loading: true, error: "" });

    void apiRequest<{ exchangeRate: ExchangeRate }>(
      `/api/currency/rate?base=${encodeURIComponent(base)}&quote=${encodeURIComponent(quote)}`,
      { signal: controller.signal },
    )
      .then(({ exchangeRate }) => {
        if (active) setState({ exchangeRate, loading: false, error: "" });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            exchangeRate: null,
            loading: false,
            error: error instanceof Error ? error.message : "Could not load the exchange rate.",
          });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [base, quote]);

  return state;
}
