#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initDb, closeDb } from "./lib/db.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";

function getConnectionString(): string {
  const cliArg = process.argv[2];
  if (cliArg) return cliArg;

  const envVar = process.env.DATABASE_URL;
  if (envVar) return envVar;

  console.error(
    "Usage: cobalt-mcp <connection-string>\n" +
      "   or: DATABASE_URL=... cobalt-mcp\n"
  );
  process.exit(1);
}

const server = new McpServer({
  name: "cobalt-mcp-server",
  version: "0.1.0",
});

registerReadTools(server);
registerWriteTools(server);

async function main(): Promise<void> {
  const connectionString = getConnectionString();
  initDb(connectionString);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("cobalt-mcp-server running via stdio");

  const shutdown = async (): Promise<void> => {
    await closeDb();
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
