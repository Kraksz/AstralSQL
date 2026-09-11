import type { Driver, QueryResult } from "./types";

export interface DatabaseObject {
  schema?: string;
  name: string;
  kind: "table" | "view" | "sequence";
}

const isMySql = (driver: Driver) => driver === "mysql" || driver === "mariadb";

export function quoteIdentifier(driver: Driver, name: string): string {
  const quote = isMySql(driver) ? "`" : '"';
  return quote + name.replaceAll(quote, quote + quote) + quote;
}

/** Lists the tables and views the sidebar shows, with each object's kind. */
export function listObjectsSql(driver: Driver): string {
  if (isMySql(driver))
    // CONVERT keeps MySQL 8 metadata from arriving as binary strings.
    return "SELECT CONVERT(TABLE_SCHEMA USING utf8mb4) AS table_schema, CONVERT(TABLE_NAME USING utf8mb4) AS table_name, CONVERT(TABLE_TYPE USING utf8mb4) AS table_type FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME";
  if (driver === "postgres")
    return "SELECT table_schema::text AS table_schema, table_name::text AS table_name, table_type::text AS table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_type IN ('BASE TABLE', 'VIEW') ORDER BY table_schema, table_name";
  return "SELECT NULL AS table_schema, name AS table_name, type AS table_type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name";
}

export function parseObjects(result: QueryResult): DatabaseObject[] {
  return result.rows.map(([schema, name, type]): DatabaseObject => {
    const kind = String(type ?? "").toUpperCase();
    return {
      schema: schema == null ? undefined : String(schema),
      name: String(name),
      kind:
        kind === "VIEW" ? "view" : kind === "SEQUENCE" ? "sequence" : "table",
    };
  });
}

/**
 * Builds a DROP script for the single-session script runner. Dropping
 * everything turns off foreign key checks (MySQL, SQLite) or cascades
 * (PostgreSQL) so table order does not matter; dropping one table keeps the
 * checks, so a table other tables still reference is refused.
 */
export function dropScript(
  driver: Driver,
  objects: DatabaseObject[],
  all: boolean,
): string {
  const target = (item: DatabaseObject) =>
    (driver === "postgres" && item.schema
      ? `${quoteIdentifier(driver, item.schema)}.`
      : "") + quoteIdentifier(driver, item.name);
  // Views depend on tables, so they go first.
  const ordered = [
    ...objects.filter((item) => item.kind === "view"),
    ...objects.filter((item) => item.kind !== "view"),
  ];
  const statements = ordered.map(
    (item) =>
      `DROP ${item.kind.toUpperCase()} ${all ? "IF EXISTS " : ""}${target(item)}${all && driver === "postgres" ? " CASCADE" : ""};`,
  );
  if (all && isMySql(driver)) statements.unshift("SET FOREIGN_KEY_CHECKS = 0;");
  if (all && driver === "sqlite")
    statements.unshift("PRAGMA foreign_keys = OFF;");
  return statements.join("\n");
}
