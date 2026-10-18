import { cardTitlesIn, keyboardDrag, openBoard } from "./support/board";
import { expect, test } from "./support/fixtures";

// Which element has keyboard focus, as "tag|accessible label". After a drop the
// card's element is rebuilt in its new place, so focus must be put back on it.
async function focusedElement(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    return element ? `${element.tagName}|${element.getAttribute("aria-label") ?? ""}` : "none";
  });
}

test("a card can be moved to another column with the keyboard, and keeps focus", async ({
  page,
  seed,
}) => {
  const todo = await seed.column("To do");
  await seed.column("Done");
  await seed.card(todo.id, "Write report");
  await seed.card(todo.id, "Send invoice");
  await openBoard(page);

  await keyboardDrag(page, "Write report", ["ArrowRight"]);

  expect(await cardTitlesIn(page, "To do")).toEqual(["Send invoice"]);
  expect(await cardTitlesIn(page, "Done")).toEqual(["Write report"]);
  expect(await focusedElement(page)).toBe("BUTTON|Drag card: Write report");

  // The move must be saved on the server, not only drawn on the screen.
  await page.reload();
  await openBoard(page);
  expect(await cardTitlesIn(page, "Done")).toEqual(["Write report"]);
});

test("Left and Right walk across columns, including an empty one", async ({ page, seed }) => {
  const first = await seed.column("First");
  await seed.column("Second");
  await seed.column("Third");
  await seed.card(first.id, "Traveller");
  await openBoard(page);

  await keyboardDrag(page, "Traveller", ["ArrowRight", "ArrowRight"]);
  expect(await cardTitlesIn(page, "Third")).toEqual(["Traveller"]);

  await keyboardDrag(page, "Traveller", ["ArrowLeft", "ArrowLeft"]);
  expect(await cardTitlesIn(page, "First")).toEqual(["Traveller"]);
});

test("Up and Down reorder cards inside a column", async ({ page, seed }) => {
  const column = await seed.column("Backlog");
  await seed.card(column.id, "One");
  await seed.card(column.id, "Two");
  await seed.card(column.id, "Three");
  await openBoard(page);

  await keyboardDrag(page, "One", ["ArrowDown", "ArrowDown"]);
  expect(await cardTitlesIn(page, "Backlog")).toEqual(["Two", "Three", "One"]);

  await keyboardDrag(page, "One", ["ArrowUp"]);
  expect(await cardTitlesIn(page, "Backlog")).toEqual(["Two", "One", "Three"]);

  await page.reload();
  await openBoard(page);
  expect(await cardTitlesIn(page, "Backlog")).toEqual(["Two", "One", "Three"]);
});

test("Escape cancels a keyboard drag and keeps focus on the handle", async ({ page, seed }) => {
  const todo = await seed.column("To do");
  await seed.column("Done");
  await seed.card(todo.id, "Stay put");
  await openBoard(page);

  await page.getByRole("button", { name: "Drag card: Stay put" }).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  expect(await cardTitlesIn(page, "To do")).toEqual(["Stay put"]);
  expect(await cardTitlesIn(page, "Done")).toEqual([]);
  expect(await focusedElement(page)).toBe("BUTTON|Drag card: Stay put");
});
