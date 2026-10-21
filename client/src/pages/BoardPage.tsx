import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Board } from "../components/Board";
import { Header } from "../components/Header";
import { ghostButton, primaryButton } from "../components/styles";
import { useBoardSocket } from "../hooks/useBoardSocket";
import { useBoardStore } from "../store/boardStore";

function LoadingBoard() {
  return (
    <div
      role="status"
      aria-label="Loading board"
      className="flex flex-col gap-5 md:flex-row md:items-start"
    >
      <span className="sr-only">Loading board…</span>
      {[3, 2, 1].map((cardCount, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="w-full animate-pulse rounded-2xl border border-line bg-paper-deep/70 p-3 md:w-80"
        >
          <div className="mb-4 h-6 w-2/5 rounded bg-line" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: cardCount }, (_, cardIndex) => (
              <div key={cardIndex} className="h-14 rounded-xl bg-line/60" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();

  const status = useBoardStore((state) => state.status);
  const errorMessage = useBoardStore((state) => state.errorMessage);
  const loadBoard = useBoardStore((state) => state.loadBoard);
  const setBoardId = useBoardStore((state) => state.setBoardId);

  useEffect(() => {
    if (boardId) {
      setBoardId(boardId);
      void loadBoard(boardId);
    }
  }, [boardId, setBoardId, loadBoard]);

  // Connects WebSocket with single-use ws-ticket for the board
  useBoardSocket(boardId);

  return (
    <div className="min-h-screen">
      <a
        href="#board"
        className="sr-only rounded-lg bg-card px-4 py-2 font-semibold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to the board
      </a>

      <Header />

      <main
        id="board"
        tabIndex={-1}
        aria-busy={status === "loading"}
        className="px-4 pb-10 focus:outline-none sm:px-8"
      >
        <div className="mb-6 flex items-center justify-between">
          <Link to="/boards" className={`inline-flex items-center gap-1.5 ${ghostButton}`}>
            <span aria-hidden="true">←</span>
            <span>All boards</span>
          </Link>
        </div>

        {status === "loading" && <LoadingBoard />}

        {status === "error" && (
          <div
            role="alert"
            className="max-w-md rounded-2xl border border-accent bg-card p-5 shadow-sm"
          >
            <h2 className="font-display text-xl font-bold">The board could not be loaded</h2>
            <p className="mt-1 text-sm text-ink-soft">{errorMessage}</p>
            <button
              type="button"
              onClick={() => {
                if (boardId) void loadBoard(boardId);
              }}
              className={`mt-4 ${primaryButton}`}
            >
              Try again
            </button>
          </div>
        )}

        {status === "ready" && <Board />}
      </main>
    </div>
  );
}
