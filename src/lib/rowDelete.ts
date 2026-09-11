import { quoteIdentifier } from "./dropTables";
import type { Driver, QueryResult, TableInfo } from "./types";

export interface RowTarget {
  table: TableInfo;
  keys: { column: string; index: number; binary: boolean }[];
}

const IDENT = '(?:`(?:[^`]|``)+`|"(?:[^"]|"")+"|[A-Za-z_][\\w$]*)';
const SINGLE_TABLE = new RegExp(
  `^select\\s+([\\s\\S]+?)\\s+from\\s+(${IDENT})(?:\\s*\\.\\s*(${IDENT}))?(?:\\s+(?:where|order\\s+by|limit|offset)\\b[\\s\\S]*)?$`,
  "i",
);
const PLAIN_COLUMN = new RegExp(`^(?:${IDENT}\\s*\\.\\s*)?${IDENT}$`);
const UNSAFE =
  /\b(join|union|intersect|except|group\s+by|having|distinct|into|window)\b/i;

const isMySql = (driver: Driver) => driver === "mysql" || driver === "mariadb";

function unquote(identifier: string): string {
  const quote = identifier[0];
  return quote === "`" || quote === '"'
    ? identifier.slice(1, -1).replaceAll(quote + quote, quote)
    : identifier;
}

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim()
    .replace(/;\s*$/, "")
    .trim();
}

function pick<T>(
  items: T[],
  exact: (item: T) => boolean,
  loose: (item: T) => boolean,
): T | undefined {
  const found = items.filter(exact);
  if (found.length) return found.length === 1 ? found[0] : undefined;
  const near = items.filter(loose);
  return near.length === 1 ? near[0] : undefined;
}

/**
 * Finds the table and primary key behind a result, or explains why its rows
 * cannot be deleted safely. Only a plain SELECT from one table qualifies, so
 * every key value in the grid comes straight from that table's row.
 */
export function resolveRowTarget(
  sql: string,
  result: QueryResult,
  tables: TableInfo[],
  driver: Driver,
): RowTarget | string {
  const text = stripComments(sql);
  const match = SINGLE_TABLE.exec(text);
  if (!match || UNSAFE.test(text))
    return "Deleting rows here works for a SELECT from one table without joins, aliases or grouping. Use a DELETE query otherwise.";
  const list = match[1].trim();
  if (
    list !== "*" &&
    !list.split(",").every((item) => PLAIN_COLUMN.test(item.trim()))
  )
    return "Deleting rows here needs * or plain column names in the SELECT, so every value comes straight from the table.";
  const schema = match[3] ? unquote(match[2]) : undefined;
  const name = unquote(match[3] ?? match[2]);
  const table = pick(
    tables,
    (item) => item.name === name && (!schema || item.schema === schema),
    (item) =>
      item.name.toLowerCase() === name.toLowerCase() &&
      (!schema || item.schema?.toLowerCase() === schema.toLowerCase()),
  );
  if (!table)
    return `${name} isn't in the loaded schema. Refresh the schema and run the query again.`;
  const primary = table.columns.filter((column) => column.primaryKey);
  if (!primary.length)
    return `${table.name} has no primary key, so a row can't be picked out safely. Use a DELETE query instead.`;
  const names = result.columns.map((column) => column.name);
  const keys: RowTarget["keys"] = [];
  for (const column of primary) {
    const index = names.includes(column.name)
      ? names.indexOf(column.name)
      : names.findIndex(
          (item) => item.toLowerCase() === column.name.toLowerCase(),
        );
    if (index < 0)
      return `Include the key column${primary.length > 1 ? "s" : ""} ${primary.map((item) => item.name).join(", ")} in the SELECT to delete rows here.`;
    keys.push({
      column: column.name,
      index,
      binary: /binary|blob|bytea/i.test(column.dataType),
    });
  }
  return { table, keys };
}

function literal(driver: Driver, value: unknown, binary: boolean): string {
  if (value === null || value === undefined)
    throw new Error(
      "This row has an empty key value, so it can't be deleted from here.",
    );
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("This key value can't be matched exactly.");
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const hex =
    value instanceof Uint8Array
      ? Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")
      : binary && typeof value === "string" && /^0x[0-9a-f]*$/i.test(value)
        ? value.slice(2)
        : null;
  if (hex !== null)
    return driver === "postgres" ? `decode('${hex}', 'hex')` : `X'${hex}'`;
  if (typeof value === "string") {
    // MySQL treats backslashes in strings as escapes; the other engines do not.
    const text = isMySql(driver) ? value.replaceAll("\\", "\\\\") : value;
    return `'${text.replaceAll("'", "''")}'`;
  }
  throw new Error("This key value type can't be used to delete a row here.");
}

export function deleteRowSql(
  driver: Driver,
  target: RowTarget,
  row: unknown[],
): string {
  const table =
    (driver === "postgres" && target.table.schema
      ? `${quoteIdentifier(driver, target.table.schema)}.`
      : "") + quoteIdentifier(driver, target.table.name);
  const conditions = target.keys.map(
    (key) =>
      `${quoteIdentifier(driver, key.column)} = ${literal(driver, row[key.index], key.binary)}`,
  );
  return `DELETE FROM ${table} WHERE ${conditions.join(" AND ")}${isMySql(driver) ? " LIMIT 1" : ""};`;
}
