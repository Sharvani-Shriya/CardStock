import { Schema, Types, model } from "mongoose";

const boardSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
  },
  { timestamps: true },
);

export const Board = model("Board", boardSchema);
