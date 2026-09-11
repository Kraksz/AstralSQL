import { useEffect, useRef, useState } from "react";
import { dumpProgress } from "../editor/queryRunner";
import {
  DRIVER_LABELS,
  type ConnectionInfo,
  type DumpFile,
  type DumpProgress,
  type DumpSummary,
} from "../../lib/types";

const PREVIEW_BYTES = 64 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function describe(mode: "export" | "import", summary: DumpSummary): string {
  const seconds = (summary.elapsedMs / 1000).toFixed(1);
  const rows = summary.rows.toLocaleString();
  return mode === "export"
    ? `Saved ${summary.tables} tables and views · ${rows} rows · ${formatBytes(summary.bytes)} in ${seconds} s to ${summary.path}`
    : `Imported ${summary.statements.toLocaleString()} statements · ${rows} rows affected in ${seconds} s. Schema refreshed.`;
}

export default function DatabaseDumpDialog({
  mode,
  file,
  connection,
  onRun,
  onCancel,
  onClose,
}: {
  mode: "export" | "import";
  file?: DumpFile;
  connection: ConnectionInfo;
  onRun: (queryId: string) => Promise<DumpSummary | null>;
  onCancel: (queryId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [queryId, setQueryId] = useState("");
  const [progress, setProgress] = useState<DumpProgress | null>(null);
  const [summary, setSummary] = useState<DumpSummary | null>(null);
  const [error, setError] = useState("");
  const busy = queryId !== "";
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    if (!queryId) return;
    let alive = true;
    const timer = setInterval(() => {
      void dumpProgress(queryId)
        .then((next) => {
          if (alive && next) setProgress(next);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [queryId]);
  async function start() {
    const id = crypto.randomUUID();
    setQueryId(id);
    setProgress(null);
    setSummary(null);
    setError("");
    try {
      const result = await onRun(id);
      if (result) setSummary(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setQueryId("");
    }
  }
  const percent =
    progress && progress.total > 0
      ? Math.min(100, (progress.done / progress.total) * 100)
      : 0;
  return (
    <dialog
      ref={ref}
      className="sql-import-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <span className="section-kicker">
        {mode === "export" ? "DATABASE EXPORT" : "DATABASE IMPORT"}
      </span>
      <h2>
        {mode === "export" ? "Export to one file." : "Review your import."}
      </h2>
      {file && (
        <p>
          {file.name} · {formatBytes(file.bytes)}
        </p>
      )}
      <div className="import-target">
        <strong>{mode === "export" ? "Source" : "Destination"}</strong>
        <span>
          {connection.name} / {connection.database} ·{" "}
          {DRIVER_LABELS[connection.driver]}
        </span>
      </div>
      <p>
        {mode === "export"
          ? "Writes every table's structure and rows, plus views, into one .sql file you choose. Stored routines, triggers and events are not included. The file imports here, in phpMyAdmin, or with the mysql client."
          : "Runs the file statement by statement on this database. Dumps usually drop and recreate their tables, so tables in the file replace tables with the same name. If a statement fails, the ones before it stay applied, so keep a backup."}
      </p>
      {file && !busy && !summary && (
        <pre aria-label="Dump preview">
          {file.preview}
          {file.bytes > PREVIEW_BYTES
            ? "\n… Preview shows the start of the file."
            : ""}
        </pre>
      )}
      {(busy || summary) && (
        <div className="dump-progress" role="status">
          <div className="dump-progress-bar">
            <span style={{ width: `${summary ? 100 : percent}%` }} />
          </div>
          <small>
            {summary
              ? describe(mode, summary)
              : (progress?.label ??
                (mode === "export"
                  ? "Choose where to save the file…"
                  : "Starting…"))}
          </small>
        </div>
      )}
      {error && (
        <pre className="dialog-error" role="alert">
          {error}
        </pre>
      )}
      <footer>
        {busy ? (
          <button disabled={!progress} onClick={() => onCancel(queryId)}>
            Stop
          </button>
        ) : (
          <button onClick={onClose}>{summary ? "Done" : "Close"}</button>
        )}
        {!summary && (
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void start()}
          >
            {busy
              ? mode === "export"
                ? "Exporting…"
                : "Importing…"
              : mode === "export"
                ? "Choose file and export"
                : "Import into database"}
          </button>
        )}
      </footer>
    </dialog>
  );
}
