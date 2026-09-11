import { describe, expect, it } from "vitest";
import { deleteRowSql, resolveRowTarget } from "../src/lib/rowDelete";
import type { QueryResult, TableInfo } from "../src/lib/types";

const users: TableInfo = {
  name: "users",
  schema: "FiveM",
  columns: [
    { name: "id", dataType: "int(11)", nullable: false, primaryKey: true },
    {
      name: "license",
      dataType: "varchar(60)",
      nullable: true,
      primaryKey: false,
    },
  ],
  foreignKeys: [],
};
const logs: TableInfo = {
  name: "logs",
  schema: "FiveM",
  columns: [
    { name: "message", dataType: "text", nullable: true, primaryKey: false },
  ],
  foreignKeys: [],
};
const result = (names: string[], rows: unknown[][]): QueryResult => ({
  columns: names.map((name) => ({ name, dataType: "VARCHAR" })),
  rows,
  rowsAffected: 0,
  elapsedMs: 0,
  truncated: false,
});

describe("row delete", () => {
  it("targets a single-table select by its primary key", () => {
    const target = resolveRowTarget(
      "-- browse\nSELECT *\nFROM `users`\nLIMIT 100;",
      result(["id", "license"], [[3, "license:abc"]]),
      [users, logs],
      "mariadb",
    );
    if (typeof target === "string") throw new Error(target);
    expect(target.table.name).toBe("users");
    expect(deleteRowSql("mariadb", target, [3, "license:abc"])).toBe(
      "DELETE FROM `users` WHERE `id` = 3 LIMIT 1;",
    );
    expect(
      typeof resolveRowTarget(
        "SELECT id, license FROM users WHERE id > 2 ORDER BY id",
        result(["id", "license"], [[3, "a"]]),
        [users],
        "mariadb",
      ),
    ).toBe("object");
  });

  it("refuses results that may not map to one table row", () => {
    const rows = result(["id", "license"], [[3, "a"]]);
    for (const sql of [
      "SELECT * FROM users u",
      "SELECT * FROM users JOIN logs ON 1 = 1",
      "SELECT id, license AS name FROM users",
      "SELECT COUNT(*) AS id FROM users",
      "SELECT * FROM users, logs",
      "SELECT DISTINCT id FROM users",
      "SELECT * FROM otherdb.users",
    ])
      expect(typeof resolveRowTarget(sql, rows, [users, logs], "mariadb")).toBe(
        "string",
      );
    expect(
      resolveRowTarget(
        "SELECT * FROM logs",
        result(["message"], [["x"]]),
        [users, logs],
        "mariadb",
      ),
    ).toContain("no primary key");
    expect(
      resolveRowTarget(
        "SELECT license FROM users",
        result(["license"], [["x"]]),
        [users],
        "mariadb",
      ),
    ).toContain("key column id");
  });

  it("escapes key values for each engine", () => {
    const target = {
      table: { ...users, schema: "public" },
      keys: [{ column: "license", index: 0, binary: false }],
    };
    expect(deleteRowSql("mysql", target, ["it's \\ ok"])).toBe(
      "DELETE FROM `users` WHERE `license` = 'it''s \\\\ ok' LIMIT 1;",
    );
    expect(deleteRowSql("postgres", target, ["it's \\ ok"])).toBe(
      `DELETE FROM "public"."users" WHERE "license" = 'it''s \\ ok';`,
    );
    expect(
      deleteRowSql(
        "sqlite",
        { ...target, keys: [{ column: "id", index: 0, binary: true }] },
        ["0xAB01"],
      ),
    ).toBe(`DELETE FROM "users" WHERE "id" = X'AB01';`);
    expect(() => deleteRowSql("mysql", target, [null])).toThrow();
  });
});
