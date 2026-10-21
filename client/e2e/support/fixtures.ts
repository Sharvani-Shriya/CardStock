import { test as base } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Card, Column, User } from "../../src/types";
import {
  createCard,
  createColumn,
  registerUser,
  resetBoard,
  setActiveAuth,
} from "./api";
import { API_URL, CLIENT_URL } from "./env";

export interface Seeder {
  boardId: string;
  column(title: string): Promise<Column>;
  card(columnId: string, title: string): Promise<Card>;
}

export interface Windows {
  a: Page;
  b: Page;
}

export interface TestAuth {
  user: User;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  boardId: string;
}

export const test = base.extend<{
  auth: TestAuth;
  seed: Seeder;
  windows: Windows;
}>({
  // Registers a unique user for this test, creates a clean board,
  // and keeps the Bearer token for API seeding.
  auth: async ({ request }, use) => {
    const reg = await registerUser(request);
    setActiveAuth(reg.accessToken, "");

    // Reset boards owned by this test user and create a clean board
    const boardId = await resetBoard(request, reg.accessToken);

    await use({
      user: reg.user,
      email: reg.email,
      password: reg.password,
      accessToken: reg.accessToken,
      refreshToken: reg.refreshToken,
      boardId,
    });
  },

  // Injects the test user's refresh token cookie into the browser context
  // so the application restores session automatically on page load.
  context: async ({ context, auth }, use) => {
    if (auth.refreshToken) {
      await context.addCookies([
        {
          name: "refreshToken",
          value: auth.refreshToken,
          domain: "127.0.0.1",
          path: "/api/auth",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }
    await use(context);
  },

  seed: async ({ request, auth }, use) => {
    await use({
      boardId: auth.boardId,
      column: (title) => createColumn(request, title, auth.accessToken, auth.boardId),
      card: (columnId, title) => createCard(request, columnId, title, auth.accessToken, auth.boardId),
    });
  },

  // Two separate browser contexts representing two windows of the same user
  // (each authenticated with its own session so token rotation works independently).
  windows: async ({ browser, request, auth }, use) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    if (auth.refreshToken) {
      await contextA.addCookies([
        {
          name: "refreshToken",
          value: auth.refreshToken,
          domain: "127.0.0.1",
          path: "/api/auth",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }

    const loginB = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: auth.email, password: auth.password },
    });
    const setCookieB = loginB.headers()["set-cookie"] || "";
    const matchB = setCookieB.match(/refreshToken=([^;]+)/);
    if (matchB) {
      await contextB.addCookies([
        {
          name: "refreshToken",
          value: matchB[1],
          domain: "127.0.0.1",
          path: "/api/auth",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }

    const a = await contextA.newPage();
    const b = await contextB.newPage();

    await use({ a, b });

    await contextA.close();
    await contextB.close();
  },
});

export { expect } from "@playwright/test";
