/**
 * Tests for the orphan data migration script:
 * - Dry run changes nothing.
 * - --assign-to assigns orphaned columns and cards to the target user.
 * - --delete permanently deletes orphaned cards and columns.
 * - A second run is idempotent (0 modified, 0 deleted).
 */

import mongoose from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { runOrphanMigration } from "../scripts/migrateOrphans.js";
import { Card } from "../src/models/Card.js";
import { Column } from "../src/models/Column.js";
import { User } from "../src/models/User.js";
import { clearDb } from "./helpers/db.js";

beforeEach(async () => {
  await clearDb();
});

describe("Orphan Data Migration Script", () => {
  it("dry run reports counts but changes nothing in the database", async () => {
    // Seed orphaned columns and cards (no userId) directly into collections
    const colRes = await mongoose.connection.collection("columns").insertOne({
      title: "Orphan Col",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const colId = colRes.insertedId;

    await mongoose.connection.collection("cards").insertOne({
      columnId: colId,
      title: "Orphan Card",
      description: "",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await runOrphanMigration({ silent: true });

    expect(result.orphanedColumns).toBe(1);
    expect(result.orphanedCards).toBe(1);

    // Verify documents remain unassigned
    const colAfter = await Column.findById(colId);
    const cardAfter = await Card.findOne({ columnId: colId });
    expect(colAfter?.userId).toBeUndefined();
    expect(cardAfter?.userId).toBeUndefined();
  });

  it("--assign-to assigns all orphaned documents to the target user, and is idempotent", async () => {
    const user = await User.create({ email: "target@example.com", passwordHash: "dummy" });

    const col1 = (
      await mongoose.connection.collection("columns").insertOne({
        title: "Orphan 1",
        position: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).insertedId;

    const col2 = (
      await mongoose.connection.collection("columns").insertOne({
        title: "Orphan 2",
        position: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).insertedId;

    await mongoose.connection.collection("cards").insertOne({
      columnId: col1,
      title: "Card 1",
      description: "",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await mongoose.connection.collection("cards").insertOne({
      columnId: col2,
      title: "Card 2",
      description: "",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // First run: assigns documents
    const result1 = await runOrphanMigration({
      assignToEmail: "target@example.com",
      silent: true,
    });

    expect(result1.orphanedColumns).toBe(2);
    expect(result1.orphanedCards).toBe(2);
    expect(result1.assignedColumns).toBe(2);
    expect(result1.assignedCards).toBe(2);

    const updatedCols = await Column.find({ userId: user._id });
    expect(updatedCols.length).toBe(2);
    const updatedCards = await Card.find({ userId: user._id });
    expect(updatedCards.length).toBe(2);

    // Second run: idempotent, 0 remaining
    const result2 = await runOrphanMigration({
      assignToEmail: "target@example.com",
      silent: true,
    });

    expect(result2.orphanedColumns).toBe(0);
    expect(result2.orphanedCards).toBe(0);
  });

  it("--delete removes all orphaned cards and columns, and is idempotent", async () => {
    const colId = (
      await mongoose.connection.collection("columns").insertOne({
        title: "Doomed Col",
        position: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).insertedId;

    await mongoose.connection.collection("cards").insertOne({
      columnId: colId,
      title: "Doomed Card",
      description: "",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // First run: deletes orphaned documents
    const result1 = await runOrphanMigration({
      shouldDelete: true,
      silent: true,
    });

    expect(result1.orphanedColumns).toBe(1);
    expect(result1.orphanedCards).toBe(1);
    expect(result1.deletedColumns).toBe(1);
    expect(result1.deletedCards).toBe(1);

    expect(await Column.countDocuments()).toBe(0);
    expect(await Card.countDocuments()).toBe(0);

    // Second run: idempotent
    const result2 = await runOrphanMigration({
      shouldDelete: true,
      silent: true,
    });

    expect(result2.orphanedColumns).toBe(0);
    expect(result2.orphanedCards).toBe(0);
  });
});
