export type Driver = "sqlite" | "postgres" | "mysql" | "mariadb";

export interface ConnectionConfig {
  id: string;
  name: string;
  driver: Driver;
  database: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  rememberPassword?: boolean;
  sslMode?: "disable" | "prefer" | "require" | "verify-ca" | "verify-full";
}

export interface ConnectionInfo {
  id: string;
  name: string;
  driver: Driver;
  database: string;
  host?: string;
  connected: boolean;
}

export interface QueryResult {
  columns: { name: string; dataType: string }[];
  rows: unknown[][];
  rowsAffected: number;
  elapsedMs: number;
  truncated: boolean;
}

export interface TableInfo {
  name: string;
  schema?: string;
  columns: {
    name: string;
    dataType: string;
    nullable: boolean;
    primaryKey: boolean;
  }[];
  foreignKeys: {
    column: string;
    referencedTable: string;
    referencedColumn: string;
  }[];
}

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  connectionId: string;
  executedAt: string;
  elapsedMs: number;
  rowCount: number;
  error?: string;
}

export interface DumpFile {
  path: string;
  name: string;
  bytes: number;
  preview: string;
}

export interface DumpProgress {
  done: number;
  total: number;
  label: string;
}

export interface DumpSummary {
  tables: number;
  rows: number;
  statements: number;
  bytes: number;
  elapsedMs: number;
  path: string;
}

export const DEFAULT_QUERY = `-- Your data. Your machine. Your universe.
SELECT
  id,
  name,
  email,
  country,
  plan,
  created_at
FROM users
ORDER BY id
LIMIT 100;`;

export const DRIVER_LABELS: Record<Driver, string> = {
  sqlite: "SQLite",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mariadb: "MariaDB",
};
