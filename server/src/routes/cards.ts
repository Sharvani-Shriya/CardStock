import { Router } from "express";
import { Types } from "mongoose";
import { HttpError } from "../errors";
import { getClientId, parseWith } from "../http";
import { Card } from "../models/Card";
import { Column } from "../models/Column";
import { broadcast } from "../realtime";
import { createCardBody, idParams, moveCardBody, updateCardBody } from "../schemas";
import { toCardDto } from "../serializers";

export const cardsRouter = Router();

cardsRouter.post("/", async (req, res) => {
  const body = parseWith(createCardBody, req.body);

  const columnExists = await Column.exists({ _id: body.columnId });
  if (!columnExists) throw new HttpError(404, "Column not found");

  // "Last position + 1" instead of a count: a deleted card leaves a gap, and a
  // count would then collide with an existing position.
  const last = await Card.findOne({ columnId: body.columnId }).sort({ position: -1 });
  const card = await Card.create({
    columnId: body.columnId,
    title: body.title,
    description: body.description,
    position: last ? last.position + 1 : 0,
  });

  const dto = toCardDto(card);
  broadcast({ type: "card:created", card: dto }, getClientId(req));
  res.status(201).json(dto);
});

// Registered before "/:id" for readability only; the paths cannot clash
// because "/:id/move" has an extra segment.
cardsRouter.patch("/:id/move", async (req, res) => {
  const { id } = parseWith(idParams, req.params);
  const body = parseWith(moveCardBody, req.body);

  const card = await Card.findById(id);
  if (!card) throw new HttpError(404, "Card not found");

  const targetExists = await Column.exists({ _id: body.columnId });
  if (!targetExists) throw new HttpError(404, "Column not found");

  const sourceColumnId = card.columnId.toString();
  const targetColumnId = body.columnId;
  const targetObjectId = new Types.ObjectId(targetColumnId);

  // Build the target column's new order: everyone except the moving card, then
  // insert the moving card at the requested index. Clamping means "index 999"
  // simply means "the bottom" instead of being an error.
  const targetCards = await Card.find({
    columnId: targetColumnId,
    _id: { $ne: card._id },
  }).sort({ position: 1, _id: 1 });

  const insertAt = Math.min(body.position, targetCards.length);
  targetCards.splice(insertAt, 0, card);

  // Renumber so positions are exactly 0..n-1. One small update per changed card
  // keeps this easy to read; boards are small, so the extra round trips are cheap.
  // Concurrent moves are last-writer-wins, and sorting ties by _id keeps the
  // order deterministic if two writers ever collide.
  await Promise.all(
    targetCards.map(async (item, index) => {
      const unchanged =
        item.position === index && item.columnId.toString() === targetColumnId;
      if (unchanged) return;
      await Card.updateOne({ _id: item._id }, { columnId: targetObjectId, position: index });
    }),
  );

  // Moving to another column leaves a hole in the old one, so close it up.
  if (sourceColumnId !== targetColumnId) {
    const sourceCards = await Card.find({
      columnId: sourceColumnId,
      _id: { $ne: card._id },
    }).sort({ position: 1, _id: 1 });

    await Promise.all(
      sourceCards.map(async (item, index) => {
        if (item.position === index) return;
        await Card.updateOne({ _id: item._id }, { position: index });
      }),
    );
  }

  // Send back every card of the affected columns, so clients replace those
  // columns wholesale instead of patching individual positions.
  const affectedColumnIds =
    sourceColumnId === targetColumnId ? [targetColumnId] : [sourceColumnId, targetColumnId];

  const affectedCards = await Card.find({ columnId: { $in: affectedColumnIds } }).sort({
    position: 1,
    _id: 1,
  });
  const cards = affectedCards.map(toCardDto);

  broadcast({ type: "cards:reordered", columnIds: affectedColumnIds, cards }, getClientId(req));
  res.json({ cards });
});

cardsRouter.patch("/:id", async (req, res) => {
  const { id } = parseWith(idParams, req.params);
  const changes = parseWith(updateCardBody, req.body);

  const card = await Card.findByIdAndUpdate(id, changes, { new: true, runValidators: true });
  if (!card) throw new HttpError(404, "Card not found");

  const dto = toCardDto(card);
  broadcast({ type: "card:updated", card: dto }, getClientId(req));
  res.json(dto);
});

cardsRouter.delete("/:id", async (req, res) => {
  const { id } = parseWith(idParams, req.params);

  const card = await Card.findByIdAndDelete(id);
  if (!card) throw new HttpError(404, "Card not found");

  // Positions are left with a gap on purpose: order is all that matters, and
  // the next move in this column renumbers everything anyway.
  broadcast({ type: "card:deleted", id, columnId: card.columnId.toString() }, getClientId(req));
  res.status(204).end();
});
