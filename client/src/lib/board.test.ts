import { describe, expect, it } from "vitest";
import { layoutOf, makeCard } from "../test/helpers";
import { moveCardLocally } from "./board";

// Column A holds three cards, column B two, and column C is empty. A fresh array
// is built per call so no test can be affected by another test's data.
function seedCards() {
  return [
    makeCard({ id: "a1", columnId: "A", position: 0 }),
    makeCard({ id: "a2", columnId: "A", position: 1 }),
    makeCard({ id: "a3", columnId: "A", position: 2 }),
    makeCard({ id: "b1", columnId: "B", position: 0 }),
    makeCard({ id: "b2", columnId: "B", position: 1 }),
  ];
}

// This helper predicts what the server will answer, so the optimistic screen and
// the server's reply agree. Positions must always come out as exactly 0..n-1.
describe("moveCardLocally", () => {
  describe("within the same column", () => {
    it("moves a card down", () => {
      const result = moveCardLocally(seedCards(), "a1", "A", 2);

      expect(layoutOf(result, "A")).toEqual(["a2@0", "a3@1", "a1@2"]);
    });

    it("moves a card up", () => {
      const result = moveCardLocally(seedCards(), "a3", "A", 0);

      expect(layoutOf(result, "A")).toEqual(["a3@0", "a1@1", "a2@2"]);
    });

    it("keeps the order when a card is dropped on its own index", () => {
      const result = moveCardLocally(seedCards(), "a2", "A", 1);

      expect(layoutOf(result, "A")).toEqual(["a1@0", "a2@1", "a3@2"]);
    });

    it("does not touch other columns", () => {
      const result = moveCardLocally(seedCards(), "a1", "A", 2);

      expect(layoutOf(result, "B")).toEqual(["b1@0", "b2@1"]);
    });
  });

  describe("across columns", () => {
    it("inserts the card in the middle of the target column", () => {
      const result = moveCardLocally(seedCards(), "a2", "B", 1);

      expect(layoutOf(result, "B")).toEqual(["b1@0", "a2@1", "b2@2"]);
      expect(result.find((card) => card.id === "a2")?.columnId).toBe("B");
    });

    it("inserts the card at the top of the target column", () => {
      const result = moveCardLocally(seedCards(), "a1", "B", 0);

      expect(layoutOf(result, "B")).toEqual(["a1@0", "b1@1", "b2@2"]);
    });

    it("closes the gap the card left behind in the source column", () => {
      // Removing a2 would leave positions 0 and 2, so a3 must slide up to 1.
      const result = moveCardLocally(seedCards(), "a2", "B", 0);

      expect(layoutOf(result, "A")).toEqual(["a1@0", "a3@1"]);
    });

    it("can move a card into an empty column", () => {
      const result = moveCardLocally(seedCards(), "a1", "C", 0);

      expect(layoutOf(result, "C")).toEqual(["a1@0"]);
      expect(layoutOf(result, "A")).toEqual(["a2@0", "a3@1"]);
    });
  });

  describe("index clamping", () => {
    it("treats an index past the end as 'the bottom' in another column", () => {
      const result = moveCardLocally(seedCards(), "a1", "B", 99);

      expect(layoutOf(result, "B")).toEqual(["b1@0", "b2@1", "a1@2"]);
    });

    it("treats an index past the end as 'the bottom' in the same column", () => {
      const result = moveCardLocally(seedCards(), "a1", "A", 99);

      expect(layoutOf(result, "A")).toEqual(["a2@0", "a3@1", "a1@2"]);
    });

    it("treats a negative index as 'the top'", () => {
      const result = moveCardLocally(seedCards(), "a3", "A", -3);

      expect(layoutOf(result, "A")).toEqual(["a3@0", "a1@1", "a2@2"]);
    });
  });

  describe("robustness", () => {
    it("renumbers positions that had gaps, such as after deletions", () => {
      const gapped = [
        makeCard({ id: "x1", columnId: "G", position: 0 }),
        makeCard({ id: "x2", columnId: "G", position: 5 }),
        makeCard({ id: "x3", columnId: "G", position: 9 }),
      ];

      const result = moveCardLocally(gapped, "x3", "G", 0);

      expect(layoutOf(result, "G")).toEqual(["x3@0", "x1@1", "x2@2"]);
    });

    it("returns the same array when the card does not exist", () => {
      // Returning the original reference means "nothing changed", which lets
      // callers (and React) skip needless work.
      const cards = seedCards();

      expect(moveCardLocally(cards, "missing", "A", 0)).toBe(cards);
    });

    it("never mutates the array it was given", () => {
      // The previous state is kept as the rollback snapshot, so changing it in
      // place would silently break rollback.
      const cards = seedCards();
      const before = cards.map((card) => ({ ...card }));

      moveCardLocally(cards, "a1", "B", 1);

      expect(cards).toEqual(before);
    });
  });
});
