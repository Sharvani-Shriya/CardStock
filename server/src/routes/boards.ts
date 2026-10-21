import { Router } from "express";
import { Types } from "mongoose";
import { HttpError } from "../errors.js";
import { getClientId, parseWith } from "../http.js";
import { requireAuth } from "../middleware/authenticate.js";
import { Board } from "../models/Board.js";
import { Card } from "../models/Card.js";
import { Column } from "../models/Column.js";
import { broadcast } from "../realtime.js";
import {
  boardAndIdParams,
  boardIdParams,
  createBoardBody,
  createCardBody,
  createColumnBody,
  idParams,
  moveCardBody,
  updateBoardBody,
  updateCardBody,
  updateColumnBody,
} from "../schemas.js";
import { toBoardDto, toCardDto, toColumnDto } from "../serializers.js";

export const boardsRouter = Router();

// All board routes require authentication
boardsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/boards — list all boards owned by the user
// ---------------------------------------------------------------------------
boardsRouter.get("/", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const boards = await Board.find({ userId }).sort({ createdAt: -1, _id: -1 });

  // If a user has no boards yet, seed a default board so they're ready to go
  if (boards.length === 0) {
    const defaultBoard = await Board.create({
      userId,
      title: "My Board",
    });
    // Link any unassigned legacy columns of this user to this board
    await Column.updateMany({ userId, boardId: { $exists: false } }, { boardId: defaultBoard._id });
    res.json([toBoardDto(defaultBoard)]);
    return;
  }

  res.json(boards.map(toBoardDto));
});

// ---------------------------------------------------------------------------
// POST /api/boards — create a new board
// ---------------------------------------------------------------------------
boardsRouter.post("/", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const body = parseWith(createBoardBody, req.body);

  const board = await Board.create({
    userId,
    title: body.title,
  });

  res.status(201).json(toBoardDto(board));
});

// ---------------------------------------------------------------------------
// GET /api/boards/:boardId — fetch full board details (board, columns, cards)
// ---------------------------------------------------------------------------
boardsRouter.get("/:boardId", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { boardId } = parseWith(boardIdParams, req.params);

  const board = await Board.findOne({ _id: boardId, userId });
  if (!board) throw new HttpError(404, "Board not found");

  const columns = await Column.find({
    userId,
    $or: [{ boardId }, { boardId: { $exists: false } }],
  }).sort({ position: 1, _id: 1 });

  const columnIds = columns.map((col) => col._id);
  const cards = await Card.find({
    userId,
    columnId: { $in: columnIds },
  }).sort({ position: 1, _id: 1 });

  res.json({
    board: toBoardDto(board),
    columns: columns.map(toColumnDto),
    cards: cards.map(toCardDto),
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/boards/:boardId — rename board
// ---------------------------------------------------------------------------
boardsRouter.patch("/:boardId", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { boardId } = parseWith(boardIdParams, req.params);
  const body = parseWith(updateBoardBody, req.body);

  const board = await Board.findOneAndUpdate(
    { _id: boardId, userId },
    { title: body.title },
    { new: true },
  );
  if (!board) throw new HttpError(404, "Board not found");

  res.json(toBoardDto(board));
});

// ---------------------------------------------------------------------------
// DELETE /api/boards/:boardId — delete board and cascade delete its columns & cards
// ---------------------------------------------------------------------------
boardsRouter.delete("/:boardId", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { boardId } = parseWith(boardIdParams, req.params);

  const board = await Board.findOne({ _id: boardId, userId });
  if (!board) throw new HttpError(404, "Board not found");

  const columns = await Column.find({ userId, boardId });
  const columnIds = columns.map((c) => c._id);

  if (columnIds.length > 0) {
    await Card.deleteMany({ userId, columnId: { $in: columnIds } });
  }
  await Column.deleteMany({ userId, boardId });
  await Board.deleteOne({ _id: boardId });

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Columns under /api/boards/:boardId/columns
// ---------------------------------------------------------------------------

boardsRouter.post("/:boardId/columns", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { boardId } = parseWith(boardIdParams, req.params);
  const body = parseWith(createColumnBody, req.body);

  const boardExists = await Board.exists({ _id: boardId, userId });
  if (!boardExists) throw new HttpError(404, "Board not found");

  const last = await Column.findOne({ userId, boardId }).sort({ position: -1 });
  const column = await Column.create({
    userId,
    boardId,
    title: body.title,
    position: last ? last.position + 1 : 0,
  });

  const dto = toColumnDto(column);
  broadcast({ type: "column:created", column: dto }, getClientId(req), boardId);
  res.status(201).json(dto);
});

boardsRouter.patch("/:boardId/columns/:id", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { boardId, id } = parseWith(boardAndIdParams, req.params);
  const body = parseWith(updateColumnBody, req.body);

  const column = await Column.findOneAndUpdate(
    { _id: id, userId },
    { title: body.title },
    { new: true },
  );
  if (!column) throw new HttpError(404, "Column not found");

  const dto = toColumnDto(column);
  broadcast({ type: "column:updated", column: dto }, getClientId(req), boardId);
  res.json(dto);
});

boardsRouter.delete("/:boardId/columns/:id", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { boardId, id } = parseWith(boardAndIdParams, req.params);

  const column = await Column.findOneAndDelete({ _id: id, userId });
  if (!column) throw new HttpError(404, "Column not found");

  await Card.deleteMany({ columnId: id, userId });
  broadcast({ type: "column:deleted", id }, getClientId(req), boardId);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Cards under /api/boards/:boardId/cards
// ---------------------------------------------------------------------------

boardsRouter.post("/:boardId/cards", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { boardId } = parseWith(boardIdParams, req.params);
  const body = parseWith(createCardBody, req.body);

  const columnExists = await Column.exists({ _id: body.columnId, userId });
  if (!columnExists) throw new HttpError(404, "Column not found");

  const last = await Card.findOne({ columnId: body.columnId, userId }).sort({ position: -1 });
  const card = await Card.create({
    userId,
    columnId: body.columnId,
    title: body.title,
    description: body.description,
    position: last ? last.position + 1 : 0,
  });

  const dto = toCardDto(card);
  broadcast({ type: "card:created", card: dto }, getClientId(req), boardId);
  res.status(201).json(dto);
});

boardsRouter.patch("/:boardId/cards/:id", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { boardId, id } = parseWith(boardAndIdParams, req.params);
  const body = parseWith(updateCardBody, req.body);

  const card = await Card.findOneAndUpdate({ _id: id, userId }, body, { new: true });
  if (!card) throw new HttpError(404, "Card not found");

  const dto = toCardDto(card);
  broadcast({ type: "card:updated", card: dto }, getClientId(req), boardId);
  res.json(dto);
});

boardsRouter.delete("/:boardId/cards/:id", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { boardId, id } = parseWith(boardAndIdParams, req.params);

  const card = await Card.findOneAndDelete({ _id: id, userId });
  if (!card) throw new HttpError(404, "Card not found");

  broadcast(
    { type: "card:deleted", id, columnId: card.columnId.toString() },
    getClientId(req),
    boardId,
  );
  res.status(204).end();
});

boardsRouter.patch("/:boardId/cards/:id/move", async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { boardId, id } = parseWith(boardAndIdParams, req.params);
  const body = parseWith(moveCardBody, req.body);

  const card = await Card.findOne({ _id: id, userId });
  if (!card) throw new HttpError(404, "Card not found");

  const targetExists = await Column.exists({ _id: body.columnId, userId });
  if (!targetExists) throw new HttpError(404, "Column not found");

  const sourceColumnId = card.columnId.toString();
  const targetColumnId = body.columnId;
  const targetObjectId = new Types.ObjectId(targetColumnId);

  const modifiedCards: InstanceType<typeof Card>[] = [];

  if (sourceColumnId === targetColumnId) {
    const cards = await Card.find({ columnId: targetColumnId, userId }).sort({ position: 1 });
    const fromIndex = cards.findIndex((c) => c._id.toString() === id);
    if (fromIndex === -1) throw new HttpError(404, "Card not found in its column");

    const clampedTarget = Math.max(0, Math.min(body.position, cards.length - 1));
    const [moved] = cards.splice(fromIndex, 1);
    cards.splice(clampedTarget, 0, moved);

    for (let i = 0; i < cards.length; i++) {
      if (cards[i].position !== i) {
        cards[i].position = i;
        await cards[i].save();
        modifiedCards.push(cards[i]);
      }
    }
    broadcast(
      {
        type: "cards:reordered",
        columnIds: [targetColumnId],
        cards: cards.map(toCardDto),
      },
      getClientId(req),
      boardId,
    );
  } else {
    const [sourceCards, targetCards] = await Promise.all([
      Card.find({ columnId: sourceColumnId, userId }).sort({ position: 1 }),
      Card.find({ columnId: targetColumnId, userId }).sort({ position: 1 }),
    ]);

    const fromIndex = sourceCards.findIndex((c) => c._id.toString() === id);
    if (fromIndex === -1) throw new HttpError(404, "Card not found in its column");

    const [moved] = sourceCards.splice(fromIndex, 1);
    moved.columnId = targetObjectId;

    const clampedTarget = Math.max(0, Math.min(body.position, targetCards.length));
    targetCards.splice(clampedTarget, 0, moved);

    for (let i = 0; i < sourceCards.length; i++) {
      if (sourceCards[i].position !== i) {
        sourceCards[i].position = i;
        await sourceCards[i].save();
        modifiedCards.push(sourceCards[i]);
      }
    }

    for (let i = 0; i < targetCards.length; i++) {
      if (targetCards[i].position !== i || targetCards[i]._id.toString() === id) {
        targetCards[i].position = i;
        await targetCards[i].save();
        modifiedCards.push(targetCards[i]);
      }
    }

    broadcast(
      {
        type: "cards:reordered",
        columnIds: [sourceColumnId, targetColumnId],
        cards: [...sourceCards, ...targetCards].map(toCardDto),
      },
      getClientId(req),
      boardId,
    );
  }

  res.json({ cards: modifiedCards.map(toCardDto) });
});
