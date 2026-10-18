import { Router } from "express";
import { HttpError } from "../errors";
import { getClientId, parseWith } from "../http";
import { Card } from "../models/Card";
import { Column } from "../models/Column";
import { broadcast } from "../realtime";
import { createColumnBody, idParams, updateColumnBody } from "../schemas";
import { toColumnDto } from "../serializers";

export const columnsRouter = Router();

columnsRouter.post("/", async (req, res) => {
  const body = parseWith(createColumnBody, req.body);

  // Use "last position + 1" rather than a count: deleting a column leaves a gap,
  // and a count would then collide with an existing position.
  const last = await Column.findOne().sort({ position: -1 });
  const column = await Column.create({
    title: body.title,
    position: last ? last.position + 1 : 0,
  });

  const dto = toColumnDto(column);
  broadcast({ type: "column:created", column: dto }, getClientId(req));
  res.status(201).json(dto);
});

columnsRouter.patch("/:id", async (req, res) => {
  const { id } = parseWith(idParams, req.params);
  const body = parseWith(updateColumnBody, req.body);

  const column = await Column.findByIdAndUpdate(
    id,
    { title: body.title },
    { new: true, runValidators: true },
  );
  if (!column) throw new HttpError(404, "Column not found");

  const dto = toColumnDto(column);
  broadcast({ type: "column:updated", column: dto }, getClientId(req));
  res.json(dto);
});

columnsRouter.delete("/:id", async (req, res) => {
  const { id } = parseWith(idParams, req.params);

  const column = await Column.findByIdAndDelete(id);
  if (!column) throw new HttpError(404, "Column not found");

  // Cards cannot exist without a column, so remove them too. Receivers do the
  // same locally when they see column:deleted, so no extra event is needed.
  await Card.deleteMany({ columnId: id });

  broadcast({ type: "column:deleted", id }, getClientId(req));
  res.status(204).end();
});
