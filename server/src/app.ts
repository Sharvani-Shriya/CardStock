import cors from "cors";
import express, { type Express } from "express";
import mongoose from "mongoose";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { boardRouter } from "./routes/board";
import { cardsRouter } from "./routes/cards";
import { columnsRouter } from "./routes/columns";

interface AppOptions {
  // Comma-separated list of origins the browser client may call from.
  clientOrigin: string;
}

// The Express app lives apart from index.ts (which starts the HTTP server and
// the database connection) so it can be imported without side effects, for
// example by tests later.
export function createApp({ clientOrigin }: AppOptions): Express {
  const app = express();

  app.use(
    cors({
      origin: clientOrigin.split(",").map((origin) => origin.trim()),
      // X-Client-Id is a custom header, so the browser's preflight request must
      // be told it is allowed.
      allowedHeaders: ["Content-Type", "X-Client-Id"],
    }),
  );

  // A board card is tiny; a low limit rejects abusive payloads early.
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
  });

  app.use("/api/board", boardRouter);
  app.use("/api/columns", columnsRouter);
  app.use("/api/cards", cardsRouter);

  // Order matters: these must come after every route.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
