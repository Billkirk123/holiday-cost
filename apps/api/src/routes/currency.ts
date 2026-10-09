import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { getExchangeRate, listCurrencies } from "../services/currency.js";

export const currencyRouter = Router();

currencyRouter.use(requireAuth);

currencyRouter.get("/currencies", asyncHandler(async (_request, response) => {
  try {
    response.json({ currencies: await listCurrencies() });
  } catch (error) {
    console.error("Could not load currency list from Frankfurter:", error);
    response.status(502).json({ error: "Currency options are temporarily unavailable." });
  }
}));

currencyRouter.get("/rate", asyncHandler(async (request, response) => {
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
