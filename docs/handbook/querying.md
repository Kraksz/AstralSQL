# Your first query

Open a SQLite `.db`, `.sqlite`, or `.sqlite3` database, or create a desktop server
connection with its hostname, port, database, and database credentials.

```sql
SELECT 1 AS connected;
```

Choose Run query, or Ctrl+Enter (Cmd+Enter on Mac). Selected SQL runs as a selection.
Use separate query tabs and save useful queries in your library.

## SQL files

A `.sql` file contains text, not a database. Open it in the editor, check the target
connection, then choose Run SQL script and review the import before execution.
Refresh the schema and query an imported table to check the outcome.

SQL scripts must match the destination engine. MySQL/MariaDB dumps are not
converted into SQLite. MySQL DDL can commit immediately; a failed import is not
always rolled back. Review destructive SQL and back up the target first.

## Results

Filter returned rows and export CSV or JSON. Exports contain the returned result,
not necessarily every database row. Increase the result cap and rerun if needed.
Browser downloads can require permission. In-grid editing and interactive
transactions are not implemented; use SQL for data changes.
