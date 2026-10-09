import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  console.error("API request failed:", error);
  if (response.headersSent) return;
  response.status(500).json({ error: "Something went wrong. Please try again." });
};
