import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/authStore";
import { useBoardsStore } from "../store/boardsStore";
import { BoardsPage } from "./BoardsPage";

describe("BoardsPage", () => {
  const mockBoards = [
    { id: "b1", title: "Project Alpha", createdAt: "2026-01-01" },
    { id: "b2", title: "Project Beta", createdAt: "2026-01-02" },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      user: { id: "user-1", email: "alice@example.com" },
      accessToken: "access-token",
      status: "ready",
    });
    useBoardsStore.setState({
      boards: [...mockBoards],
      status: "ready",
      errorMessage: null,
      loadBoards: vi.fn(),
      createBoard: vi.fn(),
      renameBoard: vi.fn(),
      deleteBoard: vi.fn(),
    });
  });

  it("renders existing boards", () => {
    render(
      <MemoryRouter>
        <BoardsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Project Alpha")).toBeInTheDocument();
    expect(screen.getByText("Project Beta")).toBeInTheDocument();
  });

  it("creates a new board and navigates to it", async () => {
    const createBoardMock = vi.fn().mockResolvedValueOnce({
      id: "b3",
      title: "Project Gamma",
    });
    useBoardsStore.setState({ createBoard: createBoardMock });

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/boards"]}>
        <Routes>
          <Route path="/boards" element={<BoardsPage />} />
          <Route path="/boards/:id" element={<div>Board Detail Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const input = screen.getByPlaceholderText(/new board title/i);
    await user.type(input, "Project Gamma");

    const submitBtn = screen.getByRole("button", { name: /create board/i });
    await user.click(submitBtn);

    expect(createBoardMock).toHaveBeenCalledWith("Project Gamma");
    await waitFor(() => {
      expect(screen.getByText("Board Detail Page")).toBeInTheDocument();
    });
  });

  it("allows renaming a board inline", async () => {
    const renameBoardMock = vi.fn().mockResolvedValueOnce(undefined);
    useBoardsStore.setState({ renameBoard: renameBoardMock });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BoardsPage />
      </MemoryRouter>,
    );

    // Click rename button on the first board
    const renameBtn = screen.getByRole("button", { name: /Rename Project Alpha/i });
    await user.click(renameBtn);

    const editInput = screen.getByDisplayValue("Project Alpha");
    await user.clear(editInput);
    await user.type(editInput, "Alpha Redux{enter}");

    expect(renameBoardMock).toHaveBeenCalledWith("b1", "Alpha Redux");
  });

  it("deletes a board after confirmation", async () => {
    const deleteBoardMock = vi.fn().mockResolvedValueOnce(undefined);
    useBoardsStore.setState({ deleteBoard: deleteBoardMock });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BoardsPage />
      </MemoryRouter>,
    );

    const deleteBtn = screen.getByRole("button", { name: /Delete Project Alpha/i });
    await user.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(deleteBoardMock).toHaveBeenCalledWith("b1");
  });

  it("does not delete board if user cancels confirmation", async () => {
    const deleteBoardMock = vi.fn();
    useBoardsStore.setState({ deleteBoard: deleteBoardMock });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BoardsPage />
      </MemoryRouter>,
    );

    const deleteBtn = screen.getByRole("button", { name: /Delete Project Alpha/i });
    await user.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(deleteBoardMock).not.toHaveBeenCalled();
  });
});
