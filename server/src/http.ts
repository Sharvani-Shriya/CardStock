import type { Request } from "express";
import type { z } from "zod";
import { HttpError } from "./errors";
import { clientIdSchema } from "./schemas";

// Validates untrusted input (body, params) and throws a 400 with Zod's field
// errors if it is wrong. Handlers can then trust the returned, typed value.
export function parseWith<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, "Validation failed", result.error.flatten());
  }
  return result.data;
}

// Reads the sender's id from the X-Client-Id header. It is optional: requests
// without it (curl, tests) are still valid and are simply broadcast to everyone.
export function getClientId(req: Request): string | undefined {
  const parsed = clientIdSchema.safeParse(req.get("x-client-id"));
  return parsed.success ? parsed.data : undefined;
}
