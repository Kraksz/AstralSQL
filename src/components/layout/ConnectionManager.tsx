import { useEffect, useRef } from "react";
import { ArrowUpRight, Database, Pencil, Plus, Unplug, X } from "lucide-react";
import { DRIVER_LABELS, type ConnectionInfo } from "../../lib/types";
export default function ConnectionManager({
  connections,
  onClose,
  onNew,
  onSelect,
  onEdit,
  onDisconnect,
  busy,
}: {
  connections: ConnectionInfo[];
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDisconnect: (id: string) => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} className="connection-manager" onCancel={onClose}>
      <header>
        <div>
          <span className="section-kicker">YOUR DATABASES</span>
          <h2>Connection space</h2>
          <p>One place for everything you’re working with.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Close connection manager"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="connection-cards">
        {connections.map((c) => (
          <article className="connection-card" key={c.id}>
            <div className="connection-card-top">
              <div className="connection-card-icon">
                <Database size={22} />
              </div>
              <span
                className={
                  c.connected ? "connection-state online" : "connection-state"
                }
              >
                {c.connected ? "Connected" : "Offline"}
              </span>
            </div>
            <h3>{c.name}</h3>
            <p>
              {DRIVER_LABELS[c.driver]} <span>·</span>{" "}
              {c.host || "On this device"}
            </p>
            <code>{c.database}</code>
            <footer>
              <button disabled={busy} onClick={() => onSelect(c.id)}>
                {c.connected ? "Open workspace" : "Connect"}
                <ArrowUpRight size={15} />
              </button>
              {c.connected ? (
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={`Disconnect ${c.name}`}
                  onClick={() => onDisconnect(c.id)}
                >
                  <Unplug size={16} />
                </button>
              ) : (
                c.id !== "demo" && (
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Edit ${c.name}`}
                    onClick={() => onEdit(c.id)}
                  >
                    <Pencil size={16} />
                  </button>
                )
              )}
            </footer>
          </article>
        ))}
      </div>
      <button
        className="primary-button manager-add"
        disabled={busy}
        onClick={onNew}
      >
        <Plus size={16} /> New connection
      </button>
    </dialog>
  );
}
