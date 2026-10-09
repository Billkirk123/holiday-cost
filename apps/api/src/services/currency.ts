import type { CurrencyOption, ExchangeRate } from "@holiday-cost/shared";
import { config } from "../config.js";

const currencyCacheTtlMs = 24 * 60 * 60 * 1000;
const rateCacheTtlMs = 60 * 60 * 1000;
let currencyCache: { expiresAt: number; currencies: CurrencyOption[] } | undefined;
const rateCache = new Map<string, { expiresAt: number; rate: ExchangeRate }>();

async function fetchFrankfurter(path: string): Promise<unknown> {
  const response = await fetch(`${config.frankfurterApi}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Frankfurter returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<unknown>;
}

export async function listCurrencies(): Promise<CurrencyOption[]> {
  if (currencyCache && currencyCache.expiresAt > Date.now()) {
    return currencyCache.currencies;
  }

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
  return currencies;
}

export async function getExchangeRate(base: string, quote: string): Promise<ExchangeRate> {
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
