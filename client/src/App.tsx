import { useEffect } from "react";
import { Board } from "./components/Board";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { Toasts } from "./components/Toasts";
import { useBoardSocket } from "./hooks/useBoardSocket";
import { useBoardStore } from "./store/boardStore";
import { primaryButton } from "./components/styles";

// Placeholder columns shown while the first load is in flight. They keep the
// page from jumping around when the real board appears.
function LoadingBoard() {
  return (
    <div
      role="status"
      aria-label="Loading board"
      className="flex flex-col gap-5 md:flex-row md:items-start"
    >
      {/* A live region announces the TEXT inside it, not its aria-label, so
          without this line a screen-reader user would hear nothing while loading. */}
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

export default function App() {
  const status = useBoardStore((state) => state.status);
  const errorMessage = useBoardStore((state) => state.errorMessage);
  const loadBoard = useBoardStore((state) => state.loadBoard);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  // Opens the WebSocket and keeps it alive for the lifetime of the app.
  useBoardSocket();

  return (
    <div className="min-h-screen">
      {/* First focusable element: keyboard users can jump past the header. */}
      <a
        href="#board"
        className="sr-only rounded-lg bg-card px-4 py-2 font-semibold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to the board
      </a>

      <header className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Cardstock</h1>
          <p className="text-sm text-ink-soft">A shared board that updates as your team works.</p>
        </div>
        <ConnectionStatus />
      </header>

      {/* tabIndex -1 makes <main> a valid target for the skip link: some browsers
          only move keyboard focus to a link target that can take focus. The
          outline is hidden because <main> is not a control, and a ring around the
          whole page would only be noise. */}
      <main
        id="board"
        tabIndex={-1}
        aria-busy={status === "loading"}
        className="px-4 pb-10 focus:outline-none sm:px-8"
      >
        {status === "loading" && <LoadingBoard />}

        {status === "error" && (
          <div
            role="alert"
            className="max-w-md rounded-2xl border border-accent bg-card p-5 shadow-sm"
          >
            <h2 className="font-display text-xl font-bold">The board could not be loaded</h2>
            <p className="mt-1 text-sm text-ink-soft">{errorMessage}</p>
            <button type="button" onClick={() => void loadBoard()} className={`mt-4 ${primaryButton}`}>
              Try again
            </button>
          </div>
        )}

        {status === "ready" && <Board />}
      </main>

      <Toasts />
    </div>
  );
}
