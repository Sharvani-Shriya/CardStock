import { getBoard } from "./support/api";
import { addCard, cardIn, columnIn, dragCardToColumn, openBoard } from "./support/board";
import { expect, test } from "./support/fixtures";

test("a card created in window A appears in window B without a refresh", async ({ windows, seed }) => {
  const column = await seed.column("Sync column");
  await openBoard(windows.a);
  await openBoard(windows.b);
  await expect(columnIn(windows.a, column.title)).toBeVisible();
  await expect(columnIn(windows.b, column.title)).toBeVisible();

  // A reload of window B would make this test pass without any real-time
  // sync at all, so count page loads from here on and expect zero.
  let loadsInB = 0;
  windows.b.on("load", () => {
    loadsInB += 1;
  });

  await addCard(windows.a, column.title, "Written in window A");

  await expect(cardIn(windows.a, column.title, "Written in window A")).toBeVisible();
  await expect(cardIn(windows.b, column.title, "Written in window A")).toBeVisible();
  // Exactly one copy: the event must not also be applied on top of a refetch.
  await expect(cardIn(windows.b, column.title, "Written in window A")).toHaveCount(1);
  expect(loadsInB).toBe(0);
});

test("a card moved to another column in window A moves in window B", async ({
  windows,
  seed,
  request,
}) => {
  const source = await seed.column("Backlog");
  const target = await seed.column("Shipped");
  await seed.card(source.id, "Move me");

  await openBoard(windows.a);
  await openBoard(windows.b);
  await expect(cardIn(windows.a, source.title, "Move me")).toBeVisible();
  await expect(cardIn(windows.b, source.title, "Move me")).toBeVisible();

  await dragCardToColumn(windows.a, "Move me", target.title);

  await expect(cardIn(windows.a, target.title, "Move me")).toBeVisible();
  await expect(cardIn(windows.b, target.title, "Move me")).toBeVisible();
  await expect(cardIn(windows.b, source.title, "Move me")).toHaveCount(0);

  // The move must be saved on the server, not only drawn in the two windows.
  const board = await getBoard(request);
  const moved = board.cards.find((card) => card.title === "Move me");
  expect(moved?.columnId).toBe(target.id);
});

test("an unreachable API rolls the optimistic card back and shows an error toast", async ({
  page,
  seed,
  request,
}) => {
  const column = await seed.column("Offline column");
  await seed.card(column.id, "Already saved");
  await openBoard(page);
  await expect(cardIn(page, column.title, "Already saved")).toBeVisible();

  // Aborting immediately would make the optimistic card flash by too fast to
  // observe. Holding the request until the test says so lets us assert BOTH
  // moments: the card first appears, and only afterwards is it taken back.
  let releaseRequest!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  await page.route("**/api/cards", async (route) => {
    // Only the create request is blocked. The browser's preflight and the
    // board refetch after a failure must keep working normally.
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await gate;
    await route.abort("connectionrefused");
  });

  await addCard(page, column.title, "Will be rolled back");
  await expect(cardIn(page, column.title, "Will be rolled back")).toBeVisible();

  releaseRequest();

  await expect(page.getByRole("alert")).toContainText(
    "Couldn't add the card. Cannot reach the server.",
  );
  await expect(cardIn(page, column.title, "Will be rolled back")).toHaveCount(0);
  // The rollback must not disturb cards that were already saved.
  await expect(cardIn(page, column.title, "Already saved")).toBeVisible();

  // The request never reached the server, so nothing may have been stored.
  const board = await getBoard(request);
  expect(board.cards.map((card) => card.title)).not.toContain("Will be rolled back");
});
