import { Schema, model } from "mongoose";

const cardSchema = new Schema(
  {
    columnId: { type: Schema.Types.ObjectId, ref: "Column", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // No `required` here: Mongoose treats an empty string as "missing" for
    // required strings, and an empty description is perfectly valid.
    description: { type: String, default: "", maxlength: 2000 },
    // Index of the card inside its column (0 = top). Moves renumber the whole
    // column so the values stay contiguous.
    position: { type: Number, required: true },
  },
  { timestamps: true },
);

// Almost every query is "all cards of one column, in order".
cardSchema.index({ columnId: 1, position: 1 });

export const Card = model("Card", cardSchema);
