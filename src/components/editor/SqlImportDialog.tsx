import { useEffect, useRef, useState } from "react";
import { DRIVER_LABELS, type ConnectionInfo } from "../../lib/types";

export default function SqlImportDialog({
  file,
  connection,
  onClose,
  onOpen,
  onImport,
  onCancel,
}: {
  file: { name: string; sql: string };
  connection?: ConnectionInfo;
  onClose: () => void;
  onOpen: () => void;
  onImport: () => Promise<boolean | undefined>;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sql-import-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <span className="section-kicker">SQL FILE</span>
      <h2>Review your import.</h2>
      <p>
        {file.name} ·{" "}
        {(new TextEncoder().encode(file.sql).length / 1024).toFixed(1)} KB
      </p>
      <div className="import-target">
        <strong>Destination</strong>
        <span>
          {connection?.connected
            ? `${connection.name} / ${connection.database} · ${DRIVER_LABELS[connection.driver]}`
            : "No connected database — open in the editor or connect first."}
        </span>
      </div>
      <p>
        Runs the whole script on this database. Scripts can change or delete
        data, and may name other databases. Use a backup; a failed desktop
        import can leave earlier statements committed. SQL must match the
        destination engine.
      </p>
      <pre aria-label="SQL file preview">
        {file.sql.slice(0, 12000)}
        {file.sql.length > 12000
          ? "\n… Preview shortened. Open in editor to review the full file."
          : ""}
      </pre>
      {outcome && <p role="status">{outcome}</p>}
      <footer>
        {busy ? (
          <button onClick={onCancel}>Cancel import</button>
        ) : (
          <button onClick={onClose}>Close</button>
        )}
        <button disabled={busy} onClick={onOpen}>
          Open in editor
        </button>
        <button
          className="primary-button"
          disabled={
            busy || !connection?.connected || outcome.startsWith("Imported")
          }
          onClick={async () => {
            setBusy(true);
            setOutcome("");
            try {
              const ok = await onImport();
              setOutcome(
                ok
                  ? "Imported successfully. Schema refreshed."
                  : "Import stopped. Close this dialog to see the error and inspect any partial changes.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Importing…" : "Import into database"}
        </button>
      </footer>
    </dialog>
  );
}
