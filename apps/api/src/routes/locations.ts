import { Router } from "express";
import { stringField } from "../domain.js";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { GeoapifyNotConfiguredError, suggestLocations } from "../services/geoapify.js";

export const locationsRouter = Router();

locationsRouter.use(requireAuth);

locationsRouter.get("/suggest", asyncHandler(async (request, response) => {
  const query = stringField(request.query.q, 100);
  if (!query || query.length < 2) {
    response.status(400).json({ error: "Enter at least two characters to search for a destination." });
    return;
  }

  try {
    response.json({ suggestions: await suggestLocations(query) });
  } catch (error) {
    if (error instanceof GeoapifyNotConfiguredError) {
      response.status(503).json({ error: error.message });
      return;
    }
    console.error("Could not load destination suggestions from Geoapify:", error);
    response.status(502).json({ error: "Destination suggestions are temporarily unavailable." });
  }
}));
