import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { useAuthStore } from "./authStore";

vi.mock("../lib/api", () => ({
  login: vi.fn(),
  register: vi.fn(),
  refreshToken: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
}));

describe("authStore", () => {
  const dummyUser = { id: "user-1", email: "alice@example.com" };
  const dummyToken = "jwt-access-token-123";

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      status: "loading",
    });
  });

  describe("actions", () => {
    it("setSession updates user, token, and status to ready", () => {
      useAuthStore.getState().setSession(dummyUser, dummyToken);
      const state = useAuthStore.getState();
      expect(state.user).toEqual(dummyUser);
      expect(state.accessToken).toBe(dummyToken);
      expect(state.status).toBe("ready");
    });

    it("clearAuth resets user and token to null, status to ready", () => {
      useAuthStore.setState({ user: dummyUser, accessToken: dummyToken, status: "ready" });
      useAuthStore.getState().clearAuth();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.status).toBe("ready");
    });

    it("login calls api.login and saves user and token", async () => {
      vi.mocked(api.login).mockResolvedValueOnce({
        user: dummyUser,
        accessToken: dummyToken,
      });

      await useAuthStore.getState().login("alice@example.com", "password123");

      expect(api.login).toHaveBeenCalledWith({
        email: "alice@example.com",
        password: "password123",
      });
      const state = useAuthStore.getState();
      expect(state.user).toEqual(dummyUser);
      expect(state.accessToken).toBe(dummyToken);
      expect(state.status).toBe("ready");
    });

    it("register calls api.register and saves user and token", async () => {
      vi.mocked(api.register).mockResolvedValueOnce({
        user: dummyUser,
        accessToken: dummyToken,
      });

      await useAuthStore.getState().register("alice@example.com", "password123");

      expect(api.register).toHaveBeenCalledWith({
        email: "alice@example.com",
        password: "password123",
      });
      const state = useAuthStore.getState();
      expect(state.user).toEqual(dummyUser);
      expect(state.accessToken).toBe(dummyToken);
      expect(state.status).toBe("ready");
    });

    it("logout calls api.logout and clears auth state even if api fails", async () => {
      useAuthStore.setState({ user: dummyUser, accessToken: dummyToken, status: "ready" });
      vi.mocked(api.logout).mockRejectedValueOnce(new Error("Network failed"));

      await expect(useAuthStore.getState().logout()).rejects.toThrow("Network failed");

      expect(api.logout).toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.status).toBe("ready");
    });

    it("logoutAll calls api.logoutAll and clears auth state even if api fails", async () => {
      useAuthStore.setState({ user: dummyUser, accessToken: dummyToken, status: "ready" });
      vi.mocked(api.logoutAll).mockRejectedValueOnce(new Error("Network failed"));

      await expect(useAuthStore.getState().logoutAll()).rejects.toThrow("Network failed");

      expect(api.logoutAll).toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.status).toBe("ready");
    });
  });

  describe("restoreSession", () => {
    it("successfully restores user session via refreshToken", async () => {
      vi.mocked(api.refreshToken).mockResolvedValueOnce({
        user: dummyUser,
        accessToken: dummyToken,
      });

      await useAuthStore.getState().restoreSession();

      expect(api.refreshToken).toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.user).toEqual(dummyUser);
      expect(state.accessToken).toBe(dummyToken);
      expect(state.status).toBe("ready");
    });

    it("handles failure gracefully by clearing auth and setting status to ready", async () => {
      vi.mocked(api.refreshToken).mockRejectedValueOnce(new Error("No refresh cookie"));

      await useAuthStore.getState().restoreSession();

      expect(api.refreshToken).toHaveBeenCalled();
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(state.status).toBe("ready");
    });

    it("skips calling refreshToken if user and token already present in memory", async () => {
      useAuthStore.setState({ user: dummyUser, accessToken: dummyToken, status: "loading" });

      await useAuthStore.getState().restoreSession();

      expect(api.refreshToken).not.toHaveBeenCalled();
      expect(useAuthStore.getState().status).toBe("ready");
    });
  });
});
