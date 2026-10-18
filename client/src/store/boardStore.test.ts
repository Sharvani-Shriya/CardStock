import { beforeEach, describe, expect, it } from "vitest";
import { layoutOf, makeCard, makeColumn, resetStores } from "../test/helpers";
import type { ServerEvent } from "../types";
import { useBoardStore } from "./boardStore";

const todo = makeColumn({ id: "col-todo", title: "To do", position: 0 });
const doing = makeColumn({ id: "col-doing", title: "Doing", position: 1 });
const done = makeColumn({ id: "col-done", title: "Done", position: 2 });

function seedCards() {
  return [
    makeCard({ id: "t1", columnId: "col-todo", position: 0 }),
    makeCard({ id: "t2", columnId: "col-todo", position: 1 }),
    makeCard({ id: "d1", columnId: "col-doing", position: 0 }),
    makeCard({ id: "x1", columnId: "col-done", position: 0 }),
  ];
}

function cardsNow() {
  return useBoardStore.getState().cards;
}

function apply(event: ServerEvent): void {
  useBoardStore.getState().applyEvent(event);
}

// applyEvent receives changes made by OTHER people. Getting it wrong shows up as
// teammates' edits missing, duplicated or stuck on screen.
describe("useBoardStore.applyEvent", () => {
  beforeEach(() => {
    resetStores();
    useBoardStore.setState({ columns: [todo, doing, done], cards: seedCards(), status: "ready" });
  });

  describe("card:created", () => {
    it("adds the card to its column", () => {
      const created = makeCard({ id: "t3", columnId: "col-todo", title: "From a teammate", position: 2 });

      apply({ type: "card:created", card: created });

      expect(cardsNow()).toHaveLength(5);
      expect(layoutOf(cardsNow(), "col-todo")).toEqual(["t1@0", "t2@1", "t3@2"]);
      expect(cardsNow()).toContainEqual(created);
    });

    it("ignores a duplicate event instead of adding the card twice", () => {
      // After a reconnect the refetched board may already contain a card whose
      // event is still on its way. Applying it again must be harmless.
      const created = makeCard({ id: "t3", columnId: "col-todo", position: 2 });

      apply({ type: "card:created", card: created });
      apply({ type: "card:created", card: created });

      expect(cardsNow().filter((card) => card.id === "t3")).toHaveLength(1);
    });
  });

  describe("card:deleted", () => {
    it("removes only that card", () => {
      apply({ type: "card:deleted", id: "t1", columnId: "col-todo" });

      expect(cardsNow().map((card) => card.id)).toEqual(["t2", "d1", "x1"]);
    });

    it("does nothing for a card we do not have", () => {
      // We may already have removed it ourselves (an optimistic delete).
      apply({ type: "card:deleted", id: "ghost", columnId: "col-todo" });

      expect(cardsNow()).toEqual(seedCards());
    });
  });

  describe("cards:reordered", () => {
    it("replaces the cards of both affected columns", () => {
      // Another user dragged t1 from "To do" into the top of "Doing".
      apply({
        type: "cards:reordered",
        columnIds: ["col-todo", "col-doing"],
        cards: [
          makeCard({ id: "t2", columnId: "col-todo", position: 0 }),
          makeCard({ id: "t1", columnId: "col-doing", position: 0 }),
          makeCard({ id: "d1", columnId: "col-doing", position: 1 }),
        ],
      });

      expect(layoutOf(cardsNow(), "col-todo")).toEqual(["t2@0"]);
      expect(layoutOf(cardsNow(), "col-doing")).toEqual(["t1@0", "d1@1"]);
    });

    it("leaves columns that were not affected alone", () => {
      apply({
        type: "cards:reordered",
        columnIds: ["col-todo"],
        cards: [
          makeCard({ id: "t2", columnId: "col-todo", position: 0 }),
          makeCard({ id: "t1", columnId: "col-todo", position: 1 }),
        ],
      });

      expect(layoutOf(cardsNow(), "col-done")).toEqual(["x1@0"]);
      expect(layoutOf(cardsNow(), "col-doing")).toEqual(["d1@0"]);
    });

    it("empties a column that lost its last card", () => {
      // The event lists affected column ids precisely because an emptied column
      // has no cards in the payload. Without the ids it would never be cleared.
      apply({
        type: "cards:reordered",
        columnIds: ["col-todo", "col-doing"],
        cards: [
          makeCard({ id: "d1", columnId: "col-doing", position: 0 }),
          makeCard({ id: "t1", columnId: "col-doing", position: 1 }),
          makeCard({ id: "t2", columnId: "col-doing", position: 2 }),
        ],
      });

      expect(layoutOf(cardsNow(), "col-todo")).toEqual([]);
      expect(layoutOf(cardsNow(), "col-doing")).toEqual(["d1@0", "t1@1", "t2@2"]);
    });

    it("keeps a card that is still being saved locally", () => {
      // A card with a temporary id exists only in this browser. The server's
      // list cannot contain it, so replacing the column must not wipe it out.
      useBoardStore.setState({
        cards: [...seedCards(), makeCard({ id: "tmp-draft", columnId: "col-todo", position: 2 })],
      });

      apply({
        type: "cards:reordered",
        columnIds: ["col-todo"],
        cards: [
          makeCard({ id: "t2", columnId: "col-todo", position: 0 }),
          makeCard({ id: "t1", columnId: "col-todo", position: 1 }),
        ],
      });

      expect(layoutOf(cardsNow(), "col-todo")).toEqual(["t2@0", "t1@1", "tmp-draft@2"]);
    });
  });
});
