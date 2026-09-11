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
Browser downloads can require permission. Interactive transactions are not
implemented; use SQL for data changes other than deleting a row.

To delete one row, run a `SELECT` on a single table with its primary key in the
result, then choose the row's trash button (or right-click the row). The app
shows the exact `DELETE` statement before it runs.

## Manage tables and databases

Hover a table in the sidebar and choose its trash button to drop it; the trash
button beside the table count drops every table and view. Both ask you to type
the table or database name first, and neither can be undone.

For MySQL and MariaDB in the desktop app, the export button writes every table's
structure and rows, plus views, into one `.sql` file. The import button runs a
`.sql` dump of up to 1 GiB statement by statement, with progress and a stop
button. Stored routines, triggers and events are not exported. If an import
statement fails, the statements before it stay applied, so export a backup first.
