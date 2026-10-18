import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../errors";

// Runs when no route matched. Forwarding an HttpError keeps the response
// format identical to every other error.
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, "Route not found"));
};

// Express 5 forwards errors thrown (or rejected) inside async handlers here
// automatically, so route code never needs try/catch just to report errors.
// Express recognises error middleware by its four parameters, so `_next` must
// stay in the signature even though we never call it.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { message: err.message, details: err.details },
    });
    return;
  }

  // Errors raised by Express itself, such as malformed JSON in the body, carry
  // a 4xx status. Report them as the client's mistake rather than a crash.
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: { message: "Malformed request" } });
    return;
  }

  // Log the real cause for us, but never leak internals to the client.
  console.error(err);
  res.status(500).json({ error: { message: "Internal server error" } });
};
