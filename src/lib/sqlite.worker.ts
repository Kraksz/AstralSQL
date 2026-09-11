/// <reference lib="webworker" />
import initSqlJs, { type Database } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { seedDemoDatabase } from "./demoData";
import { executeSql, readSchema } from "./sqliteEngine";
import type { ConnectionInfo } from "./types";
import { executeSQLiteScript } from "./sqlScript";

type StoredDatabase = {
  id: string;
  name: string;
  bytes: Uint8Array;
  revision?: number;
};
type WorkerRequest = {
  id: string;
  action: string;
  connectionId?: string;
  sql?: string;
  maxRows?: number;
  bytes?: ArrayBuffer;
  name?: string;
};
const databases = new Map<string, Database>();
const revisions = new Map<string, number>();
const unsaved = new Set<string>();
const SQL = initSqlJs({ locateFile: () => wasmUrl });

let storagePromise: Promise<IDBDatabase> | undefined;
function storage(): Promise<IDBDatabase> {
  storagePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("astral-sql-databases", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("databases", { keyPath: "id" });
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () =>
      reject(
        request.error ?? new Error("Browser database storage is unavailable."),
      );
    request.onblocked = () =>
      reject(
        new Error(
          "Close other Astral SQL tabs to initialize database storage.",
        ),
      );
  });
  return storagePromise;
}

async function load(id: string): Promise<StoredDatabase | undefined> {
  const store = await storage();
  return new Promise((resolve, reject) => {
    const transaction = store.transaction("databases", "readonly");
    const request = transaction.objectStore("databases").get(id);
    request.onsuccess = () =>
      resolve(request.result as StoredDatabase | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function persist(id: string, name: string, db: Database): Promise<void> {
  const bytes = db.export();
  db.run("PRAGMA foreign_keys = ON");
  const store = await storage();
  await new Promise<void>((resolve, reject) => {
    const transaction = store.transaction("databases", "readwrite");
    const objectStore = transaction.objectStore("databases");
    const previous = objectStore.get(id);
    let nextRevision = 0;
    previous.onsuccess = () => {
      const storedRevision =
        (previous.result as StoredDatabase | undefined)?.revision ?? 0;
      // Also protects against lost writes in browsers without the Web Locks API.
      if (storedRevision !== (revisions.get(id) ?? 0)) {
        transaction.abort();
        return;
      }
      nextRevision = storedRevision + 1;
      objectStore.put({
        id,
        name,
        bytes,
        revision: nextRevision,
      } satisfies StoredDatabase);
    };
    transaction.oncomplete = () => {
      revisions.set(id, nextRevision);
      unsaved.delete(id);
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error("Database storage transaction was interrupted."),
      );
  });
}

function info(id: string, name: string): ConnectionInfo {
  return {
    id,
    name,
    driver: "sqlite",
    database: id === "demo" ? "astral_demo.sqlite" : name,
    connected: true,
  };
}

async function getDatabase(id: string): Promise<Database> {
  const current = databases.get(id);
  if (current && unsaved.has(id)) return current;
  const saved = await load(id);
  if (!saved)
    throw new Error(
      "This database is not connected. Open it again to continue.",
    );
  if (current && revisions.get(id) === (saved.revision ?? 0)) return current;
  current?.close();
  databases.delete(id);
  const module = await SQL;
  const db = new module.Database(saved.bytes);
  db.run("PRAGMA foreign_keys = ON");
  databases.set(id, db);
  revisions.set(id, saved.revision ?? 0);
  return db;
}

async function handle(request: WorkerRequest): Promise<unknown> {
  const module = await SQL;
  const connectionId = request.connectionId ?? "demo";
  if (request.action === "list") {
    const store = await storage();
    return new Promise<ConnectionInfo[]>((resolve, reject) => {
      const found: ConnectionInfo[] = [];
      const cursor = store
        .transaction("databases", "readonly")
        .objectStore("databases")
        .openCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) {
          resolve(found);
          return;
        }
        const saved = cursor.result.value as StoredDatabase;
        if (saved.id !== "demo") found.push(info(saved.id, saved.name));
        cursor.result.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
  }
  if (request.action === "initialize") {
    const saved = await load("demo");
    if (saved) {
      await getDatabase("demo");
      return info("demo", "Astral playground");
    }
    if (!databases.has("demo")) {
      const db = new module.Database();
      try {
        seedDemoDatabase(db);
        db.run("PRAGMA foreign_keys = ON");
        await persist("demo", "Astral playground", db);
        databases.set("demo", db);
      } catch (error) {
        db.close();
        throw error;
      }
    }
    return info("demo", "Astral playground");
  }
  if (request.action === "import") {
    if (!request.bytes) throw new Error("No SQLite file was supplied.");
    const bytes = new Uint8Array(request.bytes);
    if (
      new TextDecoder().decode(bytes.slice(0, 16)) !== "SQLite format 3\u0000"
    )
      throw new Error("Choose a valid SQLite 3 database file.");
    const db = new module.Database(bytes);
    try {
      const check = db.exec("PRAGMA quick_check");
      if (check[0]?.values[0]?.[0] !== "ok")
        throw new Error(
          "SQLite found corruption in this file. Open a healthy database or restore a backup.",
        );
      readSchema(db);
      db.run("PRAGMA foreign_keys = ON");
      await persist(connectionId, request.name ?? "Imported database", db);
    } catch (error) {
      db.close();
      throw error;
    }
    databases.get(connectionId)?.close();
    databases.set(connectionId, db);
    return info(connectionId, request.name ?? "Imported database");
  }
  if (request.action === "disconnect") {
    databases.get(connectionId)?.close();
    databases.delete(connectionId);
    revisions.delete(connectionId);
    unsaved.delete(connectionId);
    return undefined;
  }
  const db = await getDatabase(connectionId);
  if (request.action === "script") {
    if (unsaved.has(connectionId))
      throw new Error(
        "Back up the current unsaved database before importing SQL.",
      );
    const started = performance.now();
    const copy = new module.Database(db.export());
    db.run("PRAGMA foreign_keys=ON");
    try {
      copy.run("PRAGMA foreign_keys=ON");
      executeSQLiteScript(copy, request.sql ?? "");
      const saved = await load(connectionId);
      await persist(connectionId, saved?.name ?? connectionId, copy);
    } catch (error) {
      copy.close();
      throw new Error(
        `SQL import failed; the original browser database was preserved. ${error instanceof Error ? error.message : String(error)}. Use a matching database engine for MySQL/MariaDB exports.`,
      );
    }
    db.close();
    databases.set(connectionId, copy);
    return {
      columns: [],
      rows: [],
      rowsAffected: 0,
      elapsedMs: performance.now() - started,
      truncated: false,
    };
  }
  if (request.action === "schema") return readSchema(db);
  if (request.action === "export") {
    const bytes = db.export();
    db.run("PRAGMA foreign_keys = ON");
    return bytes;
  }
  if (request.action === "query") {
    if (unsaved.has(connectionId))
      throw new Error(
        "The previous statement has unsaved changes. Download a database backup before reopening this connection or reloading the page.",
      );
    const result = executeSql(db, request.sql ?? "", request.maxRows);
    try {
      const saved = await load(connectionId);
      await persist(connectionId, saved?.name ?? connectionId, db);
    } catch {
      unsaved.add(connectionId);
      throw new Error(
        "The statement completed, but browser storage could not save the database. Download a database backup before leaving this page.",
      );
    }
    return result;
  }
  throw new Error(`Unknown database action: ${request.action}`);
}

// Serialize requests, including persistence, so a later query cannot overtake a save.
let queue: Promise<void> = Promise.resolve();
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  queue = queue.then(async () => {
    try {
      const request = event.data;
      const run = () => handle(request);
      // Separate tabs share persisted files. Hold a lock through refresh, query, and save.
      const result =
        request.action !== "list" && navigator.locks
          ? await navigator.locks.request(
              `astral-sql:${request.connectionId ?? "demo"}`,
              run,
            )
          : await run();
      self.postMessage({ id: event.data.id, result });
    } catch (error) {
      self.postMessage({
        id: event.data.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
