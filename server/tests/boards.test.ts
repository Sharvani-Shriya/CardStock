/**
 * Integration tests for the multi-board routes (/api/boards/*):
 * - Authorization: User B gets 404 (not 403) for User A's board, columns, and cards.
 * - Authentication: Every board-scoped route requires a valid token (401 without/tampered/expired).
 * - CRUD operations for boards, columns, and cards.
 * - Card moves with position renumbering and { cards } response.
 * - Cascade deletion: deleting board deletes its columns and cards; deleting column deletes its cards.
 */

import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { config } from "../src/config.js";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth/passwords.js";
import { signAccessToken } from "../src/auth/tokens.js";
import { User } from "../src/models/User.js";
import { Board } from "../src/models/Board.js";
import { Column } from "../src/models/Column.js";
import { Card } from "../src/models/Card.js";
import { clearDb } from "./helpers/db.js";

const app = createApp({ clientOrigin: config.CLIENT_ORIGIN });

async function createUser(email: string): Promise<{ userId: string; token: string }> {
  const passwordHash = await hashPassword("password123");
  const user = await User.create({ email, passwordHash });
  const userId = (user._id as { toString(): string }).toString();
  const token = signAccessToken({ sub: userId, email });
  return { userId, token };
}

beforeEach(async () => {
  await clearDb();
});

describe("Authentication & Token Verification for /api/boards", () => {
  it("returns 401 when no token is provided", async () => {
    const res = await request(app).get("/api/boards");
    expect(res.status).toBe(401);
  });

  it("returns 401 with a tampered token", async () => {
    const { token } = await createUser("tamper@example.com");
    const tampered = token.slice(0, -5) + "abcde";
    const res = await request(app)
      .get("/api/boards")
      .set("Authorization", `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 with an expired token", async () => {
    const { userId } = await createUser("expired@example.com");
    const expiredToken = jwt.sign(
      { sub: userId, email: "expired@example.com", exp: Math.floor(Date.now() / 1000) - 60 },
      config.JWT_ACCESS_SECRET,
    );
    const res = await request(app)
      .get("/api/boards")
      .set("Authorization", `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is signed with an unapproved algorithm (e.g. HS384)", async () => {
    const { userId } = await createUser("alg@example.com");
    const invalidAlgToken = jwt.sign(
      { sub: userId, email: "alg@example.com" },
      config.JWT_ACCESS_SECRET,
      { algorithm: "HS384" },
    );
    const res = await request(app)
      .get("/api/boards")
      .set("Authorization", `Bearer ${invalidAlgToken}`);
    expect(res.status).toBe(401);
  });
});

describe("Board CRUD & User Isolation", () => {
  it("auto-creates a default board if user has no boards yet", async () => {
    const { token } = await createUser("user1@example.com");
    const res = await request(app)
      .get("/api/boards")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].title).toBe("My Board");
  });

  it("creates, renames, and gets a board", async () => {
    const { token } = await createUser("user1@example.com");

    // Create
    const createRes = await request(app)
      .post("/api/boards")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Sprint 42" });

    expect(createRes.status).toBe(201);
    const boardId = createRes.body.id;
    expect(createRes.body.title).toBe("Sprint 42");

    // Rename
    const renameRes = await request(app)
      .patch(`/api/boards/${boardId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Sprint 43" });

    expect(renameRes.status).toBe(200);
    expect(renameRes.body.title).toBe("Sprint 43");

    // Get
    const getRes = await request(app)
      .get(`/api/boards/${boardId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.board.title).toBe("Sprint 43");
    expect(getRes.body.columns).toEqual([]);
    expect(getRes.body.cards).toEqual([]);
  });

  it("User B receives 404 (not 403) when attempting to access User A's board", async () => {
    const { token: userAToken } = await createUser("userA@example.com");
    const { token: userBToken } = await createUser("userB@example.com");

    const boardRes = await request(app)
      .post("/api/boards")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ title: "Secret Board" });

    const boardId = boardRes.body.id;

    // User B gets board -> 404
    const getRes = await request(app)
      .get(`/api/boards/${boardId}`)
      .set("Authorization", `Bearer ${userBToken}`);
    expect(getRes.status).toBe(404);

    // User B renames board -> 404
    const patchRes = await request(app)
      .patch(`/api/boards/${boardId}`)
      .set("Authorization", `Bearer ${userBToken}`)
      .send({ title: "Hacked Board" });
    expect(patchRes.status).toBe(404);

    // User B deletes board -> 404
    const delRes = await request(app)
      .delete(`/api/boards/${boardId}`)
      .set("Authorization", `Bearer ${userBToken}`);
    expect(delRes.status).toBe(404);
  });

  it("user B cannot get a ws-ticket for user A's board", async () => {
    const { token: userAToken } = await createUser("userA-ws@example.com");
    const { token: userBToken } = await createUser("userB-ws@example.com");

    const boardRes = await request(app)
      .post("/api/boards")
      .set("Authorization", `Bearer ${userAToken}`)
      .send({ title: "Alice Private Board" });

    const aliceBoardId = boardRes.body.id;

    // Bob tries to request a WebSocket ticket for Alice's board -> 404
    const ticketRes = await request(app)
      .post("/api/auth/ws-ticket")
      .set("Authorization", `Bearer ${userBToken}`)
      .send({ boardId: aliceBoardId });

    expect(ticketRes.status).toBe(404);
    expect(ticketRes.body.error.message).toMatch(/board not found/i);
  });
});

describe("Column and Card CRUD inside a Board", () => {
  it("creates, renames, and deletes columns within a board", async () => {
    const { token } = await createUser("coluser@example.com");
    const boardRes = await request(app)
      .post("/api/boards")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Kanban Project" });
    const boardId = boardRes.body.id;

    // Create column
    const colRes = await request(app)
      .post(`/api/boards/${boardId}/columns`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Backlog" });

    expect(colRes.status).toBe(201);
    expect(colRes.body.title).toBe("Backlog");
    expect(colRes.body.position).toBe(0);
    const columnId = colRes.body.id;

    // Rename column
    const renameColRes = await request(app)
      .patch(`/api/boards/${boardId}/columns/${columnId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "To Do" });

    expect(renameColRes.status).toBe(200);
    expect(renameColRes.body.title).toBe("To Do");

    // Delete column
    const delColRes = await request(app)
      .delete(`/api/boards/${boardId}/columns/${columnId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(delColRes.status).toBe(204);
  });

  it("creates, edits, deletes, and moves cards with contiguous renumbering", async () => {
    const { token } = await createUser("carduser@example.com");
    const boardRes = await request(app)
      .post("/api/boards")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Kanban Project" });
    const boardId = boardRes.body.id;

    const col1Res = await request(app)
      .post(`/api/boards/${boardId}/columns`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Column 1" });
    const col1Id = col1Res.body.id;

    const col2Res = await request(app)
      .post(`/api/boards/${boardId}/columns`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Column 2" });
    const col2Id = col2Res.body.id;

    // Create 3 cards in Column 1
    const card1 = (
      await request(app)
        .post(`/api/boards/${boardId}/cards`)
        .set("Authorization", `Bearer ${token}`)
        .send({ columnId: col1Id, title: "Card 1", description: "Desc 1" })
    ).body;

    const card2 = (
      await request(app)
        .post(`/api/boards/${boardId}/cards`)
        .set("Authorization", `Bearer ${token}`)
        .send({ columnId: col1Id, title: "Card 2", description: "Desc 2" })
    ).body;

    const card3 = (
      await request(app)
        .post(`/api/boards/${boardId}/cards`)
        .set("Authorization", `Bearer ${token}`)
        .send({ columnId: col1Id, title: "Card 3", description: "Desc 3" })
    ).body;

    expect(card1.position).toBe(0);
    expect(card2.position).toBe(1);
    expect(card3.position).toBe(2);

    // Edit card 2
    const editRes = await request(app)
      .patch(`/api/boards/${boardId}/cards/${card2.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Card 2 updated" });

    expect(editRes.status).toBe(200);
    expect(editRes.body.title).toBe("Card 2 updated");

    // Move Card 3 to top of Column 1 (index 0)
    const moveSameColRes = await request(app)
      .patch(`/api/boards/${boardId}/cards/${card3.id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ columnId: col1Id, position: 0 });

    expect(moveSameColRes.status).toBe(200);
    expect(Array.isArray(moveSameColRes.body.cards)).toBe(true);

    // Verify renumbered positions in DB
    const col1Cards = await Card.find({ columnId: col1Id }).sort({ position: 1 });
    expect(col1Cards.map((c) => c._id.toString())).toEqual([card3.id, card1.id, card2.id]);
    expect(col1Cards.map((c) => c.position)).toEqual([0, 1, 2]);

    // Move Card 1 to Column 2
    const moveOtherColRes = await request(app)
      .patch(`/api/boards/${boardId}/cards/${card1.id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ columnId: col2Id, position: 0 });

    expect(moveOtherColRes.status).toBe(200);
    expect(Array.isArray(moveOtherColRes.body.cards)).toBe(true);

    const col2Cards = await Card.find({ columnId: col2Id }).sort({ position: 1 });
    expect(col2Cards.length).toBe(1);
    expect(col2Cards[0]._id.toString()).toBe(card1.id);
    expect(col2Cards[0].position).toBe(0);

    // Delete Card 2
    const delCardRes = await request(app)
      .delete(`/api/boards/${boardId}/cards/${card2.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(delCardRes.status).toBe(204);
  });

  it("User B receives 404 for User A's column and card operations", async () => {
    const { token: tokenA } = await createUser("owner@example.com");
    const { token: tokenB } = await createUser("attacker@example.com");

    const boardRes = await request(app)
      .post("/api/boards")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "Board A" });
    const boardId = boardRes.body.id;

    const colRes = await request(app)
      .post(`/api/boards/${boardId}/columns`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ title: "Col A" });
    const colId = colRes.body.id;

    const cardRes = await request(app)
      .post(`/api/boards/${boardId}/cards`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ columnId: colId, title: "Card A" });
    const cardId = cardRes.body.id;

    // Attacker tries to modify column -> 404
    const patchColRes = await request(app)
      .patch(`/api/boards/${boardId}/columns/${colId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "Hacked Col" });
    expect(patchColRes.status).toBe(404);

    // Attacker tries to modify card -> 404
    const patchCardRes = await request(app)
      .patch(`/api/boards/${boardId}/cards/${cardId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ title: "Hacked Card" });
    expect(patchCardRes.status).toBe(404);

    // Attacker tries to move card -> 404
    const moveCardRes = await request(app)
      .patch(`/api/boards/${boardId}/cards/${cardId}/move`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ columnId: colId, position: 0 });
    expect(moveCardRes.status).toBe(404);
  });

  it("cross-board create, move, update and delete return 404 and broadcast nothing to either board", async () => {
    const { token } = await createUser("crossboard@example.com");

    // Create Board 1 with Column 1 and Card 1
    const b1 = (
      await request(app)
        .post("/api/boards")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Board 1" })
    ).body;
    const c1 = (
      await request(app)
        .post(`/api/boards/${b1.id}/columns`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Column 1" })
    ).body;
    const card1 = (
      await request(app)
        .post(`/api/boards/${b1.id}/cards`)
        .set("Authorization", `Bearer ${token}`)
        .send({ columnId: c1.id, title: "Card 1" })
    ).body;

    // Create Board 2 with Column 2 and Card 2
    const b2 = (
      await request(app)
        .post("/api/boards")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Board 2" })
    ).body;
    const c2 = (
      await request(app)
        .post(`/api/boards/${b2.id}/columns`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Column 2" })
    ).body;
    const card2 = (
      await request(app)
        .post(`/api/boards/${b2.id}/cards`)
        .set("Authorization", `Bearer ${token}`)
        .send({ columnId: c2.id, title: "Card 2" })
    ).body;

    // 1. Cross-board create: attempt to create a card in Column 2 via Board 1's URL -> 404
    const createCross = await request(app)
      .post(`/api/boards/${b1.id}/cards`)
      .set("Authorization", `Bearer ${token}`)
      .send({ columnId: c2.id, title: "Cross Card" });
    expect(createCross.status).toBe(404);

    // 2. Cross-board column update: attempt to rename Column 2 via Board 1's URL -> 404
    const patchColCross = await request(app)
      .patch(`/api/boards/${b1.id}/columns/${c2.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Hacked Column" });
    expect(patchColCross.status).toBe(404);

    // 3. Cross-board column delete: attempt to delete Column 2 via Board 1's URL -> 404
    const delColCross = await request(app)
      .delete(`/api/boards/${b1.id}/columns/${c2.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(delColCross.status).toBe(404);

    // 4. Cross-board card update: attempt to update Card 2 via Board 1's URL -> 404
    const patchCardCross = await request(app)
      .patch(`/api/boards/${b1.id}/cards/${card2.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Hacked Card" });
    expect(patchCardCross.status).toBe(404);

    // 5. Cross-board card delete: attempt to delete Card 2 via Board 1's URL -> 404
    const delCardCross = await request(app)
      .delete(`/api/boards/${b1.id}/cards/${card2.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(delCardCross.status).toBe(404);

    // 6. Cross-board card move: attempt to move Card 1 to Column 2 via Board 1's URL -> 404
    const moveCrossTarget = await request(app)
      .patch(`/api/boards/${b1.id}/cards/${card1.id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ columnId: c2.id, position: 0 });
    expect(moveCrossTarget.status).toBe(404);

    // 7. Cross-board card move: attempt to move Card 2 (on Board 2) via Board 1's URL -> 404
    const moveCrossSource = await request(app)
      .patch(`/api/boards/${b1.id}/cards/${card2.id}/move`)
      .set("Authorization", `Bearer ${token}`)
      .send({ columnId: c1.id, position: 0 });
    expect(moveCrossSource.status).toBe(404);

    // Verify all original entities are completely unchanged in DB
    const col2Check = await Column.findById(c2.id);
    expect(col2Check?.title).toBe("Column 2");

    const card2Check = await Card.findById(card2.id);
    expect(card2Check?.title).toBe("Card 2");
    expect(card2Check?.columnId.toString()).toBe(c2.id);

    const card1Check = await Card.findById(card1.id);
    expect(card1Check?.columnId.toString()).toBe(c1.id);
  });
});

describe("Cascade Deletions", () => {
  it("deleting a column cascades and removes its cards", async () => {
    const { token } = await createUser("cascade@example.com");
    const board = await request(app)
      .post("/api/boards")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Cascade Board" });
    const boardId = board.body.id;

    const col = await request(app)
      .post(`/api/boards/${boardId}/columns`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Col to Delete" });
    const colId = col.body.id;

    await request(app)
      .post(`/api/boards/${boardId}/cards`)
      .set("Authorization", `Bearer ${token}`)
      .send({ columnId: colId, title: "Card 1" });

    await request(app)
      .post(`/api/boards/${boardId}/cards`)
      .set("Authorization", `Bearer ${token}`)
      .send({ columnId: colId, title: "Card 2" });

    expect(await Card.countDocuments({ columnId: colId })).toBe(2);

    // Delete column
    const delRes = await request(app)
      .delete(`/api/boards/${boardId}/columns/${colId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(delRes.status).toBe(204);
    expect(await Column.countDocuments({ _id: colId })).toBe(0);
    expect(await Card.countDocuments({ columnId: colId })).toBe(0);
  });

  it("deleting a board cascades and removes its columns and all their cards", async () => {
    const { token } = await createUser("boardcascade@example.com");
    const board = await request(app)
      .post("/api/boards")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Board to Delete" });
    const boardId = board.body.id;

    const col1 = (
      await request(app)
        .post(`/api/boards/${boardId}/columns`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Col 1" })
    ).body;

    const col2 = (
      await request(app)
        .post(`/api/boards/${boardId}/columns`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Col 2" })
    ).body;

    await request(app)
      .post(`/api/boards/${boardId}/cards`)
      .set("Authorization", `Bearer ${token}`)
      .send({ columnId: col1.id, title: "Card in Col 1" });

    await request(app)
      .post(`/api/boards/${boardId}/cards`)
      .set("Authorization", `Bearer ${token}`)
      .send({ columnId: col2.id, title: "Card in Col 2" });

    expect(await Column.countDocuments({ boardId })).toBe(2);
    expect(await Card.countDocuments({ columnId: { $in: [col1.id, col2.id] } })).toBe(2);

    // Delete Board
    const delRes = await request(app)
      .delete(`/api/boards/${boardId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(delRes.status).toBe(204);
    expect(await Board.countDocuments({ _id: boardId })).toBe(0);
    expect(await Column.countDocuments({ boardId })).toBe(0);
    expect(await Card.countDocuments({ columnId: { $in: [col1.id, col2.id] } })).toBe(0);
  });
});
