import { z } from "zod";

// A Mongo ObjectId is 24 hex characters. Checking the format up front turns a
// malformed id into a clean 400 instead of a Mongoose CastError (a 500).
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Must be a valid id");

export const idParams = z.object({ id: objectId });

const columnTitle = z.string().trim().min(1, "Title is required").max(100);
const cardTitle = z.string().trim().min(1, "Title is required").max(200);
const cardDescription = z.string().trim().max(2000);

// .strict() rejects unknown keys, so a typo like "titel" is reported instead of
// being silently ignored.
export const createColumnBody = z.object({ title: columnTitle }).strict();

export const updateColumnBody = z.object({ title: columnTitle }).strict();

export const createCardBody = z
  .object({
    columnId: objectId,
    title: cardTitle,
    description: cardDescription.default(""),
  })
  .strict();

export const updateCardBody = z
  .object({
    title: cardTitle.optional(),
    description: cardDescription.optional(),
  })
  .strict()
  .refine((body) => body.title !== undefined || body.description !== undefined, {
    message: "Provide at least one of: title, description",
  });

export const moveCardBody = z
  .object({
    columnId: objectId,
    // The index inside the target column. The server clamps it to the valid
    // range, so any non-negative integer is acceptable input.
    position: z.number().int().min(0),
  })
  .strict();

// The id the client sends in the X-Client-Id header (and ?clientId= on the
// WebSocket URL) so the server can skip the sender when broadcasting.
export const clientIdSchema = z.string().min(1).max(100);

// The only message a WebSocket client is allowed to send: an app-level ping.
// Browsers cannot send protocol-level ping frames, so this is their keep-alive.
export const clientMessageSchema = z.object({ type: z.literal("ping") }).strict();

// Auth schemas -----------------------------------------------------------

// A minimal password policy: long enough to resist brute force, short enough
// not to frustrate users.  Complexity rules are deliberately omitted; length
// is the strongest single factor.
const password = z.string().min(8, "Password must be at least 8 characters").max(72);
// 72 chars is bcrypt's effective maximum; anything longer is silently truncated
// by the algorithm, which could confuse users who change only the tail.

export const registerBody = z
  .object({
    email: z.string().email("Must be a valid email address").max(254),
    password,
  })
  .strict();

export const loginBody = z
  .object({
    email: z.string().email("Must be a valid email address").max(254),
    password,
  })
  .strict();

export const boardIdParams = z.object({ boardId: objectId });
export const boardAndIdParams = z.object({ boardId: objectId, id: objectId });
export const createBoardBody = z.object({ title: z.string().trim().min(1, "Title is required").max(100) }).strict();
export const updateBoardBody = z.object({ title: z.string().trim().min(1, "Title is required").max(100) }).strict();
export const wsTicketBody = z.object({ boardId: objectId }).strict();
