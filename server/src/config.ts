import "dotenv/config";
import { z } from "zod";

// Validate the environment once at startup so a missing variable fails loudly
// here instead of causing a confusing error deep inside a request later.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  CLIENT_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Access tokens are short-lived (15 min) JWTs signed with this secret.
  // Must be a long random string; the server refuses to start in production
  // without it.
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),

  // Refresh tokens are long-lived (7 day) opaque strings whose SHA-256 hash
  // is stored in MongoDB.  A separate secret means a compromised access secret
  // cannot be used to forge refresh tokens.
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  // When true, the refresh cookie gets the Secure flag (HTTPS only).  Set this
  // to "true" in every environment that is served over HTTPS.
  COOKIE_SECURE: z.coerce.boolean().default(false),
});

// In production every secret must be explicitly provided; fall back values
// would silently weaken security on a misconfigured deployment.
const productionGuard =
  process.env["NODE_ENV"] === "production"
    ? envSchema.refine(
        (e) => e.JWT_ACCESS_SECRET.length >= 32 && e.JWT_REFRESH_SECRET.length >= 32,
        { message: "JWT secrets must be at least 32 characters in production" },
      )
    : envSchema;

const result = productionGuard.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration:");
  console.error(result.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = result.data;
