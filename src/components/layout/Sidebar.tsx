import {
  ArrowDownToLine,
  ChevronDown,
  Database,
  FolderCode,
  HardDrive,
  History,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { SchemaTree } from "../schema/SchemaTree";
import {
  DRIVER_LABELS,
  type ConnectionInfo,
  type TableInfo,
} from "../../lib/types";
export type SidebarView = "database" | "saved" | "history";
export function Sidebar({
  connections,
  activeConnection,
  onConnection,
  onAdd,
  tables,
  onTable,
  search,
  onSearch,
  view,
  onView,
  savedCount,
  onImport,
  onImportSql,
}: {
  connections: ConnectionInfo[];
  activeConnection: string;
  onConnection: (id: string) => void;
  onAdd: () => void;
  tables: TableInfo[];
  onTable: (table: TableInfo) => void;
  search: string;
  onSearch: (text: string) => void;
  view: SidebarView;
  onView: (view: SidebarView) => void;
  savedCount: number;
  onImport: () => void;
  onImportSql: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="workspace-switch">
        <div className="workspace-icon">
          <Sparkles size={18} />
        </div>
        <div>
          <strong>Personal workspace</strong>
          <span>Make yourself at home</span>
        </div>
        <ChevronDown size={14} />
      </div>
      <div className="sidebar-navigation">
        <button
          className={view === "database" ? "selected" : ""}
          onClick={() => onView("database")}
        >
          <Database size={17} />
          Database explorer
          <span className="nav-count">{connections.length}</span>
        </button>
        <button
          className={view === "saved" ? "selected" : ""}
          onClick={() => onView("saved")}
        >
          <Star size={17} />
          Saved queries<span className="nav-count">{savedCount}</span>
        </button>
        <button
          className={view === "history" ? "selected" : ""}
          onClick={() => onView("history")}
        >
          <History size={17} />
          Query history
        </button>
      </div>
      <div className="section-label">
        CONNECTIONS
        <button
          className="icon-button"
          onClick={onAdd}
          aria-label="Add connection"
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="connection-list">
        {connections.map((c) => (
          <button
            key={c.id}
            onClick={() => onConnection(c.id)}
            className={`connection-item ${c.id === activeConnection ? "selected" : ""}`}
          >
            <span className="connection-symbol">
              <Database size={17} />
            </span>
            <span>
              <strong>{c.name}</strong>
              <small>
                {DRIVER_LABELS[c.driver]} <span>·</span>{" "}
                {c.id === "demo" ? "Local playground" : c.database}
              </small>
            </span>
            <i
              className="status-dot"
              title={
                c.connected ? "Connected" : "Disconnected · select to reconnect"
              }
              aria-label={c.connected ? "Connected" : "Disconnected"}
              style={
                c.connected
                  ? undefined
                  : { background: "var(--text-muted)", boxShadow: "none" }
              }
            />
          </button>
        ))}
      </div>
      <div className="schema-search">
        <Search size={14} />
        <input
          aria-label="Filter tables"
          placeholder="Find a table…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <kbd>/</kbd>
      </div>
      <div className="schema-heading">
        <ChevronDown size={13} />
        <FolderCode size={14} />
        <span>{tables[0]?.schema || "main"}</span>
        <small>{tables.length} tables</small>
      </div>
      <div className="schema-container">
        <SchemaTree tables={tables} filter={search} onSelect={onTable} />
      </div>
      <button className="import-button" onClick={onImport}>
        <ArrowDownToLine size={15} />
        Open SQLite file<span>.db</span>
      </button>
      <button className="import-button" onClick={onImportSql}>
        <FolderCode size={15} />
        Open SQL file<span>.sql</span>
      </button>
      <div className="sidebar-bottom">
        <div className="local-orbit">
          <HardDrive size={17} />
        </div>
        <div>
          <strong>Right here. On your device.</strong>
          <p>No cloud. No middleman.</p>
        </div>
        <ShieldCheck size={14} />
      </div>
    </aside>
  );
}
