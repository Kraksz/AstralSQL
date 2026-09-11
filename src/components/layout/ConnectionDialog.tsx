import { useEffect, useRef, useState } from "react";
import { Database, HardDrive, LockKeyhole, X } from "lucide-react";
import {
  DRIVER_LABELS,
  type ConnectionConfig,
  type Driver,
} from "../../lib/types";
import { connectionFromForm } from "../../lib/connectionForm";
import { testConnection } from "../editor/queryRunner";
export default function ConnectionDialog({
  onClose,
  onHelp,
  onConnect,
  desktop,
  initial,
}: {
  onClose: () => void;
  onHelp: () => void;
  onConnect: (config: ConnectionConfig) => Promise<void>;
  desktop: boolean;
  initial?: Omit<ConnectionConfig, "password">;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [driver, setDriver] = useState<Driver>(initial?.driver ?? "mysql");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!desktop) {
      setError(
        "Direct PostgreSQL, MySQL, and MariaDB connections are available in the desktop app. Use Open SQLite file to work with a local database in this preview.",
      );
      return;
    }
    const form = new FormData(e.currentTarget);
    const testOnly =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "test";
    setBusy(true);
    setTesting(testOnly);
    setError("");
    setSuccess("");
    try {
      const config = connectionFromForm(form, driver);
      if (initial) config.id = initial.id;
      if (testOnly) {
        const elapsed = await testConnection(config);
        setSuccess(
          `${DRIVER_LABELS[driver]} responded successfully in ${elapsed} ms. Test connection closed; nothing saved.`,
        );
      } else {
        await onConnect(config);
        onClose();
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
      setTesting(false);
    }
  }
  return (
    <dialog ref={ref} className="connection-dialog" onCancel={onClose}>
      <form
        onSubmit={submit}
        onChange={() => {
          setSuccess("");
          setError("");
        }}
      >
        <header>
          <div className="dialog-icon">
            <Database size={22} />
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close connection dialog"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <h2>
          A new connection.
          <br />
          <span>A world of data.</span>
        </h2>
        <p>Connect directly. Your credentials stay on your device.</p>
        <button type="button" className="connection-help-link" onClick={onHelp}>
          Connecting from another PC? Open the guide →
        </button>
        <fieldset disabled={busy} className="connection-fields">
          <div className="driver-options">
            {(["postgres", "mysql", "mariadb", "sqlite"] as Driver[]).map(
              (d) => (
                <button
                  type="button"
                  key={d}
                  className={driver === d ? "active" : ""}
                  disabled={busy}
                  aria-pressed={driver === d}
                  onClick={() => {
                    setDriver(d);
                    setSuccess("");
                    setError("");
                  }}
                >
                  {d === "sqlite" ? (
                    <HardDrive size={18} />
                  ) : (
                    <Database size={18} />
                  )}{" "}
                  {DRIVER_LABELS[d]}
                </button>
              ),
            )}
          </div>
          <label>
            Connection name
            <input
              name="name"
              defaultValue={initial?.name}
              required
              placeholder="My database"
              autoComplete="off"
            />
          </label>
          {driver !== "sqlite" && (
            <div className="field-row">
              <label>
                Server host or IP
                <input
                  name="host"
                  defaultValue={initial?.host}
                  required
                  placeholder="db.example.com or 203.0.113.10"
                  autoComplete="off"
                  aria-describedby="host-help"
                />
              </label>
              <label className="port-field">
                Port
                <input
                  name="port"
                  type="number"
                  key={driver}
                  min="1"
                  max="65535"
                  defaultValue={
                    initial?.driver === driver
                      ? initial.port
                      : driver === "postgres"
                        ? 5432
                        : 3306
                  }
                />
              </label>
            </div>
          )}
          {driver !== "sqlite" && (
            <p id="host-help">
              Local, LAN, or remote server. Use localhost for this machine. For
              phpMyAdmin databases, use the database host supplied by your
              hosting provider, not the phpMyAdmin web address.
            </p>
          )}
          <label>
            {driver === "sqlite" ? "Database file path" : "Database"}
            <input
              name="database"
              defaultValue={initial?.database}
              required
              placeholder={
                driver === "sqlite"
                  ? "C:\\data\\my-database.sqlite"
                  : "my_database"
              }
            />
          </label>
          {driver !== "sqlite" && (
            <>
              <div className="field-row">
                <label>
                  Username
                  <input
                    name="username"
                    defaultValue={initial?.username}
                    required
                    autoComplete="off"
                    placeholder={
                      driver === "postgres" ? "postgres" : "database_user"
                    }
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <label>
                TLS mode
                <select
                  name="sslMode"
                  defaultValue={initial?.sslMode ?? "verify-full"}
                >
                  <option value="require">Require encryption</option>
                  <option value="verify-full">
                    Verify server certificate and hostname
                  </option>
                  <option value="disable">Disabled (local development)</option>
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  name="remember"
                  type="checkbox"
                  defaultChecked={initial?.rememberPassword}
                />
                Save password in OS keychain
              </label>
            </>
          )}
        </fieldset>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {error && desktop && driver !== "sqlite" && (
          <p>
            Check the database host and port, user permissions, server
            firewall/IP allowlist, and TLS settings. Shared hosts may need
            remote database access enabled.
          </p>
        )}
        {success && (
          <div className="connection-success" role="status">
            {success}
          </div>
        )}
        {!desktop && (
          <div className="connection-note">
            <LockKeyhole size={16} />
            This browser preview supports local SQLite. Network connections
            require the Rust desktop app.
          </div>
        )}
        <button
          type="submit"
          name="action"
          value="test"
          className="secondary-button dialog-submit"
          disabled={busy || !desktop}
        >
          {testing ? "Testing connection…" : "Test connection"}
        </button>
        <button
          className="primary-button dialog-submit"
          disabled={busy}
          type="submit"
        >
          {busy && !testing ? "Connecting…" : "Connect to database"}
          <span>↗</span>
        </button>
      </form>
    </dialog>
  );
}
