import type {
  ConnectionConfig,
  ConnectionInfo,
  QueryResult,
  TableInfo,
} from "../../lib/types";
import { normalizeMaxRows } from "../../lib/sqliteEngine";

export const isDesktop =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  queryId?: string;
};
const pending = new Map<string, PendingRequest>();
const connections = new Map<string, ConnectionInfo>();
let worker: Worker | undefined;
let demoPromise: Promise<ConnectionInfo> | undefined;

async function invoke<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { invoke: nativeInvoke } = await import("@tauri-apps/api/core");
  try {
    return await nativeInvoke<T>(command, args);
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : JSON.stringify(error));
  }
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../../lib/sqlite.worker.ts", import.meta.url), {
    type: "module",
  });
  const createdWorker = worker;
  createdWorker.onmessage = (
    event: MessageEvent<{ id: string; result?: unknown; error?: string }>,
  ) => {
    if (worker !== createdWorker) return;
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data.result);
  };
  createdWorker.onerror = (event) => {
    if (worker !== createdWorker) return;
    resetWorker(
      new Error(
        event.message ||
          "The SQLite worker stopped unexpectedly. Reconnect to reopen the last saved database.",
      ),
    );
  };
  return worker;
}

function resetWorker(reason: Error): void {
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) request.reject(reason);
  pending.clear();
  demoPromise = undefined;
}

function request<T>(
  action: string,
  payload: Record<string, unknown> = {},
  queryId?: string,
): Promise<T> {
  const target = getWorker();
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
      queryId,
    });
    try {
      target.postMessage({ id, action, ...payload });
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function initializeDemo(): Promise<ConnectionInfo> {
  demoPromise ??= (async () => {
    const result = isDesktop
      ? await connectDatabase({
          id: "demo",
          name: "Astral playground",
          driver: "sqlite",
          database: ":astral-demo:",
        })
      : await request<ConnectionInfo>("initialize");
    connections.set(result.id, result);
    return result;
  })().catch((error) => {
    demoPromise = undefined;
    throw error;
  });
  return demoPromise;
}

export async function connectDatabase(
  config: ConnectionConfig,
): Promise<ConnectionInfo> {
  if (!isDesktop) {
    if (config.driver !== "sqlite")
      throw new Error(
        "Direct PostgreSQL, MySQL, and MariaDB connections are available in the desktop app. The browser playground runs local SQLite.",
      );
    if (config.id === "demo") return initializeDemo();
    const existing = connections.get(config.id);
    if (existing) {
      await request<TableInfo[]>("schema", { connectionId: config.id });
      return existing;
    }
    throw new Error(
      "Use Open SQLite file to connect a database in the browser. Browser pages cannot open a filesystem path directly.",
    );
  }
  const result = await invoke<ConnectionInfo>("connect_database", { config });
  connections.set(result.id, result);
  return result;
}

export async function disconnectDatabase(connectionId: string): Promise<void> {
  if (isDesktop) await invoke("disconnect_database", { connectionId });
  else await request("disconnect", { connectionId });
  connections.delete(connectionId);
  if (connectionId === "demo") demoPromise = undefined;
}

export async function pickSQLiteFile(): Promise<string | null> {
  if (!isDesktop)
    throw new Error("Native file chooser requires the desktop app.");
  return invoke<string | null>("pick_sqlite_file", {});
}

export async function openSqlFile(): Promise<{
  name: string;
  sql: string;
} | null> {
  return invoke("open_sql_file", {});
}

export async function importSqlScript(
  connectionId: string,
  sql: string,
  queryId: string,
): Promise<QueryResult> {
  const payload = { connectionId, sql, queryId };
  return isDesktop
    ? invoke("import_sql_script", payload)
    : request("script", payload, queryId);
}

export async function testConnection(
  config: ConnectionConfig,
): Promise<number> {
  if (!isDesktop)
    throw new Error(
      "Connection testing requires the Rust desktop app. The browser playground runs local SQLite.",
    );
  return invoke<number>("test_connection", {
    config: { ...config, rememberPassword: false },
  });
}

export async function runQuery(
  connectionId: string,
  sql: string,
  maxRows = 1000,
  queryId = crypto.randomUUID(),
): Promise<QueryResult> {
  const payload = {
    connectionId,
    sql,
    maxRows: normalizeMaxRows(maxRows),
    queryId,
  };
  return isDesktop
    ? invoke<QueryResult>("execute_query", payload)
    : request<QueryResult>("query", payload, queryId);
}

export async function cancelQuery(queryId: string): Promise<void> {
  if (isDesktop) return invoke("cancel_query", { queryId });
  if (![...pending.values()].some((value) => value.queryId === queryId)) return;
  resetWorker(
    new Error(
      "Query stopped. The browser worker will reopen the last saved database; unsaved changes from the interrupted operation may be lost.",
    ),
  );
}

export async function getSchema(connectionId: string): Promise<TableInfo[]> {
  return isDesktop
    ? invoke<TableInfo[]>("get_schema", { connectionId })
    : request<TableInfo[]>("schema", { connectionId });
}

/** Browser files retained in IndexedDB can be reopened after a page reload. */
export async function listLocalDatabases(): Promise<ConnectionInfo[]> {
  if (isDesktop) return [];
  const saved = await request<ConnectionInfo[]>("list");
  saved.forEach((connection) => connections.set(connection.id, connection));
  return saved;
}

export async function importSQLite(file: File): Promise<ConnectionInfo> {
  if (isDesktop)
    throw new Error(
      "Use the database connection dialog to open the SQLite file by its full path in the desktop app.",
    );
  if (file.size > 128 * 1024 * 1024)
    throw new Error(
      "The browser playground supports SQLite files up to 128 MB. Use the desktop app for larger databases.",
    );
  const connectionId = `file-${crypto.randomUUID()}`;
  const result = await request<ConnectionInfo>("import", {
    connectionId,
    name: file.name,
    bytes: await file.arrayBuffer(),
  });
  connections.set(result.id, result);
  return result;
}

export async function downloadDatabase(connectionId: string): Promise<void> {
  if (isDesktop)
    throw new Error(
      "The desktop app saves SQLite changes directly to the database file.",
    );
  const bytes = await request<Uint8Array>("export", { connectionId });
  const buffer = new Uint8Array(bytes).buffer;
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.sqlite3" }),
  );
  const link = document.createElement("a");
  link.href = url;
  const original = connections.get(connectionId)?.database ?? "astral.sqlite";
  link.download = /\.(sqlite|sqlite3|db)$/i.test(original)
    ? original
    : `${original}.sqlite`;
  // Attached links and a longer URL lifetime also work with slower mobile downloads.
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
