import type { Database } from "sql.js";

export const MAX_SCRIPT_BYTES = 16 * 1024 * 1024;

export function validateScriptText(sql: string): string {
  const normalized = sql.replace(/^\uFEFF/, "");
  if (!normalized.trim()) throw new Error("This SQL file is empty.");
  if (new TextEncoder().encode(normalized).length > MAX_SCRIPT_BYTES)
    throw new Error("SQL scripts must be 16 MiB or smaller.");
  if (normalized.includes("\0"))
    throw new Error("Choose a UTF-8 SQL text file, not a database binary.");
  return normalized;
}

/** Runs on a temporary copy in the browser worker; failure leaves the original intact. */
export function executeSQLiteScript(db: Database, sql: string): void {
  const text = validateScriptText(sql);
  db.run(text);
  // A missing COMMIT must never be reported as a successful import.
  let openTransaction = false;
  try {
    db.run("ROLLBACK");
    openTransaction = true;
  } catch {
    /* No active transaction. */
  }
  if (openTransaction)
    throw new Error(
      "The script left a transaction open. Add COMMIT before importing.",
    );
  db.run("PRAGMA foreign_keys=ON");
}
