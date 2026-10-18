import type { Page } from "@playwright/test";
import { cardTitlesIn, columnIn, keyboardDrag, openBoard } from "./support/board";
import { expect, test } from "./support/fixtures";

// True when the page can be scrolled sideways. Measured on the document, so a
// scrollbar on any element that makes the page wider is caught too.
async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

// Eight columns are far more than fit in one row at this width.
const TITLES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"];

test("columns wrap onto new rows and the page never scrolls sideways", async ({ page, seed }) => {
  for (const title of TITLES) await seed.column(title);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openBoard(page);

  const first = await columnIn(page, "Alpha").boundingBox();
  const last = await columnIn(page, "Hotel").boundingBox();
  if (!first || !last) throw new Error("Expected the first and last column to be on screen");

  // Same row: the first columns share a top edge. Wrapped: the last one is lower.
  const second = await columnIn(page, "Bravo").boundingBox();
  expect(second?.y).toBe(first.y);
  expect(last.y).toBeGreaterThan(first.y + first.height - 1);

  expect(await hasHorizontalScroll(page)).toBe(false);

  // A narrower window wraps more, and still has no sideways scrollbar.
  await page.setViewportSize({ width: 800, height: 800 });
  expect(await hasHorizontalScroll(page)).toBe(false);

  // A wide screen is used in full: five 320px columns fit side by side at 1920px,
  // and only the sixth starts a new row. A fixed maximum page width would have
  // wrapped them earlier and left empty space on both sides.
  await page.setViewportSize({ width: 1920, height: 900 });
  const fifth = await columnIn(page, "Echo").boundingBox();
  const sixth = await columnIn(page, "Foxtrot").boundingBox();
  const firstWide = await columnIn(page, "Alpha").boundingBox();
  expect(fifth?.y).toBe(firstWide?.y);
  expect(sixth?.y).toBeGreaterThan((firstWide?.y ?? 0) + 100);
  expect(await hasHorizontalScroll(page)).toBe(false);
});

test("the keyboard can carry a card from the end of one row to the start of the next", async ({
  page,
  seed,
}) => {
  const columns = [];
  for (const title of TITLES.slice(0, 5)) columns.push(await seed.column(title));
  await seed.card(columns[2].id, "Edge card");
  await page.setViewportSize({ width: 1280, height: 800 });
  await openBoard(page);

  // At this width three columns fit per row, so Charlie ends row one and Delta
  // starts row two. Right must still go there even though Delta is not to the
  // right of Charlie on the screen.
  await keyboardDrag(page, "Edge card", ["ArrowRight"]);
  expect(await cardTitlesIn(page, "Delta")).toEqual(["Edge card"]);
  expect(await cardTitlesIn(page, "Charlie")).toEqual([]);

  await keyboardDrag(page, "Edge card", ["ArrowLeft"]);
  expect(await cardTitlesIn(page, "Charlie")).toEqual(["Edge card"]);
});
