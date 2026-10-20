import { Schema, Types, model } from "mongoose";

const columnSchema = new Schema(
  {
    // Every column belongs to exactly one user.  Queries always filter by
    // userId so one user can never see another's data.
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 100 },
    // Columns are ordered by this number. It only needs to sort correctly, so
    // gaps left by deleted columns are fine.
    position: { type: Number, required: true },
  },
  { timestamps: true },
);

export const Column = model("Column", columnSchema);
