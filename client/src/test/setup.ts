// Adds matchers such as toBeInTheDocument() and toHaveTextContent() to Vitest's expect.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only unmounts rendered components on its own when the test
// runner exposes a global `afterEach`. We keep Vitest's globals off (every test
// imports what it uses), so we register the cleanup ourselves. Without it, a
// component rendered by one test would still be in the document during the next.
afterEach(() => {
  cleanup();
});
