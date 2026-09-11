import { useState } from "react";
import ConfirmDropDialog from "./ConfirmDropDialog";
import DatabaseDumpDialog from "./DatabaseDumpDialog";
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
import type { ConnectionInfo, DumpFile, TableInfo } from "../../lib/types";
import "../../styles/database-tools.css";

type DumpDialog = { mode: "export" } | { mode: "import"; file: DumpFile };

function stamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** Drop, export and import actions for the active connection, with their dialogs. */
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
