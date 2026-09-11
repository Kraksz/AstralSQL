import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { seedDemoDatabase } from "../src/lib/demoData";
import {
  executeSql,
  normalizeMaxRows,
  readSchema,
} from "../src/lib/sqliteEngine";
import { toCsv, toJson } from "../src/components/grid/exportUtils";
import type { QueryResult } from "../src/lib/types";

let SQL: SqlJsStatic;
let db: Database;
beforeAll(async () => {
  SQL = await initSqlJs();
});
beforeEach(() => {
  db = new SQL.Database();
  seedDemoDatabase(db);
});
afterEach(() => db.close());

describe("SQLite playground engine", () => {
  it("executes real joins over the seeded relational dataset", () => {
    const result = executeSql(
      db,
      "SELECT u.name, COUNT(o.id) AS order_count FROM users u JOIN orders o ON o.user_id = u.id GROUP BY u.id ORDER BY u.id",
    );
    expect(result.rows).toHaveLength(100);
    expect(result.rows[0]).toEqual(["Olivia Bennett", 1]);
    expect(result.rowsAffected).toBe(0);
  });

  it("caps rows while iterating an unbounded recursive query", () => {
    const result = executeSql(
      db,
      "WITH RECURSIVE counter(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM counter) SELECT n FROM counter",
      9,
    );
    expect(result.rows).toHaveLength(9);
    expect(result.rows[8]).toEqual([9]);
    expect(result.truncated).toBe(true);
  });

  it("distinguishes a complete result from truncation", () => {
    expect(executeSql(db, "SELECT id FROM users LIMIT 5", 5).truncated).toBe(
      false,
    );
    expect(executeSql(db, "SELECT id FROM users LIMIT 6", 5).truncated).toBe(
      true,
    );
  });

  it("rejects multiple statements without executing a trailing mutation", () => {
    expect(() => executeSql(db, "SELECT 1; DELETE FROM users;")).toThrow(
      /one SQL statement/,
    );
    expect(executeSql(db, "SELECT COUNT(*) FROM users").rows[0]).toEqual([100]);
    expect(() =>
      executeSql(db, "UPDATE users SET name = 'changed'; SELECT 1;"),
    ).toThrow(/one SQL statement/);
    expect(
      executeSql(db, "SELECT name FROM users WHERE id = 1").rows[0],
    ).toEqual(["Olivia Bennett"]);
  });

  it("does not apply prepare-time PRAGMA side effects in rejected SQL", () => {
    expect(() => executeSql(db, "SELECT 1; PRAGMA foreign_keys=OFF")).toThrow(
      /one SQL statement/,
    );
    expect(executeSql(db, "PRAGMA foreign_keys").rows[0]).toEqual([1]);
    expect(() => executeSql(db, "PRAGMA foreign_keys=OFF; SELECT 1")).toThrow(
      /one SQL statement/,
    );
    expect(executeSql(db, "PRAGMA foreign_keys").rows[0]).toEqual([1]);
    expect(() => executeSql(db, "; PRAGMA foreign_keys=OFF; SELECT 1")).toThrow(
      /one SQL statement/,
    );
    expect(executeSql(db, "PRAGMA foreign_keys").rows[0]).toEqual([1]);
    expect(() =>
      executeSql(
        db,
        "EXPLAIN /* preparation still applies pragmas */ PRAGMA foreign_keys=OFF; SELECT 1",
      ),
    ).toThrow(/one SQL statement/);
    expect(executeSql(db, "PRAGMA foreign_keys").rows[0]).toEqual([1]);
  });

  it("uses SQLite statement boundaries for comments, quoted strings, and triggers", () => {
    expect(
      executeSql(
        db,
        "-- semicolon ; is a comment\nSELECT 'literal;value' AS example; /* tail ; */",
      ).rows[0],
    ).toEqual(["literal;value"]);
    expect(() =>
      executeSql(
        db,
        "CREATE TRIGGER update_name AFTER UPDATE OF plan ON users BEGIN UPDATE users SET name = 'updated' WHERE id = NEW.id; END;",
      ),
    ).not.toThrow();
  });

  it("retains integers beyond the JavaScript safe integer range exactly", () => {
    const result = executeSql(
      db,
      "SELECT 9223372036854775807 AS large_number, 42 AS ordinary_number",
    );
    expect(result.rows[0]).toEqual(["9223372036854775807", 42]);
    expect(result.columns.map((column) => column.dataType)).toEqual([
      "INTEGER",
      "INTEGER",
    ]);
  });

  it("persists mutations in valid SQLite bytes and reports affected rows", () => {
    const result = executeSql(
      db,
      "UPDATE users SET plan = 'Team' WHERE id <= 3",
    );
    expect(result.rowsAffected).toBe(3);
    const reopened = new SQL.Database(db.export());
    expect(
      executeSql(
        reopened,
        "SELECT count(*) FROM users WHERE id <= 3 AND plan = 'Team'",
      ).rows[0],
    ).toEqual([3]);
    reopened.close();
  });

  it("finishes a bounded write with RETURNING without dropping the mutation", () => {
    const result = executeSql(
      db,
      "UPDATE users SET plan = 'Pro' RETURNING id",
      2,
    );
    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(result.rowsAffected).toBe(100);
    expect(
      executeSql(db, "SELECT count(*) FROM users WHERE plan = 'Pro'").rows[0],
    ).toEqual([100]);
  });

  it("exposes primary keys and declared foreign key relationships", () => {
    const schema = readSchema(db);
    expect(schema.map((table) => table.name)).toEqual([
      "order_items",
      "orders",
      "products",
      "users",
    ]);
    expect(
      schema.find((table) => table.name === "orders")?.foreignKeys,
    ).toEqual([
      { column: "user_id", referencedTable: "users", referencedColumn: "id" },
    ]);
    expect(
      schema.find((table) => table.name === "users")?.columns[0],
    ).toMatchObject({ primaryKey: true, nullable: false });
  });

  it("rejects unsupported explicit transaction mode instead of losing pending transactions", () => {
    expect(() => executeSql(db, "/* transaction */ BEGIN")).toThrow(
      /auto-commit/,
    );
  });

  it("enforces foreign keys in the demo", () => {
    expect(() =>
      executeSql(
        db,
        "INSERT INTO orders VALUES (101, 999, 'processing', 10, '2026-09-06')",
      ),
    ).toThrow(/FOREIGN KEY/);
  });

  it("rolls back partial OR FAIL writes when a statement reports an error", () => {
    expect(() =>
      executeSql(
        db,
        "UPDATE OR FAIL users SET email = 'duplicate@example.com' WHERE id <= 3",
      ),
    ).toThrow(/UNIQUE/);
    expect(
      executeSql(
        db,
        "SELECT count(*) FROM users WHERE email = 'duplicate@example.com'",
      ).rows[0],
    ).toEqual([0]);
  });

  it("bounds invalid and excessive row caps", () => {
    expect(normalizeMaxRows(Infinity)).toBe(1000);
    expect(normalizeMaxRows(-1)).toBe(1);
    expect(normalizeMaxRows(999999)).toBe(10000);
  });
});

describe("portable result exports", () => {
  const result: QueryResult = {
    columns: [
      { name: "name", dataType: "TEXT" },
      { name: "value", dataType: "TEXT" },
    ],
    rows: [],
    rowsAffected: 0,
    elapsedMs: 0,
    truncated: false,
  };

  it("escapes CSV quotes and neutralizes spreadsheet formulas", () => {
    const csv = toCsv({
      ...result,
      rows: [
        ['a,"b"', '=HYPERLINK("https://example.com")'],
        ["line\nbreak", null],
        ["amount", -12],
        ["leading space", "   +SUM(1,2)"],
      ],
    });
    expect(csv).toContain('"a,""b""","\'=HYPERLINK(""https://example.com"")"');
    expect(csv).toContain('"line\nbreak",');
    expect(csv).toContain("amount,-12");
    expect(csv).toContain('"\'   +SUM(1,2)"');
  });

  it("preserves duplicate SQL columns and exact bigint strings in JSON", () => {
    const json = toJson({
      ...result,
      columns: [
        { name: "id", dataType: "INTEGER" },
        { name: "id", dataType: "INTEGER" },
      ],
      rows: [[1, 9223372036854775807n]],
    });
    expect(JSON.parse(json)).toEqual([{ id: 1, id_2: "9223372036854775807" }]);
  });
});
