// A single error type for "the client did something wrong" cases. The error
// middleware turns it into the { error: { message, details? } } response shape,
// so route handlers can simply `throw new HttpError(404, "...")`.
export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
