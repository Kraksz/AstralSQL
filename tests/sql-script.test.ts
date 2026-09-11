import { beforeAll, expect, it } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { executeSQLiteScript, validateScriptText } from "../src/lib/sqlScript";
let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});
it("imports transactions, comments, quoted semicolons and triggers", () => {
  const db = new SQL.Database();
  try {
    executeSQLiteScript(
      db,
      "-- export\nBEGIN; CREATE TABLE t(id INT, name TEXT); CREATE TABLE audit(id INT); CREATE TRIGGER tr AFTER INSERT ON t BEGIN INSERT INTO audit VALUES(new.id); END; INSERT INTO t VALUES(1,'hello; world'),(2,'🌌'); COMMIT;",
    );
    expect(db.exec("SELECT count(*) FROM audit")[0].values).toEqual([[2]]);
    expect(db.exec("SELECT name FROM t WHERE id=1")[0].values).toEqual([
      ["hello; world"],
    ]);
  } finally {
    db.close();
  }
});
it("rejects empty and binary files and normalizes UTF-8 BOM", () => {
  expect(() => validateScriptText(" ")).toThrow("empty");
  expect(() => validateScriptText("SQLite\0")).toThrow("binary");
  expect(validateScriptText("\uFEFFSELECT 1;")).toBe("SELECT 1;");
});
it("rejects an open transaction instead of silently losing its changes", () => {
  const db = new SQL.Database();
  try {
    expect(() =>
      executeSQLiteScript(db, "BEGIN; CREATE TABLE t(id INT);"),
    ).toThrow("transaction open");
  } finally {
    db.close();
  }
});
it("leaves the original unchanged when a staged copy fails after COMMIT", () => {
  const db = new SQL.Database();
  db.run("CREATE TABLE original(id INT)");
  const copy = new SQL.Database(db.export());
  try {
    expect(() =>
      executeSQLiteScript(
        copy,
        "BEGIN; DROP TABLE original; COMMIT; INSERT INTO missing VALUES(1);",
      ),
    ).toThrow();
    expect(
      db.exec("SELECT name FROM sqlite_master WHERE name='original'")[0].values,
    ).toEqual([["original"]]);
  } finally {
    copy.close();
    db.close();
  }
});
