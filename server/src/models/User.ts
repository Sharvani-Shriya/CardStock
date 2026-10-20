import { Schema, model } from "mongoose";

// Passwords are stored as bcrypt hashes, never in plain text.
// The unique index on email lets MongoDB enforce the constraint at the
// database level even if two concurrent registrations race past the
// application-level check.
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,  // normalise before storing so "User@Example.com" and "user@example.com" are the same account
      trim: true,
      maxlength: 254,   // RFC 5321 maximum address length
    },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export const User = model("User", userSchema);
