import { Router } from "express";
import { Card } from "../models/Card";
import { Column } from "../models/Column";
import { toCardDto, toColumnDto } from "../serializers";

export const boardRouter = Router();

// One request returns the whole board, so the client can load (or re-sync after
// a reconnect) with a single round trip.
boardRouter.get("/", async (_req, res) => {
  const [columns, cards] = await Promise.all([
    Column.find().sort({ position: 1, _id: 1 }),
    Card.find().sort({ position: 1, _id: 1 }),
  ]);

  res.json({
    columns: columns.map(toColumnDto),
    cards: cards.map(toCardDto),
  });
});
