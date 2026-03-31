# @cobaltfinance/mcp

MCP server that gives AI agents controlled read/write access to your PostgreSQL database.

## Features

- **Read tools**: `query`, `list_tables`, `describe_table`, `get_relationships`
- **Write tools**: `execute` with mandatory human confirmation (`confirm_destructive`)
- **SQL guard**: Blocks TRUNCATE, DROP, ALTER, CREATE, GRANT, REVOKE, and DELETE without WHERE
- **Read-only transactions**: SELECT queries run inside `BEGIN TRANSACTION READ ONLY`
- **Parameterized queries**: Supports `$1, $2, ...` to prevent SQL injection

## Installation

```bash
npm install -g @cobaltfinance/mcp
```

Or run directly with npx:

```bash
npx @cobaltfinance/mcp <connection-string>
```

## Usage

Pass your PostgreSQL connection string as a CLI argument or `DATABASE_URL` environment variable:

```bash
cobalt-mcp postgresql://user:pass@host:5432/dbname
# or
DATABASE_URL=postgresql://user:pass@host:5432/dbname cobalt-mcp
```

## Configure with AI Clients

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cobalt": {
      "command": "npx",
      "args": ["-y", "@cobaltfinance/mcp", "postgresql://user:pass@host:5432/dbname"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add cobalt -- npx -y @cobaltfinance/mcp postgresql://user:pass@host:5432/dbname
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cobalt": {
      "command": "npx",
      "args": ["-y", "@cobaltfinance/mcp", "postgresql://user:pass@host:5432/dbname"]
    }
  }
}
```

## Tools

### `query`

Execute a read-only SELECT query.

```
sql: "SELECT * FROM users WHERE id = $1"
params: [123]
```

### `list_tables`

List all tables with approximate row counts and column counts.

### `describe_table`

Get column details for a table (name, type, nullable, default, primary key).

```
table: "users"
```

### `get_relationships`

Get foreign key relationships for a table (or all tables if omitted).

```
table: "transaction"
```

### `execute`

Execute a write query (INSERT, UPDATE, DELETE). Requires human confirmation.

```
sql: "UPDATE users SET name = $1 WHERE id = $2"
params: ["New Name", 123]
confirm_destructive: true
```

The AI agent must ask the user for explicit approval before setting `confirm_destructive: true`.

## Security

- SELECT queries are wrapped in `BEGIN TRANSACTION READ ONLY`
- SQL guard blocks dangerous DDL/DCL operations
- `DELETE` without a `WHERE` clause is blocked
- Write operations require explicit `confirm_destructive: true` flag
- All queries support parameterization to prevent SQL injection
- Connection string is passed at startup, not exposed to the AI

## License

MIT
