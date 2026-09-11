import { useRef, useState } from "react";
import ConfirmDropDialog from "./ConfirmDropDialog";
import DatabaseDumpDialog from "./DatabaseDumpDialog";
import { formatCell } from "../grid/exportUtils";
import {
  cancelQuery,
  exportDatabase,
  importDatabase,
  importSqlScript,
  isDesktop,
  pickDatabaseDump,
  runQuery,
} from "../editor/queryRunner";
import { dropScript, listObjectsSql, parseObjects } from "../../lib/dropTables";
import {
  deleteRowSql,
  resolveRowTarget,
  type RowTarget,
} from "../../lib/rowDelete";
import type {
  ConnectionInfo,
  DumpFile,
  QueryResult,
  TableInfo,
} from "../../lib/types";
import "../../styles/database-tools.css";

type DumpDialog = { mode: "export" } | { mode: "import"; file: DumpFile };
interface RowDelete {
  statement: string;
  summary: string;
  run: () => Promise<void>;
}

function stamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** Drop, export, import and row-delete actions for the active connection, with their dialogs. */
export function useDatabaseTools({
  connection,
  busyRef,
  blocked,
  refreshSchema,
  onToast,
  onError,
}: {
  connection?: ConnectionInfo;
  busyRef: { current: boolean };
  blocked: boolean;
  refreshSchema: (connectionId: string) => Promise<void>;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [drop, setDrop] = useState<TableInfo | "all" | null>(null);
  const [dump, setDump] = useState<DumpDialog | null>(null);
  const [rowDelete, setRowDelete] = useState<RowDelete | null>(null);
  // The SQL behind each shown result, so row actions never follow newer editor text.
  const executed = useRef<Record<string, { sql: string; result: QueryResult }>>(
    {},
  );
  const canDrop = Boolean(connection?.connected);
  const canDump =
    canDrop &&
    isDesktop &&
    (connection?.driver === "mysql" || connection?.driver === "mariadb");

  function ready(): boolean {
    if (busyRef.current || blocked) {
      onToast("Wait for the current database operation to finish.");
      return false;
    }
    return true;
  }

  // Holding the workspace busy flag keeps connections from switching mid-operation.
  async function exclusive<T>(
    connectionId: string,
    run: () => Promise<T>,
    refresh: boolean,
  ): Promise<T> {
    busyRef.current = true;
    try {
      return await run();
    } finally {
      if (refresh) await refreshSchema(connectionId).catch(() => undefined);
      busyRef.current = false;
    }
  }

  function dropNow(target: TableInfo | "all", source: ConnectionInfo) {
    return exclusive(
      source.id,
      async () => {
        const listing = await runQuery(
          source.id,
          listObjectsSql(source.driver),
          10_000,
          crypto.randomUUID(),
        );
        const objects = parseObjects(listing).filter(
          (item) =>
            target === "all" ||
            (item.name === target.name &&
              (source.driver !== "postgres" || item.schema === target.schema)),
        );
        if (!objects.length)
          throw new Error(
            target === "all"
              ? "There are no tables to drop."
              : `${target.name} no longer exists. Refresh the schema.`,
          );
        await importSqlScript(
          source.id,
          dropScript(source.driver, objects, target === "all"),
          crypto.randomUUID(),
        );
        onToast(
          target === "all"
            ? `Dropped ${objects.length} tables and views from ${source.database}.`
            : `Dropped ${target.name}.`,
        );
      },
      true,
    );
  }

  function rowTarget(
    key: string,
    result: QueryResult | null,
    tables: TableInfo[],
  ): RowTarget | string {
    const run = executed.current[key];
    if (!connection?.connected)
      return "Connect to the database to delete rows.";
    if (!result || run?.result !== result)
      return "Deleting rows here works on the results of a SELECT from one table. Run the query again first.";
    return resolveRowTarget(run.sql, result, tables, connection.driver);
  }

  function openDeleteRow(
    key: string,
    result: QueryResult | null,
    rowIndex: number,
    tables: TableInfo[],
    onDeleted: (next: QueryResult) => void,
  ) {
    const target = rowTarget(key, result, tables);
    const row = result?.rows[rowIndex];
    if (typeof target === "string") {
      onToast(target);
      return;
    }
    if (!result || !row || !connection) {
      onToast("That row is no longer shown.");
      return;
    }
    if (!ready()) return;
    let statement: string;
    try {
      statement = deleteRowSql(connection.driver, target, row);
    } catch (error) {
      onToast(error instanceof Error ? error.message : String(error));
      return;
    }
    const source = connection;
    const sql = executed.current[key].sql;
    setRowDelete({
      statement,
      summary: `${target.table.name} where ${target.keys
        .map((item) => `${item.column} = ${formatCell(row[item.index])}`)
        .join(" and ")}`,
      run: () =>
        exclusive(
          source.id,
          async () => {
            const outcome = await runQuery(
              source.id,
              statement,
              1,
              crypto.randomUUID(),
            );
            if (outcome.rowsAffected === 0)
              throw new Error(
                "No row was deleted because it no longer matches. It may have been changed or deleted already; run the query again.",
              );
            const next = {
              ...result,
              rows: result.rows.filter((_, index) => index !== rowIndex),
            };
            executed.current[key] = { sql, result: next };
            onDeleted(next);
            onToast(`Deleted the row from ${target.table.name}.`);
          },
          false,
        ),
    });
  }

  const dialogs = (
    <>
      {drop && connection && (
        <ConfirmDropDialog
          title={
            drop === "all"
              ? `Drop every table in ${connection.database}?`
              : `Drop ${drop.name}?`
          }
          detail={
            drop === "all"
              ? `Deletes all tables and views in ${connection.name} / ${connection.database}, with all their rows. Export the database first if you might need it again.`
              : `Deletes the table ${drop.name} and all its rows from ${connection.name} / ${connection.database}.`
          }
          confirmText={drop === "all" ? connection.database : drop.name}
          actionLabel={drop === "all" ? "Drop all tables" : "Drop table"}
          onConfirm={() => dropNow(drop, connection)}
          onClose={() => setDrop(null)}
        />
      )}
      {rowDelete && connection && (
        <ConfirmDropDialog
          title="Delete this row?"
          detail={`Deletes one row from ${connection.name} / ${connection.database}: ${rowDelete.summary}.`}
          preview={rowDelete.statement}
          actionLabel="Delete row"
          busyLabel="Deleting…"
          onConfirm={rowDelete.run}
          onClose={() => setRowDelete(null)}
        />
      )}
      {dump && connection && (
        <DatabaseDumpDialog
          mode={dump.mode}
          file={dump.mode === "import" ? dump.file : undefined}
          connection={connection}
          onRun={(queryId) =>
            dump.mode === "export"
              ? exclusive(
                  connection.id,
                  () =>
                    exportDatabase(
                      connection.id,
                      `${connection.database}-${stamp()}.sql`,
                      queryId,
                    ),
                  false,
                )
              : exclusive(
                  connection.id,
                  () => importDatabase(connection.id, dump.file.path, queryId),
                  true,
                )
          }
          onCancel={(queryId) =>
            void cancelQuery(queryId).catch(() => undefined)
          }
          onClose={() => setDump(null)}
        />
      )}
    </>
  );

  return {
    canDrop,
    canDump,
    dialogs,
    /** Remembers the SQL that produced a result shown under `key`. */
    recordResult: (key: string, sql: string, result: QueryResult) => {
      executed.current[key] = { sql, result };
    },
    canDeleteRows: (
      key: string,
      result: QueryResult | null,
      tables: TableInfo[],
    ) => typeof rowTarget(key, result, tables) !== "string",
    openDeleteRow,
    openDrop: (table: TableInfo) => {
      if (canDrop && ready()) setDrop(table);
    },
    openDropAll: () => {
      if (canDrop && ready()) setDrop("all");
    },
    openExport: () => {
      if (canDump && ready()) setDump({ mode: "export" });
    },
    openImport: async () => {
      if (!canDump || !ready()) return;
      try {
        const file = await pickDatabaseDump();
        if (file) setDump({ mode: "import", file });
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
