import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { writeQuery } from "../lib/db.js";
import { validateQuery } from "../lib/guard.js";

export function registerWriteTools(server: McpServer): void {
  server.registerTool(
    "cobalt_execute",
    {
      title: "Execute Write Query",
      description: [
        "Execute a write query (INSERT, UPDATE, DELETE) against the PostgreSQL database.",
        "",
        "⚠️ HUMAN CONFIRMATION REQUIRED:",
        "Before calling this tool, you MUST:",
        "1. Show the user the exact SQL query you plan to execute",
        "2. Explain what rows will be affected",
        "3. Wait for the user to explicitly approve",
        "4. Only then call this tool with confirm_destructive: true",
        "",
        "Args:",
        "  - sql (string): SQL write query (INSERT, UPDATE, DELETE).",
        "  - params (array, optional): Parameterized query values ($1, $2, etc.).",
        "  - confirm_destructive (boolean): REQUIRED. Must be true after explicit human confirmation.",
        "",
        "Returns:",
        "  { rowCount: number, command: string, rows: object[] }",
        "",
        "Blocked operations: TRUNCATE, DROP, ALTER, CREATE, GRANT, REVOKE, DELETE without WHERE.",
      ].join("\n"),
      inputSchema: {
        sql: z.string().describe("SQL write query (INSERT, UPDATE, DELETE)"),
        params: z
          .array(z.unknown())
          .optional()
          .describe("Parameterized query values ($1, $2, etc.)"),
        confirm_destructive: z
          .boolean()
          .describe(
            "REQUIRED: Must be true after explicit human confirmation. Do NOT auto-set."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ sql, params, confirm_destructive }) => {
      const guard = validateQuery(sql);

      if (!guard.allowed) {
        return {
          content: [{ type: "text", text: `Blocked: ${guard.reason}` }],
          isError: true,
        };
      }

      if (guard.classification === "read") {
        return {
          content: [
            {
              type: "text",
              text: "This appears to be a read query. Use cobalt_query for SELECT statements.",
            },
          ],
          isError: true,
        };
      }

      if (!confirm_destructive) {
        return {
          content: [
            {
              type: "text",
              text: [
                "⚠️ Write operation requires human confirmation.",
                "",
                "Before executing, you must:",
                "1. Show the user the SQL query and explain what it will do",
                "2. Get explicit approval from the user",
                "3. Re-call this tool with confirm_destructive: true",
                "",
                `Query: ${sql}`,
                params ? `Params: ${JSON.stringify(params)}` : "",
              ].join("\n"),
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await writeQuery(
          sql,
          params as unknown[] | undefined
        );
        const output = {
          rowCount: result.rowCount,
          command: result.command,
          rows: result.rows,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Write error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
