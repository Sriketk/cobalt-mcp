import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readQuery } from "../lib/db.js";
import { isReadOnly } from "../lib/guard.js";

export function registerReadTools(server: McpServer): void {
  // --- cobalt_query ---
  server.registerTool(
    "cobalt_query",
    {
      title: "Query Database",
      description: [
        "Execute a read-only SELECT query against the PostgreSQL database.",
        "Only SELECT statements are allowed — all write operations will be rejected.",
        "",
        "Args:",
        "  - sql (string): SQL SELECT query. Use $1, $2, etc. for parameterized values.",
        "  - params (array, optional): Values for parameterized query placeholders.",
        "",
        "Returns:",
        "  { rows: object[], rowCount: number, fields: { name, dataTypeID }[] }",
        "",
        "Examples:",
        '  - sql: "SELECT * FROM \"user\" LIMIT 10"',
        '  - sql: "SELECT * FROM transaction WHERE amount > $1", params: [100]',
        "",
        "Error Handling:",
        "  - Returns error if query is not a SELECT statement",
        "  - Returns error if SQL syntax is invalid",
      ].join("\n"),
      inputSchema: {
        sql: z.string().describe("SQL SELECT query to execute"),
        params: z
          .array(z.unknown())
          .optional()
          .describe("Parameterized query values ($1, $2, etc.)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ sql, params }) => {
      if (!isReadOnly(sql)) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Only SELECT queries are allowed with cobalt_query. Use cobalt_execute for write operations.",
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await readQuery(sql, params as unknown[] | undefined);
        const output = {
          rows: result.rows,
          rowCount: result.rowCount,
          fields: result.fields.map((f) => ({
            name: f.name,
            dataTypeID: f.dataTypeID,
          })),
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
              text: `Query error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- cobalt_list_tables ---
  server.registerTool(
    "cobalt_list_tables",
    {
      title: "List Tables",
      description: [
        "List all tables in the PostgreSQL database with approximate row counts and column counts.",
        "",
        "Returns:",
        "  Array of { table_name, table_schema, column_count, approximate_row_count }",
        "",
        "Use this tool first to discover what tables are available before querying.",
      ].join("\n"),
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const result = await readQuery(`
          SELECT
            t.table_name,
            t.table_schema,
            (SELECT count(*)::int FROM information_schema.columns c
             WHERE c.table_name = t.table_name AND c.table_schema = t.table_schema) as column_count,
            pg_stat_user_tables.n_live_tup::int as approximate_row_count
          FROM information_schema.tables t
          LEFT JOIN pg_stat_user_tables
            ON pg_stat_user_tables.relname = t.table_name
            AND pg_stat_user_tables.schemaname = t.table_schema
          WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
            AND t.table_type = 'BASE TABLE'
          ORDER BY t.table_schema, t.table_name
        `);

        const output = { tables: result.rows };
        return {
          content: [
            { type: "text", text: JSON.stringify(output, null, 2) },
          ],
          structuredContent: output,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing tables: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- cobalt_describe_table ---
  server.registerTool(
    "cobalt_describe_table",
    {
      title: "Describe Table",
      description: [
        "Describe a table's columns including name, type, nullable, default value, and primary key status.",
        "",
        "Args:",
        "  - table (string): Name of the table to describe.",
        "",
        "Returns:",
        "  { table, columns: [{ name, type, udtName, nullable, default, maxLength, primaryKey }] }",
        "",
        "Examples:",
        '  - table: "user"',
        '  - table: "transaction"',
      ].join("\n"),
      inputSchema: {
        table: z.string().min(1).describe("Table name to describe"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ table }) => {
      try {
        const result = await readQuery(
          `
          SELECT
            c.column_name,
            c.data_type,
            c.udt_name,
            c.is_nullable,
            c.column_default,
            c.character_maximum_length,
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
          FROM information_schema.columns c
          LEFT JOIN (
            SELECT ku.column_name, ku.table_name, ku.table_schema
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage ku
              ON tc.constraint_name = ku.constraint_name
              AND tc.table_schema = ku.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
          ) pk ON pk.column_name = c.column_name
            AND pk.table_name = c.table_name
            AND pk.table_schema = c.table_schema
          WHERE c.table_name = $1
            AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY c.ordinal_position
        `,
          [table]
        );

        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `Table "${table}" not found or has no columns.`,
              },
            ],
            isError: true,
          };
        }

        const output = {
          table,
          columns: result.rows.map((row) => ({
            name: row.column_name,
            type: row.data_type,
            udtName: row.udt_name,
            nullable: row.is_nullable === "YES",
            default: row.column_default,
            maxLength: row.character_maximum_length,
            primaryKey: row.is_primary_key,
          })),
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
              text: `Error describing table: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- cobalt_get_relationships ---
  server.registerTool(
    "cobalt_get_relationships",
    {
      title: "Get Foreign Key Relationships",
      description: [
        "Get all foreign key relationships for a table, showing which columns reference other tables.",
        "If table is omitted, returns all relationships in the database.",
        "",
        "Args:",
        "  - table (string, optional): Table name to get relationships for.",
        "",
        "Returns:",
        '  Array of { constraint, from: "schema.table.column", to: "schema.table.column" }',
      ].join("\n"),
      inputSchema: {
        table: z
          .string()
          .optional()
          .describe(
            "Table name to get relationships for. Omit for all relationships."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ table }) => {
      try {
        let sql = `
          SELECT
            tc.constraint_name,
            tc.table_schema,
            tc.table_name,
            kcu.column_name,
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
        `;
        const params: string[] = [];

        if (table) {
          sql += ` AND (tc.table_name = $1 OR ccu.table_name = $1)`;
          params.push(table);
        }

        sql += ` ORDER BY tc.table_name, kcu.column_name`;

        const result = await readQuery(sql, params);
        const output = {
          relationships: result.rows.map((row) => ({
            constraint: row.constraint_name,
            from: `${row.table_schema}.${row.table_name}.${row.column_name}`,
            to: `${row.foreign_table_schema}.${row.foreign_table_name}.${row.foreign_column_name}`,
          })),
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
              text: `Error getting relationships: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
