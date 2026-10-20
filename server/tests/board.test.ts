/**
 * Integration tests for the protected board routes:
 *   GET  /api/board
 *   POST /api/columns, PATCH /api/columns/:id, DELETE /api/columns/:id
 *   POST /api/cards,   PATCH /api/cards/:id,   PATCH /api/cards/:id/move,
 *   DELETE /api/cards/:id
 *
 * All routes require a valid Bearer token; per-user data isolation is also
 * verified (user A cannot see or modify user B's data).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { config } from "../src/config.js";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/passwords.js";
import { signAccessToken } from "../src/auth/tokens.js";
import { User } from "../src/models/User.js";
import { Column } from "../src/models/Column.js";
import { Card } from "../src/models/Card.js";
import { clearDb } from "./helpers/db.js";   // registers beforeAll/afterAll

const app = createApp({ clientOrigin: config.CLIENT_ORIGIN });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUser(email: string): Promise<{ userId: string; token: string }> {
  const passwordHash = await hashPassword("password123");
  const user = await User.create({ email, passwordHash });
  const userId = (user._id as { toString(): string }).toString();
  const token = signAccessToken({ sub: userId, email });
  return { userId, token };
}

// ---------------------------------------------------------------------------

beforeEach(async () => {
  await clearDb();
});

// ---------------------------------------------------------------------------
// GET /api/board
// ---------------------------------------------------------------------------

describe("GET /api/board", () => {
  it("returns empty board for a new user", async () => {
    const { token } = await createUser("alice@example.com");

    const res = await request(app)
      .get("/api/board")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.columns).toEqual([]);
    expect(res.body.cards).toEqual([]);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/board");
    expect(res.status).toBe(401);
  });

  it("does not include another user's data", async () => {
    const { token: tokenA, userId: userAId } = await createUser("a@example.com");
    const { token: tokenB } = await createUser("b@example.com");

    // Create a column for user A.
    await Column.create({ userId: userAId, title: "A column", position: 0 });

    const res = await request(app)
      .get("/api/board")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.columns).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/columns
// ---------------------------------------------------------------------------

describe("POST /api/columns", () => {
  it("creates a column for the authenticated user", async () => {
    const { token } = await createUser("alice@example.com");

    const res = await request(app)
      .post("/api/columns")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "To Do" });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("To Do");
    expect(res.body.position).toBe(0);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app)
      .post("/api/columns")
      .send({ title: "To Do" });

    expect(res.status).toBe(401);
  });

  it("returns 400 for an empty title", async () => {
    const { token } = await createUser("alice@example.com");

    const res = await request(app)
      .post("/api/columns")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "" });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/columns/:id
// ---------------------------------------------------------------------------

describe("PATCH /api/columns/:id", () => {
  it("renames a column owned by the authenticated user", async () => {
    const { token, userId } = await createUser("alice@example.com");
    const column = await Column.create({ userId, title: "Old", position: 0 });
    const id = (column._id as { toString(): string }).toString();

    const res = await request(app)
      .patch(`/api/columns/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "New" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("New");
  });

  it("returns 404 when trying to rename another user's column", async () => {
    const { userId: userAId } = await createUser("a@example.com");
    const { token: tokenB } = await createUser("b@example.com");
    const column = await Column.create({ userId: userAId, title: "A col", position: 0 });
    const id = (column._id as { toString(): string }).toString();

    const res = await request(app)
      .patch(`/api/columns/${id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "Stolen" });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/columns/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/columns/:id", () => {
  it("deletes a column and its cards", async () => {
    const { token, userId } = await createUser("alice@example.com");
    const column = await Column.create({ userId, title: "Col", position: 0 });
    const columnId = (column._id as { toString(): string }).toString();
    await Card.create({
      userId,
      columnId,
      title: "Card 1",
      position: 0,
    });

    const res = await request(app)
      .delete(`/api/columns/${columnId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(await Card.countDocuments({ columnId })).toBe(0);
  });

  it("returns 404 when deleting another user's column", async () => {
    const { userId: userAId } = await createUser("a@example.com");
    const { token: tokenB } = await createUser("b@example.com");
    const column = await Column.create({ userId: userAId, title: "A col", position: 0 });
    const id = (column._id as { toString(): string }).toString();

    const res = await request(app)
      .delete(`/api/columns/${id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/cards
// ---------------------------------------------------------------------------

describe("POST /api/cards", () => {
  it("creates a card in the authenticated user's column", async () => {
    const { token, userId } = await createUser("alice@example.com");
    const column = await Column.create({ userId, title: "Col", position: 0 });
    const columnId = (column._id as { toString(): string }).toString();

    const res = await request(app)
      .post("/api/cards")
      .set("Authorization", `Bearer ${token}`)
      .send({ columnId, title: "My card" });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("My card");
    expect(res.body.columnId).toBe(columnId);
  });

  it("returns 404 when adding a card to another user's column", async () => {
    const { userId: userAId } = await createUser("a@example.com");
    const { token: tokenB } = await createUser("b@example.com");
    const column = await Column.create({ userId: userAId, title: "A col", position: 0 });
    const columnId = (column._id as { toString(): string }).toString();

    const res = await request(app)
      .post("/api/cards")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ columnId, title: "Stolen" });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/cards/:id
// ---------------------------------------------------------------------------

describe("PATCH /api/cards/:id", () => {
  it("updates a card owned by the user", async () => {
    const { token, userId } = await createUser("alice@example.com");
    const column = await Column.create({ userId, title: "Col", position: 0 });
    const columnId = (column._id as { toString(): string }).toString();
    const card = await Card.create({ userId, columnId, title: "Old", position: 0 });
    const id = (card._id as { toString(): string }).toString();

    const res = await request(app)
      .patch(`/api/cards/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated");
  });

  it("returns 404 when updating another user's card", async () => {
    const { userId: userAId } = await createUser("a@example.com");
    const { token: tokenB } = await createUser("b@example.com");
    const column = await Column.create({ userId: userAId, title: "Col", position: 0 });
    const columnId = (column._id as { toString(): string }).toString();
    const card = await Card.create({ userId: userAId, columnId, title: "A card", position: 0 });
    const id = (card._id as { toString(): string }).toString();

    const res = await request(app)
      .patch(`/api/cards/${id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "Stolen" });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/cards/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/cards/:id", () => {
  it("deletes a card owned by the user", async () => {
    const { token, userId } = await createUser("alice@example.com");
    const column = await Column.create({ userId, title: "Col", position: 0 });
    const columnId = (column._id as { toString(): string }).toString();
    const card = await Card.create({ userId, columnId, title: "Card", position: 0 });
    const id = (card._id as { toString(): string }).toString();

    const res = await request(app)
      .delete(`/api/cards/${id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/cards/:id/move
// ---------------------------------------------------------------------------

describe("PATCH /api/cards/:id/move", () => {
  it("moves a card between columns belonging to the user", async () => {
    const { token, userId } = await createUser("alice@example.com");
    const col1 = await Column.create({ userId, title: "Col 1", position: 0 });
    const col2 = await Column.create({ userId, title: "Col 2", position: 1 });
    const col1Id = (col1._id as { toString(): string }).toString();
    const col2Id = (col2._id as { toString(): string }).toString();
    const card = await Card.create({ userId, columnId: col1Id, title: "Card", position: 0 });
    const cardId = (card._id as { toString(): string }).toString();

    const res = await request(app)
      .patch(`/api/cards/${cardId}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ columnId: col2Id, position: 0 });

    expect(res.status).toBe(200);
    expect(res.body.cards[0].columnId).toBe(col2Id);
  });
});
