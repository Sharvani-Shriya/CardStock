import { Schema, model } from "mongoose";

const columnSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    // Columns are ordered by this number. It only needs to sort correctly, so
    // gaps left by deleted columns are fine.
    position: { type: Number, required: true },
  },
  { timestamps: true },
);

export const Column = model("Column", columnSchema);
