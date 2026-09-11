import type { Database } from "sql.js";
import type { QueryResult, TableInfo } from "./types";

export function normalizeMaxRows(value = 1000): number {
  return Number.isFinite(value)
    ? Math.min(10000, Math.max(1, Math.floor(value)))
    : 1000;
}

/** SQLite itself identifies statement boundaries, including strings and trigger bodies. */
export function singleStatement(db: Database, sql: string): string {
  const multiple = () =>
    new Error(
      "Run one SQL statement at a time. Select a statement in the editor to run it.",
    );
  if (onlyTrivia(sql)) throw new Error("Write a SQL statement to run.");
  // Some PRAGMAs run during prepare. Validate their simple statement boundary first.
  const commandPrefix = sql
    .replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[\s;]+/, "");
  if (
    /^(?:EXPLAIN(?:\s+QUERY\s+PLAN)?\s+)?PRAGMA\b/i.test(commandPrefix) &&
    !onlyTrivia(pragmaRemainder(sql))
  )
    throw multiple();
  const parsed = db.prepare(sql);
  try {
    const statement = parsed.getSQL();
    // sqlite3_sql returns the exact source of the first prepared statement. Never
    // prepare the tail: even a trailing PRAGMA could mutate connection settings.
    if (!sql.startsWith(statement) || !onlyTrivia(sql.slice(statement.length)))
      throw multiple();
    return statement;
  } finally {
    parsed.free();
  }
}

function onlyTrivia(sql: string): boolean {
  let index = 0;
  while (index < sql.length) {
    if (/\s/.test(sql[index]) || sql[index] === ";") {
      index++;
      continue;
    }
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index + 2);
      if (end < 0) return true;
      index = end + 1;
      continue;
    }
    if (sql.startsWith("/*", index)) {
      const end = sql.indexOf("*/", index + 2);
      if (end < 0) return true;
      index = end + 2;
      continue;
    }
    return false;
  }
  return true;
}

function pragmaRemainder(sql: string): string {
  sql = sql.replace(/^(?:\s|;|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "");
  let quote = "";
  for (let index = 0; index < sql.length; index++) {
    const char = sql[index];
    if (quote) {
      if (char === quote) {
        if (sql[index + 1] === quote && quote !== "]") index++;
        else quote = "";
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`" || char === "[") {
      quote = char === "[" ? "]" : char;
      continue;
    }
    if (char === "-" && sql[index + 1] === "-") {
      const end = sql.indexOf("\n", index + 2);
      if (end < 0) return "";
      index = end;
      continue;
    }
    if (char === "/" && sql[index + 1] === "*") {
      const end = sql.indexOf("*/", index + 2);
      if (end < 0) return "";
      index = end + 1;
      continue;
    }
    if (char === ";") return sql.slice(index + 1);
  }
  return "";
}

function leadingKeyword(sql: string): string {
  return (
    sql
      .replace(/^(?:\s|;|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "")
      .match(/^[A-Za-z]+/)?.[0]
      ?.toUpperCase() ?? ""
  );
}

function displayValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) &&
      value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  return value;
}

function valueType(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "bigint") return "INTEGER";
  if (typeof value === "number")
    return Number.isInteger(value) ? "INTEGER" : "REAL";
  if (value instanceof Uint8Array) return "BLOB";
  return "TEXT";
}

export function executeSql(
  db: Database,
  sql: string,
  maxRows = 1000,
): QueryResult {
  const started = performance.now();
  const statementSql = singleStatement(db, sql);
  if (
    [
      "BEGIN",
      "COMMIT",
      "END",
      "ROLLBACK",
      "SAVEPOINT",
      "RELEASE",
      "ATTACH",
      "DETACH",
    ].includes(leadingKeyword(statementSql))
  ) {
    throw new Error(
      "The browser playground runs one statement in auto-commit mode. Transactions and attached databases require the desktop app.",
    );
  }
  const limit = normalizeMaxRows(maxRows);
  const before = Number(db.exec("SELECT total_changes()")[0].values[0][0]);
  const atomic = !["VACUUM", "PRAGMA"].includes(leadingKeyword(statementSql));
  if (atomic) db.run("SAVEPOINT astral_browser_query");
  let statement: ReturnType<Database["prepare"]> | undefined;
  const columns: QueryResult["columns"] = [];
  const rows: unknown[][] = [];
  let truncated = false;
  try {
    statement = db.prepare(statementSql);
    columns.push(
      ...statement
        .getColumnNames()
        .map((name) => ({ name, dataType: "UNKNOWN" })),
    );
    // sql.js supports useBigInt; its DefinitelyTyped declaration predates this option.
    const readRow = statement.get.bind(statement) as (
      params: undefined,
      config: { useBigInt: true },
    ) => unknown[];
    while (statement.step()) {
      if (rows.length === limit) {
        truncated = true;
        break;
      }
      const row = readRow(undefined, { useBigInt: true });
      row.forEach((value, index) => {
        if (
          columns[index].dataType === "UNKNOWN" ||
          columns[index].dataType === "NULL"
        )
          columns[index].dataType = valueType(value);
      });
      rows.push(row.map(displayValue));
    }
    statement.free();
    statement = undefined;
    if (atomic) db.run("RELEASE astral_browser_query");
  } catch (error) {
    statement?.free();
    statement = undefined;
    if (atomic) {
      db.run("ROLLBACK TO astral_browser_query");
      db.run("RELEASE astral_browser_query");
    }
    throw error;
  } finally {
    statement?.free();
  }
  const after = Number(db.exec("SELECT total_changes()")[0].values[0][0]);
  return {
    columns,
    rows,
    rowsAffected: after - before,
    elapsedMs: performance.now() - started,
    truncated,
  };
}

export function readSchema(db: Database): TableInfo[] {
  const tables = db.exec(
    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )[0];
  if (!tables) return [];
  return tables.values.map(([rawName]) => {
    const name = String(rawName);
    const quoted = `'${name.replaceAll("'", "''")}'`;
    const columns = db.exec(`PRAGMA table_info(${quoted})`)[0];
    const foreignKeys = db.exec(`PRAGMA foreign_key_list(${quoted})`)[0];
    return {
      name,
      schema: "main",
      columns: (columns?.values ?? []).map((row) => ({
        name: String(row[1]),
        dataType: String(row[2] || "ANY"),
        nullable: !row[3] && !row[5],
        primaryKey: Boolean(row[5]),
      })),
      foreignKeys: (foreignKeys?.values ?? []).map((row) => ({
        column: String(row[3]),
        referencedTable: String(row[2]),
        referencedColumn: String(row[4]),
      })),
    };
  });
}
