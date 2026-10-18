import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
// vitest/config re-exports Vite's defineConfig, so the `test` block below is
// type-checked instead of being an untyped bag of options.
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Vitest runs with mode "test". Tests never load CSS, so skipping Tailwind
    // there keeps the test run fast and free of unrelated CSS processing.
    ...(mode === "test" ? [] : tailwindcss()),
  ],
  server: {
    port: 5173,
    // The server's CORS setting expects exactly this origin. Failing when the
    // port is taken is clearer than silently moving to 5174 and getting CORS errors.
    strictPort: true,
  },
  test: {
    // Components need a DOM; jsdom provides one without launching a browser.
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Our fake fetch/WebSocket are installed with vi.stubGlobal. Undoing them
    // after every test guarantees one test's fakes can never leak into another.
    unstubGlobals: true,
  },
}));
