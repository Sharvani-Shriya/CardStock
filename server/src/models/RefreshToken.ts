import { Schema, Types, model } from "mongoose";

// A refresh token is long-lived (7 days) and lives in an HttpOnly cookie.
// We never store the raw token — only its SHA-256 hash — so a database
// breach does not hand the attacker valid tokens.
//
// Family-based revocation: every token issued from the same login shares a
// familyId.  When a rotated-out (already-used) token is presented, the whole
// family is revoked immediately, which limits the blast radius of a stolen
// refresh token.
const refreshTokenSchema = new Schema({
  // SHA-256 hash of the raw token string so the plaintext never hits disk.
  tokenHash: { type: String, required: true, unique: true },

  userId: {
    type: Types.ObjectId,
    ref: "User",
    required: true,
    index: true,   // fast look-ups when revoking all tokens for a user
  },

  // All tokens that descend from one login share the same family id.  Reuse
  // of any older sibling immediately kills the whole family.
  familyId: { type: String, required: true, index: true },

  // Tokens expire on their own after REFRESH_TOKEN_TTL_DAYS but we keep the
  // expiresAt field so a scheduled job can prune stale rows without re-parsing
  // every token.  The TTL index below handles automatic deletion; no separate
  // field-level index is needed (it would be a duplicate).
  expiresAt: { type: Date, required: true },

  // Mark if this token has already been rotated (used).
  // If a token with isUsed=true is presented again, reuse is detected and the
  // entire family is revoked.
  isUsed: { type: Boolean, default: false },
});

// MongoDB TTL index: the database engine deletes expired documents
// automatically, so we don't need a cron job to clean up.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model("RefreshToken", refreshTokenSchema);
