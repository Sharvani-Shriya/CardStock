import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "../components/Header";
import {
  ghostButton,
  inputClass,
  primaryButton,
  smallButton,
  smallDangerButton,
} from "../components/styles";
import { useBoardsStore } from "../store/boardsStore";
import type { BoardSummary } from "../types";

export function BoardsPage() {
  const boards = useBoardsStore((state) => state.boards);
  const status = useBoardsStore((state) => state.status);
  const errorMessage = useBoardsStore((state) => state.errorMessage);
  const loadBoards = useBoardsStore((state) => state.loadBoards);
  const createBoard = useBoardsStore((state) => state.createBoard);
  const renameBoard = useBoardsStore((state) => state.renameBoard);
  const deleteBoard = useBoardsStore((state) => state.deleteBoard);

  const [newTitle, setNewTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const navigate = useNavigate();
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    setIsCreating(true);
    try {
      const created = await createBoard(title);
      setNewTitle("");
      navigate(`/boards/${created.id}`);
    } catch {
      // Error is toasted by the store
    } finally {
      setIsCreating(false);
    }
  };

  const startRename = (board: BoardSummary) => {
    setEditingId(board.id);
    setEditTitle(board.title);
  };

  const handleSaveRename = async (id: string) => {
    const title = editTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    try {
      await renameBoard(id, title);
    } finally {
      setEditingId(null);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    // Window.confirm matching column deletion
    const confirmed = window.confirm(
      `Are you sure you want to delete "${title}"? All columns and cards in this board will be permanently removed.`,
    );
    if (!confirmed) return;

    await deleteBoard(id);
  };

  return (
    <div className="min-h-screen">
      {/* Keyboard navigation skip link */}
      <a
        href="#main-content"
        className="sr-only rounded-lg bg-card px-4 py-2 font-semibold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to main content
      </a>

      <Header />

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 pb-12 sm:px-8 focus:outline-none">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Your Boards
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Select an existing workspace or create a new board to get started.
            </p>
          </div>

          <form onSubmit={handleCreate} className="flex max-w-md items-center gap-2">
            <label htmlFor="new-board-title" className="sr-only">
              New board title
            </label>
            <input
              id="new-board-title"
              ref={createInputRef}
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New board title…"
              className={`${inputClass} sm:w-64`}
              disabled={isCreating}
            />
            <button
              type="submit"
              disabled={isCreating || !newTitle.trim()}
              className={`${primaryButton} whitespace-nowrap`}
            >
              {isCreating ? "Creating…" : "Create board"}
            </button>
          </form>
        </div>

        {/* Loading State */}
        {status === "loading" && (
          <div
            role="status"
            aria-label="Loading boards"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          >
            <span className="sr-only">Loading boards…</span>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                aria-hidden="true"
                className="h-32 animate-pulse rounded-2xl border border-line bg-paper-deep/60 p-5"
              >
                <div className="h-5 w-3/4 rounded bg-line" />
                <div className="mt-4 h-4 w-1/2 rounded bg-line/60" />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {status === "error" && (
          <div
            role="alert"
            className="max-w-md rounded-2xl border border-accent bg-card p-6 shadow-sm"
          >
            <h3 className="font-display text-xl font-bold text-ink">Couldn&apos;t load boards</h3>
            <p className="mt-1 text-sm text-ink-soft">{errorMessage}</p>
            <button
              type="button"
              onClick={() => void loadBoards()}
              className={`mt-4 ${primaryButton}`}
            >
              Try again
            </button>
          </div>
        )}

        {/* Ready State */}
        {status === "ready" && (
          <>
            {boards.length === 0 ? (
              // Empty State
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-card/60 px-6 py-16 text-center">
                <div className="mb-3 rounded-full bg-paper p-3 text-accent" aria-hidden="true">
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 4.5v15m6-15v15m-10.875 0h17.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z"
                    />
                  </svg>
                </div>
                <h3 className="font-display text-xl font-bold text-ink">No boards yet</h3>
                <p className="mt-1 max-w-sm text-sm text-ink-soft">
                  Get started by creating your first Kanban board to organize your tasks and projects.
                </p>
                <button
                  type="button"
                  onClick={() => createInputRef.current?.focus()}
                  className={`mt-4 ${primaryButton}`}
                >
                  Create your first board
                </button>
              </div>
            ) : (
              // Board list grid
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {boards.map((board) => {
                  const isEditing = editingId === board.id;

                  return (
                    <div
                      key={board.id}
                      className="group relative flex flex-col justify-between rounded-2xl border border-line bg-card p-5 shadow-sm transition hover:border-accent/40 hover:shadow-md"
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <label htmlFor={`edit-title-${board.id}`} className="sr-only">
                            Board title
                          </label>
                          <input
                            id={`edit-title-${board.id}`}
                            ref={editInputRef}
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleSaveRename(board.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className={inputClass}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSaveRename(board.id)}
                              className={smallButton}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className={ghostButton}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Link
                            to={`/boards/${board.id}`}
                            className="block focus-visible:rounded"
                          >
                            <h3 className="font-display text-lg font-bold text-ink group-hover:text-accent">
                              {board.title}
                            </h3>
                            <p className="mt-1 text-xs text-ink-soft">
                              Click to open board →
                            </p>
                          </Link>

                          <div className="mt-4 flex items-center justify-end gap-1 border-t border-line/60 pt-3">
                            <button
                              type="button"
                              onClick={() => startRename(board)}
                              className={smallButton}
                              aria-label={`Rename ${board.title}`}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(board.id, board.title)}
                              className={smallDangerButton}
                              aria-label={`Delete ${board.title}`}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
