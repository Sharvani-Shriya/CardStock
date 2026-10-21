import { createBoard, registerUser } from "./support/api";
import { openBoard } from "./support/board";
import { CLIENT_URL } from "./support/env";
import { expect, test } from "./support/fixtures";

test.describe("Authentication & Authorization E2E", () => {
  test("register and login via the UI", async ({ browser }) => {
    // Fresh unauthenticated browser context
    const context = await browser.newContext();
    const page = await context.newPage();

    const uniqueEmail = `ui-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const password = "securePassword123";

    // 1. Register via the UI
    await page.goto("/register");
    await page.getByLabel(/email address/i).fill(uniqueEmail);
    await page.getByLabel(/^password/i).fill(password);
    await page.getByRole("button", { name: /create account/i }).click();

    // After registration, user is redirected to /boards and header shows email
    await expect(page).toHaveURL(/\/boards/);
    await expect(page.getByText(uniqueEmail)).toBeVisible();

    // 2. Log out
    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // 3. Log back in via the UI
    await page.getByLabel(/email address/i).fill(uniqueEmail);
    await page.getByLabel(/^password/i).fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/boards/);
    await expect(page.getByText(uniqueEmail)).toBeVisible();

    await context.close();
  });

  test("two users cannot see each other's boards", async ({ browser, request, auth }) => {
    // User A creates a private board
    const userABoard = await createBoard(request, "User A Secret Board", auth.accessToken);

    // Register User B via API and create a separate browser context for User B
    const userB = await registerUser(request);
    const contextB = await browser.newContext();
    if (userB.refreshToken) {
      await contextB.addCookies([
        {
          name: "refreshToken",
          value: userB.refreshToken,
          domain: "127.0.0.1",
          path: "/api/auth",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
    }

    const pageB = await contextB.newPage();

    // User B views /boards
    await pageB.goto("/boards");
    await expect(pageB.getByText(userB.email)).toBeVisible();

    // User B cannot see User A's board in their board list
    await expect(pageB.getByText("User A Secret Board")).toHaveCount(0);

    // If User B tries navigating directly to User A's board URL, they get an error
    await pageB.goto(`/boards/${userABoard.id}`);
    await expect(pageB.getByRole("alert")).toContainText("The board could not be loaded");
    await expect(pageB.getByText("User A Secret Board")).toHaveCount(0);

    await contextB.close();
  });

  test("logout redirects and stops the socket", async ({ page, auth }) => {
    // Open board as authenticated user
    await openBoard(page, auth.boardId);
    await expect(page.getByRole("status").filter({ hasText: "Live" })).toBeVisible();

    // Click Log out
    await page.getByRole("button", { name: /log out/i }).click();

    // Redirects to /login
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1, name: "Cardstock" })).toBeVisible();

    // Socket and board are no longer active
    await expect(page.getByRole("status").filter({ hasText: "Live" })).toHaveCount(0);
  });
});
