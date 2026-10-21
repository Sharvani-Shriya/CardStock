import { Router } from "express";
import { HttpError } from "../errors.js";
import { getClientId, parseWith } from "../http.js";
import { requireAuth } from "../middleware/authenticate.js";
import { Card } from "../models/Card.js";
import { Column } from "../models/Column.js";
import { broadcast } from "../realtime.js";
import { createColumnBody, idParams, updateColumnBody } from "../schemas.js";
import { toColumnDto } from "../serializers.js";

export const columnsRouter = Router();

// All column routes require authentication.  The userId is taken from the
// verified token, not from the request body, so a user can never forge
// ownership by supplying a different userId.
columnsRouter.post("/", requireAuth, async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const body = parseWith(createColumnBody, req.body);

  // Use "last position + 1" rather than a count: deleting a column leaves a gap,
  // and a count would then collide with an existing position.
  const last = await Column.findOne({ userId }).sort({ position: -1 });
  const column = await Column.create({
    userId,
    title: body.title,
    position: last ? last.position + 1 : 0,
  });

  const dto = toColumnDto(column);
  broadcast({ type: "column:created", column: dto }, getClientId(req), column.boardId?.toString() ?? "");
  res.status(201).json(dto);
});

columnsRouter.patch("/:id", requireAuth, async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { id } = parseWith(idParams, req.params);
  const body = parseWith(updateColumnBody, req.body);

  // Filter by userId so a user cannot rename another user's column even if
  // they somehow guess the id.
  const column = await Column.findOneAndUpdate(
    { _id: id, userId },
    { title: body.title },
    { new: true, runValidators: true },
  );
  if (!column) throw new HttpError(404, "Column not found");

  const dto = toColumnDto(column);
  broadcast({ type: "column:updated", column: dto }, getClientId(req), column.boardId?.toString() ?? "");
  res.json(dto);
});

columnsRouter.delete("/:id", requireAuth, async (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const userId = req.user!.id;
  const { id } = parseWith(idParams, req.params);

  const column = await Column.findOneAndDelete({ _id: id, userId });
  if (!column) throw new HttpError(404, "Column not found");

  // Cards cannot exist without a column, so remove them too. Receivers do the
  // same locally when they see column:deleted, so no extra event is needed.
  await Card.deleteMany({ columnId: id, userId });

  broadcast({ type: "column:deleted", id }, getClientId(req), column.boardId?.toString() ?? "");
  res.status(204).end();
});
