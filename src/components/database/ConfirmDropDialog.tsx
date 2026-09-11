import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";

/** Destructive confirmation: the action unlocks only after typing `confirmText`. */
export default function ConfirmDropDialog({
  title,
  detail,
  confirmText,
  actionLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  detail: string;
  confirmText: string;
  actionLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = typed === confirmText;
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function confirm() {
    if (!matches || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="sql-import-dialog danger-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <span className="section-kicker danger-kicker">
        <TriangleAlert size={13} /> CANNOT BE UNDONE
      </span>
      <h2>{title}</h2>
      <p>{detail}</p>
      <label className="danger-confirm">
        <span>
          Type <code>{confirmText}</code> to confirm
        </span>
        <input
          autoFocus
          value={typed}
          spellCheck={false}
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void confirm();
          }}
        />
      </label>
      {error && (
        <pre className="dialog-error" role="alert">
          {error}
        </pre>
      )}
      <footer>
        <button onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className="danger-button"
          disabled={!matches || busy}
          onClick={() => void confirm()}
        >
          {busy ? "Dropping…" : actionLabel}
        </button>
      </footer>
    </dialog>
  );
}
