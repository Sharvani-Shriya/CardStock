import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "../store/authStore";
import { ProtectedRoute } from "./ProtectedRoute";

function MockLogin() {
  const location = useLocation();
  const state = location.state as { from?: { pathname: string } } | null;
  return (
    <div>
      <h1>Login Page</h1>
      <p data-testid="from-path">{state?.from?.pathname ?? "none"}</p>
    </div>
  );
}

function MockProtectedContent() {
  return <h1>Protected Dashboard</h1>;
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      status: "ready",
    });
  });

  it("shows loading spinner when status is 'loading'", () => {
    useAuthStore.setState({ user: null, status: "loading" });

    render(
      <MemoryRouter initialEntries={["/boards"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/boards" element={<MockProtectedContent />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Protected Dashboard")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated user to /login and preserves location in state.from", () => {
    useAuthStore.setState({ user: null, status: "ready" });

    render(
      <MemoryRouter initialEntries={["/boards/board-123"]}>
        <Routes>
          <Route path="/login" element={<MockLogin />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/boards/board-123" element={<MockProtectedContent />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.getByTestId("from-path")).toHaveTextContent("/boards/board-123");
    expect(screen.queryByText("Protected Dashboard")).not.toBeInTheDocument();
  });

  it("renders protected content (Outlet) when user is authenticated", () => {
    useAuthStore.setState({
      user: { id: "user-1", email: "alice@example.com" },
      accessToken: "valid-token",
      status: "ready",
    });

    render(
      <MemoryRouter initialEntries={["/boards"]}>
        <Routes>
          <Route path="/login" element={<MockLogin />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/boards" element={<MockProtectedContent />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Protected Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
  });
});
