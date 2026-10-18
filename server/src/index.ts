import { createServer } from "node:http";
import mongoose from "mongoose";
import { createApp } from "./app";
import { config } from "./config";
import { attachWebSocketServer } from "./realtime";

async function main(): Promise<void> {
  // Fail fast (5s) with a clear message if MongoDB is not running, instead of
  // Mongoose's default 30s of silent waiting.
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log("Connected to MongoDB");

  const app = createApp({ clientOrigin: config.CLIENT_ORIGIN });

  // WebSockets need the raw HTTP server, not the Express app, because they
  // take over the connection during the HTTP "upgrade" handshake.
  const server = createServer(app);
  const wss = attachWebSocketServer(server);

  server.listen(config.PORT, () => {
    console.log(`REST API:  http://localhost:${config.PORT}/api`);
    console.log(`WebSocket: ws://localhost:${config.PORT}/ws`);
  });

  // Open WebSockets would keep server.close() waiting forever, so drop them
  // first. The timer is a safety net in case something still hangs.
  function shutdown(signal: string): void {
    console.log(`${signal} received, shutting down`);
    wss.clients.forEach((socket) => socket.terminate());
    server.close(() => {
      mongoose.disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 5000).unref();
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("Failed to start the server:", error);
  process.exit(1);
});
