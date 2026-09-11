import type { QueryResult } from "../../lib/types";

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (value instanceof Uint8Array)
    return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  if (typeof value === "object")
    return JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    );
  return String(value);
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = formatCell(value);
  // Spreadsheet apps may execute a string as a formula even after CSV quoting.
  if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(value))
    text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(result: QueryResult): string {
  return [
    result.columns.map((column) => csvCell(column.name)).join(","),
    ...result.rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");
}

export function toJson(result: QueryResult): string {
  const used = new Set<string>();
  const keys = result.columns.map((column) => {
    let key = column.name;
    let suffix = 2;
    while (used.has(key)) key = `${column.name}_${suffix++}`;
    used.add(key);
    return key;
  });
  return JSON.stringify(
    result.rows.map((row) =>
      Object.fromEntries(keys.map((key, index) => [key, row[index] ?? null])),
    ),
    (_key, value: unknown) => {
      if (typeof value === "bigint") return value.toString();
      if (value instanceof Uint8Array) return formatCell(value);
      return value;
    },
    2,
  );
}

function download(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // Attached links and a longer URL lifetime also work with slower mobile downloads.
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function exportToCsv(
  result: QueryResult,
  filename = "astral-results.csv",
): void {
  download(`\uFEFF${toCsv(result)}`, filename, "text/csv;charset=utf-8");
}

export function exportToJson(
  result: QueryResult,
  filename = "astral-results.json",
): void {
  download(toJson(result), filename, "application/json;charset=utf-8");
}

export const exportCSV = exportToCsv;
export const exportJSON = exportToJson;
