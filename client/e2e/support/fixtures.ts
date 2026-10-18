import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Card, Column } from "../../src/types";
import { createCard, createColumn, resetBoard } from "./api";

export interface Seeder {
  column(title: string): Promise<Column>;
  card(columnId: string, title: string): Promise<Card>;
}

export interface Windows {
  a: Page;
  b: Page;
}

export const test = base.extend<{ seed: Seeder; windows: Windows }>({
  // Empties the board before the test, so each test starts from a known state
  // and can use short, readable column titles without worrying about leftovers
  // from an earlier run.
  seed: async ({ request }, use) => {
    await resetBoard(request);
    await use({
      column: (title) => createColumn(request, title),
      card: (columnId, title) => createCard(request, columnId, title),
    });
  },

  // Two separate browser contexts behave like two different people: they do not
  // share cookies or storage, and each page gets its own client id and WebSocket.
  // (Two tabs in one context would be less convincing evidence of real-time sync.)
  windows: async ({ browser }, use) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const a = await contextA.newPage();
    const b = await contextB.newPage();

    await use({ a, b });

    await contextA.close();
    await contextB.close();
  },
});

export { expect } from "@playwright/test";
