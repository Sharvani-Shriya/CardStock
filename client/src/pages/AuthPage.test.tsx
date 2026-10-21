import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/authStore";
import { AuthPage } from "./AuthPage";

describe("AuthPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      status: "ready",
    });
    vi.restoreAllMocks();
  });

  describe("Form Validation", () => {
    it("validates empty email and password on login", async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <AuthPage mode="login" />
        </MemoryRouter>,
      );

      const submitButton = screen.getByRole("button", { name: /sign in/i });
      await user.click(submitButton);

      const emailAlert = screen.getByText("Email is required.");
      expect(emailAlert).toBeInTheDocument();
      expect(emailAlert).toHaveAttribute("role", "alert");

      const emailInput = screen.getByLabelText(/email address/i);
      expect(emailInput).toHaveAttribute("aria-invalid", "true");
    });

    it("validates invalid email format", async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <AuthPage mode="login" />
        </MemoryRouter>,
      );

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, "invalid-email");

      const submitButton = screen.getByRole("button", { name: /sign in/i });
      await user.click(submitButton);

      const alert = screen.getByText("Please enter a valid email address.");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute("role", "alert");
    });

    it("validates password length of at least 8 chars in register mode", async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <AuthPage mode="register" />
        </MemoryRouter>,
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password/i);

      await user.type(emailInput, "alice@example.com");
      await user.type(passwordInput, "short");

      const submitButton = screen.getByRole("button", { name: /create account/i });
      await user.click(submitButton);

      const passAlert = screen.getByText("Password must be at least 8 characters.");
      expect(passAlert).toBeInTheDocument();
      expect(passAlert).toHaveAttribute("role", "alert");
      expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    });
  });

  describe("Error Announcements and Submissions", () => {
    it("announces API error message via top-level role='alert' on failed login", async () => {
      const loginMock = vi.fn().mockRejectedValueOnce(new Error("Invalid email or password."));
      useAuthStore.setState({ login: loginMock });

      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <AuthPage mode="login" />
        </MemoryRouter>,
      );

      await user.type(screen.getByLabelText(/email address/i), "alice@example.com");
      await user.type(screen.getByLabelText(/^password/i), "secretpassword");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      await waitFor(() => {
        const errorBanner = screen.getByText("Invalid email or password.");
        expect(errorBanner).toBeInTheDocument();
        expect(errorBanner).toHaveAttribute("role", "alert");
      });
    });

    it("toggles password visibility with accessible button", async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <AuthPage mode="login" />
        </MemoryRouter>,
      );

      const passwordInput = screen.getByLabelText(/^password/i);
      expect(passwordInput).toHaveAttribute("type", "password");

      const toggleBtn = screen.getByRole("button", { name: "Show password as plain text" });
      await user.click(toggleBtn);

      expect(passwordInput).toHaveAttribute("type", "text");
      expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
    });
  });
});
