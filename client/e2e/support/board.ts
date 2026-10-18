import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

// Everything here finds elements by ARIA role and accessible name, the way a
// screen-reader user would. CSS classes are avoided on purpose: they change
// whenever the design does, while roles and labels are part of the contract.

// Each column is a <section> labelled by its heading, which makes it a "region".
// Playwright matches names by case-insensitive substring, and the heading also
// contains the card count, so the plain title is enough.
export function columnIn(page: Page, columnTitle: string): Locator {
  return page.getByRole("region", { name: columnTitle });
}

export function cardIn(page: Page, columnTitle: string, cardTitle: string): Locator {
  return columnIn(page, columnTitle).getByRole("heading", { level: 3, name: cardTitle });
}

// Waits for the "Live" badge, not just for the page to load. Until the socket is
// open the window cannot receive events, and a test that creates data too early
// would pass for the wrong reason (the card would arrive via the first load).
export async function openBoard(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();
}

export async function addCard(page: Page, columnTitle: string, cardTitle: string): Promise<void> {
  const column = columnIn(page, columnTitle);
  // The opening button's accessible name includes the column, because every
  // column has one and a screen-reader user must be able to tell them apart.
  await column.getByRole("button", { name: `Add card to ${columnTitle}` }).click();
  await column.getByRole("textbox", { name: "Card title" }).fill(cardTitle);
  // Once the form is open it has its own submit button with the exact name "Add card".
  await column.getByRole("button", { name: "Add card", exact: true }).click();
}

// Drags with the real mouse, like a user would. The card's drag handle is the
// only drag activator, and the drop target is the target column's card list
// (which stays droppable even when it is empty).
export async function dragCardToColumn(
  page: Page,
  cardTitle: string,
  targetColumnTitle: string,
): Promise<void> {
  const handle = page.getByRole("button", { name: `Drag card: ${cardTitle}` });
  const targetList = page.getByRole("list", { name: `Cards in ${targetColumnTitle}` });

  // A column outside the visible area cannot receive a mouse drop.
  await handle.scrollIntoViewIfNeeded();
  await targetList.scrollIntoViewIfNeeded();

  const handleBox = await handle.boundingBox();
  const targetBox = await targetList.boundingBox();
  if (!handleBox || !targetBox) {
    throw new Error("Cannot drag: the card handle or the target column is not visible");
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // The board ignores pointer movement under 5px so that a plain click never
  // starts a drag. A first small nudge crosses that threshold.
  await page.mouse.move(startX + 10, startY + 10, { steps: 5 });
  // Many small steps give the drag library time to notice each column the card
  // passes over, which a single jump would skip.
  await page.mouse.move(endX, endY, { steps: 25 });
  await page.mouse.up();
}

// Drags with the keyboard, the way a keyboard or screen-reader user does: focus
// the handle, press Space to pick the card up, arrow keys to move it, Space to
// drop it. The short pauses give dnd-kit time to measure the new layout after
// each key, which is also what a person pressing keys one by one provides.
export async function keyboardDrag(page: Page, cardTitle: string, keys: string[]): Promise<void> {
  const pause = () => page.waitForTimeout(300);

  await page.getByRole("button", { name: `Drag card: ${cardTitle}` }).focus();
  await page.keyboard.press("Space");
  await pause();
  for (const key of keys) {
    await page.keyboard.press(key);
    await pause();
  }
  await page.keyboard.press("Space");
  await pause();
}

// The titles of a column's cards, top to bottom, as a screen reader would list them.
export async function cardTitlesIn(page: Page, columnTitle: string): Promise<string[]> {
  return columnIn(page, columnTitle).getByRole("heading", { level: 3 }).allTextContents();
}
