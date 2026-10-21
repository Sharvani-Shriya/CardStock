import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { isTempId } from "./lib/ids";
import { useBoardStore } from "./store/boardStore";
import {
  countRequests,
  createDeferred,
  FakeWebSocket,
  installFakeWebSocket,
  jsonResponse,
  makeCard,
  makeColumn,
  mockFetch,
  resetStores,
  setAuthenticatedUser,
} from "./test/helpers";
import type { Deferred } from "./test/helpers";
import type { BoardResponse } from "./types";

type User = ReturnType<typeof userEvent.setup>;

// The arrays are deliberately NOT in position order, so the tests prove that the
// screen sorts by `position` instead of trusting the order the server sent.
const board: BoardResponse = {
  columns: [
    makeColumn({ id: "col-done", title: "Done", position: 2 }),
    makeColumn({ id: "col-todo", title: "To do", position: 0 }),
    makeColumn({ id: "col-doing", title: "Doing", position: 1 }),
  ],
  cards: [
    makeCard({ id: "card-2", columnId: "col-todo", title: "Review the pull request", position: 1 }),
    makeCard({ id: "card-1", columnId: "col-todo", title: "Write the tests", position: 0 }),
    makeCard({
      id: "card-3",
      columnId: "col-doing",
      title: "Design the logo",
      description: "Two options",
      position: 0,
    }),
  ],
};

const boardApiResponse = {
  board: { id: "board-1", title: "My Board" },
  columns: board.columns,
  cards: board.cards,
};

// Card titles are <h3> and column titles are <h2>. Finding the column through
// its heading is more robust than relying on how <section> maps to an ARIA role.
async function findColumn(title: RegExp): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { level: 2, name: title });
  const column = heading.closest("section");
  if (!column) throw new Error("A column heading should sit inside a <section>");
  return column;
}

// Drives the real UI the way a person would: open the form, type, submit.
async function submitNewCard(user: User, title: string): Promise<HTMLElement> {
  const todoColumn = await findColumn(/^To do/);
  await user.click(within(todoColumn).getByRole("button", { name: /add card/i }));
  await user.type(within(todoColumn).getByRole("textbox", { name: "Card title" }), title);
  await user.click(within(todoColumn).getByRole("button", { name: "Add card" }));
  return todoColumn;
}

beforeEach(() => {
  resetStores();
  installFakeWebSocket();
});

describe("authentication and routing", () => {
  it("redirects unauthenticated users to the sign in page", async () => {
    window.history.pushState({}, "", "/boards");
    mockFetch({
      "POST /api/auth/refresh": () => jsonResponse(401, { error: { message: "Unauthorized" } }),
    });

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Cardstock" })).toBeInTheDocument();
    expect(screen.getByText("Sign in to access your boards")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create one now" })).toHaveAttribute("href", "/register");
  });
});

describe("rendering the board", () => {
  it("shows a loading state, then the columns and cards from the API", async () => {
    setAuthenticatedUser();
    window.history.pushState({}, "", "/boards/board-1");

    mockFetch({
      "POST /api/auth/ws-ticket": () => jsonResponse(200, { ticket: "ticket-1" }),
      "GET /api/boards/board-1": () => jsonResponse(200, boardApiResponse),
      "GET /api/board": () => jsonResponse(200, boardApiResponse),
    });

    render(<App />);

    // The very first paint happens before the API has answered.
    expect(screen.getByRole("status", { name: "Loading board" })).toBeInTheDocument();

    const columnHeadings = await screen.findAllByRole("heading", { level: 2 });
    expect(columnHeadings).toHaveLength(3);
    expect(columnHeadings[0]).toHaveTextContent(/^To do, 2 cards$/);
    expect(columnHeadings[1]).toHaveTextContent(/^Doing/);
    expect(columnHeadings[2]).toHaveTextContent(/^Done, 0 cards$/);

    const todoColumn = await findColumn(/^To do/);
    const todoTitles = within(todoColumn)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(todoTitles).toEqual(["Write the tests", "Review the pull request"]);

    const doingColumn = await findColumn(/^Doing/);
    expect(within(doingColumn).getByText("Two options")).toBeInTheDocument();

    const doneColumn = await findColumn(/^Done/);
    expect(within(doneColumn).getByText(/nothing here yet/i)).toBeInTheDocument();
  });
});

describe("adding a card", () => {
  it("shows the card immediately, then swaps the temporary id for the server's id", async () => {
    setAuthenticatedUser();
    window.history.pushState({}, "", "/boards/board-1");

    const user = userEvent.setup();
    const serverAnswer = createDeferred<Response>();
    const calls = mockFetch({
      "POST /api/auth/ws-ticket": () => jsonResponse(200, { ticket: "ticket-1" }),
      "GET /api/boards/board-1": () => jsonResponse(200, boardApiResponse),
      "POST /api/boards/board-1/cards": () => serverAnswer.promise,
      "POST /api/cards": () => serverAnswer.promise,
    });
    render(<App />);

    const todoColumn = await submitNewCard(user, "Ship the release");

    // The server has not answered yet, so whatever is on screen is optimistic.
    expect(within(todoColumn).getByRole("heading", { name: "Ship the release" })).toBeInTheDocument();
    expect(within(todoColumn).getByText("Saving…")).toBeInTheDocument();
    const optimistic = useBoardStore.getState().cards.filter((card) => card.title === "Ship the release");
    expect(optimistic).toHaveLength(1);
    expect(isTempId(optimistic[0].id)).toBe(true);

    serverAnswer.resolve(
      jsonResponse(201, {
        id: "card-new",
        columnId: "col-todo",
        title: "Ship the release",
        description: "",
        position: 2,
      }),
    );

    await waitFor(() => {
      expect(useBoardStore.getState().cards.map((card) => card.id)).toContain("card-new");
    });
    expect(useBoardStore.getState().cards.some((card) => isTempId(card.id))).toBe(false);
    expect(within(todoColumn).queryByText("Saving…")).not.toBeInTheDocument();
    // Swapped, not added: the user must never see the card twice.
    expect(within(todoColumn).getAllByRole("heading", { name: "Ship the release" })).toHaveLength(1);

    // The temporary id is a client-side detail and must never reach the server.
    const request = calls.find(
      (call) => call.method === "POST" && (call.path === "/api/boards/board-1/cards" || call.path === "/api/cards"),
    );
    expect(request?.body).toEqual({
      columnId: "col-todo",
      title: "Ship the release",
      description: "",
    });
    // The server uses this header to avoid echoing our own change back to us.
    expect(request?.headers.get("X-Client-Id")).toBeTruthy();
  });

  const failures: { name: string; fail: (request: Deferred<Response>) => void; toast: string }[] = [
    {
      name: "the server answers with an error",
      fail: (request) => request.resolve(jsonResponse(500, { error: { message: "Database is down" } })),
      toast: "Couldn't add the card. Database is down",
    },
    {
      name: "the server cannot be reached",
      fail: (request) => request.reject(new TypeError("Failed to fetch")),
      toast: "Couldn't add the card. Cannot reach the server.",
    },
  ];

  it.each(failures)("rolls back and shows an error toast when $name", async ({ fail, toast }) => {
    setAuthenticatedUser();
    window.history.pushState({}, "", "/boards/board-1");

    const user = userEvent.setup();
    const serverAnswer = createDeferred<Response>();
    const calls = mockFetch({
      "POST /api/auth/ws-ticket": () => jsonResponse(200, { ticket: "ticket-1" }),
      "GET /api/boards/board-1": () => jsonResponse(200, boardApiResponse),
      "POST /api/boards/board-1/cards": () => serverAnswer.promise,
      "POST /api/cards": () => serverAnswer.promise,
    });
    render(<App />);

    const todoColumn = await submitNewCard(user, "Doomed card");
    // The card is shown first and only then taken back, which is what makes it "optimistic".
    expect(within(todoColumn).getByRole("heading", { name: "Doomed card" })).toBeInTheDocument();

    fail(serverAnswer);

    // The store restores the old state and shows the toast in the same step,
    // so once the toast is visible the rollback has already happened.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(toast);
    expect(within(todoColumn).queryByRole("heading", { name: "Doomed card" })).not.toBeInTheDocument();
    expect(useBoardStore.getState().cards).toEqual(board.cards);

    // After a failure the board is quietly reloaded, because restoring a snapshot
    // could also undo a teammate's change that arrived while the request was open.
    await waitFor(() =>
      expect(
        countRequests(calls, "GET", "/api/boards/board-1") + countRequests(calls, "GET", "/api/board"),
      ).toBe(2),
    );
  });
});

describe("live connection", () => {
  it("shows 'Live' and reloads the board once the socket connects", async () => {
    setAuthenticatedUser();
    window.history.pushState({}, "", "/boards/board-1");

    const calls = mockFetch({
      "POST /api/auth/ws-ticket": () => jsonResponse(200, { ticket: "ticket-1" }),
      "GET /api/boards/board-1": () => jsonResponse(200, boardApiResponse),
      "GET /api/board": () => jsonResponse(200, boardApiResponse),
    });
    render(<App />);
    await screen.findAllByRole("heading", { level: 2 });

    expect(screen.getByText("Connecting…")).toBeInTheDocument();

    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    const [socket] = FakeWebSocket.instances;
    expect(socket.url).toMatch(/ticket=ticket-1/);

    act(() => socket.simulateOpen());

    expect(await screen.findByText("Live")).toBeInTheDocument();
    // Events sent while we were offline are lost, so every connect refetches.
    await waitFor(() =>
      expect(
        countRequests(calls, "GET", "/api/boards/board-1") + countRequests(calls, "GET", "/api/board"),
      ).toBe(2),
    );
  });

  it("applies an event pushed over the socket without a reload", async () => {
    setAuthenticatedUser();
    window.history.pushState({}, "", "/boards/board-1");

    mockFetch({
      "POST /api/auth/ws-ticket": () => jsonResponse(200, { ticket: "ticket-1" }),
      "GET /api/boards/board-1": () => jsonResponse(200, boardApiResponse),
      "GET /api/board": () => jsonResponse(200, boardApiResponse),
    });
    render(<App />);
    const doingColumn = await findColumn(/^Doing/);

    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    act(() => FakeWebSocket.instances[0].simulateOpen());
    act(() => {
      FakeWebSocket.instances[0].simulateMessage({
        type: "card:created",
        card: makeCard({ id: "card-remote", columnId: "col-doing", title: "Added by a teammate", position: 1 }),
      });
    });

    expect(within(doingColumn).getByRole("heading", { name: "Added by a teammate" })).toBeInTheDocument();
  });

  it("reconnects after the socket drops and reloads the board again", async () => {
    setAuthenticatedUser();
    window.history.pushState({}, "", "/boards/board-1");

    const calls = mockFetch({
      "POST /api/auth/ws-ticket": () => jsonResponse(200, { ticket: "ticket-1" }),
      "GET /api/boards/board-1": () => jsonResponse(200, boardApiResponse),
      "GET /api/board": () => jsonResponse(200, boardApiResponse),
    });
    render(<App />);
    await screen.findAllByRole("heading", { level: 2 });

    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    act(() => FakeWebSocket.instances[0].simulateOpen());
    expect(await screen.findByText("Live")).toBeInTheDocument();

    act(() => FakeWebSocket.instances[0].simulateClose());
    expect(await screen.findByText("Reconnecting…")).toBeInTheDocument();

    // The first retry waits 250-500 ms (backoff plus jitter), so allow some room.
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2), { timeout: 2000 });

    act(() => FakeWebSocket.instances[1].simulateOpen());
    expect(await screen.findByText("Live")).toBeInTheDocument();
    // Initial load, first connect, second connect.
    await waitFor(() =>
      expect(
        countRequests(calls, "GET", "/api/boards/board-1") + countRequests(calls, "GET", "/api/board"),
      ).toBe(3),
    );
  });
});
