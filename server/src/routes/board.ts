import { Router } from "express";
import { requireAuth } from "../middleware/authenticate.js";
import { Card } from "../models/Card.js";
import { Column } from "../models/Column.js";
import { toCardDto, toColumnDto } from "../serializers.js";

export const boardRouter = Router();

// One request returns the whole board for the authenticated user, so the
// client can load (or re-sync after a reconnect) with a single round trip.
// Filtering by userId ensures one user never sees another's data.
boardRouter.get("/", requireAuth, async (req, res) => {
  // requireAuth guarantees req.user is set.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;

  const [columns, cards] = await Promise.all([
    Column.find({ userId }).sort({ position: 1, _id: 1 }),
    Card.find({ userId }).sort({ position: 1, _id: 1 }),
  ]);

  res.json({
    columns: columns.map(toColumnDto),
    cards: cards.map(toCardDto),
  });
});
