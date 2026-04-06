import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { attachMMOServer } from "./mmo/MMOServer";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Wrap Express in a plain HTTP server so we can attach the WebSocket upgrade
const httpServer = createServer(app);
attachMMOServer(httpServer);

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening (HTTP + MMO WebSocket)");
});
