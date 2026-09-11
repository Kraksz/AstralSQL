import { describe, expect, it } from "vitest";
import {
  dropScript,
  listObjectsSql,
  parseObjects,
  quoteIdentifier,
} from "../src/lib/dropTables";

describe("drop table scripts", () => {
  it("quotes identifiers for each engine", () => {
    expect(quoteIdentifier("mariadb", "odd`name")).toBe("`odd``name`");
    expect(quoteIdentifier("postgres", 'odd"name')).toBe('"odd""name"');
    expect(quoteIdentifier("sqlite", "users")).toBe('"users"');
  });

  it("drops one table and keeps foreign key checks on", () => {
    expect(dropScript("mysql", [{ name: "users", kind: "table" }], false)).toBe(
      "DROP TABLE `users`;",
    );
    expect(
      dropScript(
        "postgres",
        [{ schema: "public", name: "users", kind: "table" }],
        false,
      ),
    ).toBe('DROP TABLE "public"."users";');
  });

  it("drops everything in MariaDB with checks off and views first", () => {
    expect(
      dropScript(
        "mariadb",
        [
          { name: "a", kind: "table" },
          { name: "v", kind: "view" },
          { name: "s", kind: "sequence" },
        ],
        true,
      ),
    ).toBe(
      [
        "SET FOREIGN_KEY_CHECKS = 0;",
        "DROP VIEW IF EXISTS `v`;",
        "DROP TABLE IF EXISTS `a`;",
        "DROP SEQUENCE IF EXISTS `s`;",
      ].join("\n"),
    );
  });

  it("cascades a full PostgreSQL drop and disables SQLite foreign keys", () => {
    expect(
      dropScript(
        "postgres",
        [{ schema: "app", name: "a", kind: "table" }],
        true,
      ),
    ).toBe('DROP TABLE IF EXISTS "app"."a" CASCADE;');
    expect(dropScript("sqlite", [{ name: "a", kind: "table" }], true)).toBe(
      'PRAGMA foreign_keys = OFF;\nDROP TABLE IF EXISTS "a";',
    );
  });

  it("reads object kinds from the listing query", () => {
    expect(listObjectsSql("mariadb")).toContain("DATABASE()");
    expect(
      parseObjects({
        columns: [],
        rows: [
          ["FiveM", "users", "BASE TABLE"],
          ["FiveM", "top_players", "VIEW"],
          [null, "t", "table"],
          ["FiveM", "ids", "SEQUENCE"],
        ],
        rowsAffected: 0,
        elapsedMs: 0,
        truncated: false,
      }),
    ).toEqual([
      { schema: "FiveM", name: "users", kind: "table" },
      { schema: "FiveM", name: "top_players", kind: "view" },
      { name: "t", kind: "table" },
      { schema: "FiveM", name: "ids", kind: "sequence" },
    ]);
  });
});
