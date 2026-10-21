import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/authStore";
import { ApiError, fetchBoards } from "./api";

describe("api.ts 401 refresh & retry", () => {
  const dummyUser = { id: "user-1", email: "alice@example.com" };

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      user: dummyUser,
      accessToken: "expired-access-token",
      status: "ready",
    });
  });

  it("handles 401 by refreshing token and retrying the request with the new token", async () => {
    let boardsCallCount = 0;
    let refreshCallCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = (init?.headers as Record<string, string>) || {};

        if (url.includes("/api/boards")) {
          boardsCallCount++;
          if (boardsCallCount === 1) {
            // First attempt with old token fails with 401
            expect(headers["Authorization"]).toBe("Bearer expired-access-token");
            return new Response(JSON.stringify({ error: { message: "Invalid or expired token." } }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
          // Retry attempt with renewed token succeeds
          expect(headers["Authorization"]).toBe("Bearer brand-new-token");
          return new Response(JSON.stringify([{ id: "b1", title: "Project Board" }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (url.includes("/api/auth/refresh")) {
          refreshCallCount++;
          return new Response(
            JSON.stringify({
              user: dummyUser,
              accessToken: "brand-new-token",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response("Not found", { status: 404 });
      }),
    );

    const boards = await fetchBoards();

    expect(boards).toEqual([{ id: "b1", title: "Project Board" }]);
    expect(boardsCallCount).toBe(2);
    expect(refreshCallCount).toBe(1);
    expect(useAuthStore.getState().accessToken).toBe("brand-new-token");
  });

  it("coalesces parallel 401 responses into a single shared refresh request", async () => {
    let refreshCallCount = 0;
    let boardsCallCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = (init?.headers as Record<string, string>) || {};

        if (url.includes("/api/boards")) {
          boardsCallCount++;
          if (headers["Authorization"] === "Bearer expired-access-token") {
            // Simulate 401
            return new Response(JSON.stringify({ error: { message: "Token expired" } }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
          // Retry with fresh token
          return new Response(JSON.stringify([{ id: "b1", title: "Shared Board" }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (url.includes("/api/auth/refresh")) {
          refreshCallCount++;
          // Simulate slight network delay so parallel calls arrive while refresh is in-flight
          await new Promise((r) => setTimeout(r, 20));
          return new Response(
            JSON.stringify({
              user: dummyUser,
              accessToken: "shared-refreshed-token",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response("Not found", { status: 404 });
      }),
    );

    // Run 3 requests in parallel
    const [res1, res2, res3] = await Promise.all([
      fetchBoards(),
      fetchBoards(),
      fetchBoards(),
    ]);

    expect(res1).toEqual([{ id: "b1", title: "Shared Board" }]);
    expect(res2).toEqual([{ id: "b1", title: "Shared Board" }]);
    expect(res3).toEqual([{ id: "b1", title: "Shared Board" }]);

    // Crucial requirement: only ONE refresh call occurred
    expect(refreshCallCount).toBe(1);
    // 3 initial requests + 3 retried requests = 6
    expect(boardsCallCount).toBe(6);
    expect(useAuthStore.getState().accessToken).toBe("shared-refreshed-token");
  });

  it("clears auth and throws 401 ApiError when refresh fails", async () => {
    // Avoid jsdom navigation error when api.ts redirects
    Object.defineProperty(window, "location", {
      writable: true,
      value: { pathname: "/boards", href: "http://localhost/boards" },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("/api/boards")) {
          return new Response(JSON.stringify({ error: { message: "Expired token" } }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (url.includes("/api/auth/refresh")) {
          // Refresh cookie invalid/expired
          return new Response(JSON.stringify({ error: { message: "Refresh token expired" } }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response("Not found", { status: 404 });
      }),
    );

    await expect(fetchBoards()).rejects.toThrow(ApiError);
    await expect(fetchBoards()).rejects.toThrow("Session expired. Please log in again.");

    // Auth state was cleared
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
