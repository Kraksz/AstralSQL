import ConnectionGuideDialog from "./components/help/ConnectionGuideDialog";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowDownToLine,
  ArrowRight,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  Copy,
  Database,
  FileCode2,
  Filter,
  GitBranch,
  History,
  Info,
  KeyRound,
  LoaderCircle,
  MoreHorizontal,
  Play,
  Plus,
  Rows3,
  Columns2,
  PanelTop,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Table2,
  X,
} from "lucide-react";
import { format } from "sql-formatter";
import { Header } from "./components/layout/Header";
import { NavigationRail } from "./components/layout/NavigationRail";
import ConnectionManager from "./components/layout/ConnectionManager";
import { Sidebar, type SidebarView } from "./components/layout/Sidebar";
import { Tabs, type QueryTab } from "./components/layout/Tabs";
import ConnectionDialog from "./components/layout/ConnectionDialog";
import CommandPalette, {
  type PaletteAction,
} from "./components/command/CommandPalette";
import SqlEditor from "./components/editor/SqlEditor";
import VirtualTable from "./components/grid/VirtualTable";
import RelationshipViewer from "./components/schema/RelationshipViewer";
import AstralWaveCanvas from "./components/canvas/AstralWaveCanvas";
import PageLoader from "./components/intro/PageLoader";
import SqlImportDialog from "./components/editor/SqlImportDialog";
import WorkspaceContextMenu from "./components/layout/WorkspaceContextMenu";
import { useDatabaseTools } from "./components/database/useDatabaseTools";
import { validateScriptText, MAX_SCRIPT_BYTES } from "./lib/sqlScript";
import {
  initializeDemo,
  connectDatabase,
  disconnectDatabase,
  runQuery,
  cancelQuery,
  getSchema,
  isDesktop,
  importSQLite,
  listLocalDatabases,
  downloadDatabase,
  pickSQLiteFile,
  openSqlFile,
  importSqlScript,
} from "./components/editor/queryRunner";
import { exportToCsv, exportToJson } from "./components/grid/exportUtils";
import {
  DEFAULT_QUERY,
  DRIVER_LABELS,
  type ConnectionConfig,
  type ConnectionInfo,
  type QueryResult,
  type TableInfo,
} from "./lib/types";
import {
  disconnectedProfile,
  readConnectionProfiles,
  sanitizeConnectionProfile,
  writeConnectionProfiles,
  type ConnectionProfile,
} from "./lib/connectionProfiles";

interface SavedQuery {
  id: string;
  name: string;
  sql: string;
}
interface HistoryItem {
  id: string;
  sql: string;
  time: string;
  rows: number;
  elapsed: number;
  error?: string;
}
interface QueryViewState {
  result: QueryResult | null;
  error: string;
}
const queryContext = (connectionId: string, tabId: string) =>
  JSON.stringify([connectionId, tabId]);
function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is optional; database failures are reported by its worker. */
  }
}
function downloadFile(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const initialTabs: QueryTab[] = [
  { id: "first", name: "Explore users", sql: DEFAULT_QUERY },
];

export default function App() {
  const [tabs, setTabs] = useState<QueryTab[]>(() =>
    readStored("astral-tabs", initialTabs),
  );
  const [activeTab, setActiveTab] = useState(() => tabs[0]?.id || "first");
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>(() =>
    isDesktop ? readConnectionProfiles() : [],
  );
  const [connectionId, setConnectionId] = useState("demo");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [queryViews, setQueryViews] = useState<Record<string, QueryViewState>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [workspaceError, setError] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [maxRows, setMaxRows] = useState(1000);
  const [view, setView] = useState<SidebarView>("database");
  const [resultView, setResultView] = useState<
    "data" | "structure" | "relations"
  >("data");
  const [saved, setSaved] = useState<SavedQuery[]>(() =>
    readStored("astral-saved", []),
  );
  const [history, setHistory] = useState<HistoryItem[]>(() =>
    readStored("astral-history", []),
  );
  const [showGuide, setShowGuide] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile>();
  const [splitLayout, setSplitLayout] = useState(() =>
    readStored("astral-split-layout", true),
  );
  const [showPalette, setShowPalette] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const queryId = useRef("");
  const fileInput = useRef<HTMLInputElement>(null);
  const sqlFileInput = useRef<HTMLInputElement>(null);
  const [sqlImport, setSqlImport] = useState<{
    name: string;
    sql: string;
  } | null>(null);
  const busyRef = useRef(false);
  const connectionRef = useRef("demo");
  const connectionEpoch = useRef(0);
  const current =
    tabs.find((t) => t.id === activeTab) || tabs[0] || initialTabs[0];
  const contextKey = queryContext(connectionId, current.id);
  const result = queryViews[contextKey]?.result ?? null;
  const error = workspaceError || queryViews[contextKey]?.error || "";
  const connection = connections.find((c) => c.id === connectionId);
  const selectedTable =
    tables.find((t) =>
      new RegExp(
        `\\b${t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      ).test(current.sql),
    ) || tables[0];
  const desktop = isDesktop;
  useEffect(() => persist("astral-tabs", tabs), [tabs]);
  useEffect(() => persist("astral-saved", saved), [saved]);
  useEffect(() => persist("astral-history", history), [history]);
  useEffect(() => {
    if (!desktop) return;
    try {
      writeConnectionProfiles(profiles);
    } catch {
      setToast("Connection details could not be saved on this device.");
    }
  }, [profiles, desktop]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let alive = true;
    busyRef.current = true;
    const initialTab = current.id;
    const initialSql = current.sql;
    void (async () => {
      try {
        const c = await initializeDemo();
        if (!alive) return;
        const [schema, local] = await Promise.all([
          getSchema(c.id),
          listLocalDatabases(),
        ]);
        if (!alive) return;
        setConnections([c, ...local, ...profiles.map(disconnectedProfile)]);
        setTables(schema);
        if (initialSql === DEFAULT_QUERY) {
          const initial = await runQuery(
            c.id,
            DEFAULT_QUERY,
            1000,
            crypto.randomUUID(),
          );
          if (alive)
            setQueryViews((previous) => ({
              ...previous,
              [queryContext(c.id, initialTab)]: { result: initial, error: "" },
            }));
        }
        if (alive) setLoading(false);
      } catch (e) {
        if (alive) {
          setConnections(profiles.map(disconnectedProfile));
          setError(String(e instanceof Error ? e.message : e));
          setLoading(false);
        }
      } finally {
        if (alive) busyRef.current = false;
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const execute = useCallback(
    async (sqlOverride?: string, tabOverride?: string, script = false) => {
      if (busyRef.current || loading) return;
      if (!connections.find((item) => item.id === connectionId)?.connected) {
        setError(
          "This connection is disconnected. Select it in the database explorer to reconnect.",
        );
        return;
      }
      busyRef.current = true;
      setRunning(true);
      setError("");
      setView("database");
      setResultView("data");
      const sql = sqlOverride ?? current.sql;
      const id = crypto.randomUUID();
      queryId.current = id;
      const target = connectionId;
      const key = queryContext(target, tabOverride ?? current.id);
      setQueryViews((previous) => ({
        ...previous,
        [key]: { result: previous[key]?.result ?? null, error: "" },
      }));
      try {
        const data = script
          ? await importSqlScript(target, sql, id)
          : await runQuery(target, sql, maxRows, id);
        setQueryViews((previous) => ({
          ...previous,
          [key]: { result: data, error: "" },
        }));
        setHistory((h) =>
          [
            {
              id,
              sql: script ? `-- SQL file import\n${sql.slice(0, 4000)}` : sql,
              time: new Date().toISOString(),
              rows: data.rows.length,
              elapsed: data.elapsedMs,
            },
            ...h,
          ].slice(0, 100),
        );
        try {
          const schema = await getSchema(target);
          if (connectionRef.current === target) setTables(schema);
        } catch (e) {
          setToast(
            `Query completed, but the schema could not refresh: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        return true;
      } catch (e) {
        const message = String(e instanceof Error ? e.message : e);
        setQueryViews((previous) => ({
          ...previous,
          [key]: { result: previous[key]?.result ?? null, error: message },
        }));
        setHistory((h) =>
          [
            {
              id,
              sql: script ? `-- SQL file import\n${sql.slice(0, 4000)}` : sql,
              time: new Date().toISOString(),
              rows: 0,
              elapsed: 0,
              error: message,
            },
            ...h,
          ].slice(0, 100),
        );
        if (script) {
          try {
            const schema = await getSchema(target);
            if (connectionRef.current === target) setTables(schema);
          } catch {
            /* Preserve the import error. */
          }
        }
        return false;
      } finally {
        busyRef.current = false;
        setRunning(false);
        queryId.current = "";
      }
    },
    [current.sql, current.id, connectionId, maxRows, loading, connections],
  );
  function newTab(
    sql = "-- Start something good.\nSELECT * FROM users LIMIT 100;",
    name?: string,
  ) {
    const id = crypto.randomUUID();
    setTabs((t) => [...t, { id, name: name || `Query ${t.length + 1}`, sql }]);
    setActiveTab(id);
    setView("database");
    return id;
  }
  function closeTab(id: string) {
    if (tabs.length === 1) {
      setToast("Keep at least one query open.");
      return;
    }
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (activeTab === id) setActiveTab(next[0].id);
  }
  function updateSql(sql: string) {
    setTabs((t) => t.map((x) => (x.id === current.id ? { ...x, sql } : x)));
  }
  function saveQuery() {
    if (saved.some((s) => s.sql === current.sql)) {
      setToast("This query is already saved.");
      return;
    }
    setSaved((s) => [
      ...s,
      { id: crypto.randomUUID(), name: current.name, sql: current.sql },
    ]);
    setToast("Query saved on this device.");
  }
  function formatQuery() {
    try {
      updateSql(
        format(current.sql, {
          language:
            connection?.driver === "postgres"
              ? "postgresql"
              : connection?.driver === "mysql" ||
                  connection?.driver === "mariadb"
                ? "mysql"
                : "sqlite",
          keywordCase: "upper",
          tabWidth: 2,
        }),
      );
      setToast("SQL formatted.");
    } catch (e) {
      setToast(
        `Could not format: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  async function loadConnection(id: string) {
    const epoch = ++connectionEpoch.current;
    connectionRef.current = id;
    setConnectionId(id);
    setTables([]);
    setLoading(true);
    setError("");
    try {
      const schema = await getSchema(id);
      if (epoch === connectionEpoch.current) setTables(schema);
    } catch (e) {
      if (epoch === connectionEpoch.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (epoch === connectionEpoch.current) setLoading(false);
    }
  }
  async function selectConnection(id: string) {
    if (busyRef.current) {
      setToast(
        "Wait for the current operation or stop the running query before switching connections.",
      );
      return;
    }
    const selected = connections.find((item) => item.id === id);
    if (selected && !selected.connected) {
      const savedProfile = profiles.find((item) => item.id === id);
      if (
        desktop &&
        savedProfile &&
        savedProfile.driver !== "sqlite" &&
        !savedProfile.rememberPassword
      ) {
        setEditingProfile(savedProfile);
        setShowConnections(false);
        setShowConnect(true);
        return;
      }
      busyRef.current = true;
      setLoading(true);
      setError("");
      try {
        let reopened: ConnectionInfo;
        if (id === "demo") reopened = await initializeDemo();
        else if (desktop) {
          const profile = profiles.find((item) => item.id === id);
          if (!profile)
            throw new Error(
              "Saved connection details are unavailable. Create this connection again.",
            );
          reopened = await connectDatabase(profile);
        } else {
          await getSchema(id);
          reopened = { ...selected, connected: true };
        }
        setConnections((previous) =>
          previous.map((item) => (item.id === id ? reopened : item)),
        );
        await loadConnection(id);
        setToast(`Connected to ${reopened.name}.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        busyRef.current = false;
        setLoading(false);
      }
      return;
    }
    await loadConnection(id);
  }
  async function connect(config: ConnectionConfig) {
    if (busyRef.current || loading)
      throw new Error(
        "Wait for the current database operation before opening another connection.",
      );
    busyRef.current = true;
    setLoading(true);
    try {
      const c = await connectDatabase(config);
      setConnections((prev) => [...prev.filter((x) => x.id !== c.id), c]);
      if (desktop && c.id !== "demo") {
        const profile = sanitizeConnectionProfile(config);
        setProfiles((previous) => [
          ...previous.filter((item) => item.id !== profile.id),
          profile,
        ]);
      }
      await loadConnection(c.id);
      setToast(`Connected to ${c.name}.`);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }
  async function disconnectActive(id = connectionId) {
    if (busyRef.current || loading) {
      setToast("Wait for the current database operation before disconnecting.");
      return;
    }
    const target = connections.find((c) => c.id === id);
    if (!target?.connected) return;
    busyRef.current = true;
    setLoading(true);
    setError("");
    try {
      await disconnectDatabase(id);
      if (id === connectionId) ++connectionEpoch.current;
      setConnections((previous) =>
        previous.map((item) =>
          item.id === id ? { ...item, connected: false } : item,
        ),
      );
      if (id === connectionId) setTables([]);
      setToast(`Disconnected from ${target.name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }
  async function importFile(file: File) {
    if (busyRef.current || loading) {
      setToast(
        "Wait for the current database operation before importing a file.",
      );
      return;
    }
    busyRef.current = true;
    setLoading(true);
    setError("");
    try {
      const c = await importSQLite(file);
      setConnections((prev) => [...prev.filter((x) => x.id !== c.id), c]);
      await loadConnection(c.id);
      setToast(`Opened ${file.name}.`);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }
  async function openSQLite() {
    if (desktop) {
      try {
        const path = await pickSQLiteFile();
        if (path)
          await connect({
            id: crypto.randomUUID(),
            name: path.split(/[\\/]/).pop() || "SQLite database",
            driver: "sqlite",
            database: path,
          });
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
    } else {
      fileInput.current?.click();
    }
  }
  async function openSql() {
    if (busyRef.current) {
      setToast("Wait for the current operation before opening a script.");
      return;
    }
    if (!desktop) {
      sqlFileInput.current?.click();
      return;
    }
    try {
      const file = await openSqlFile();
      if (file) setSqlImport({ ...file, sql: validateScriptText(file.sql) });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }
  function tableQuery(table: TableInfo) {
    const q =
      connection?.driver === "mysql" || connection?.driver === "mariadb"
        ? "`"
        : '"';
    const quote = (name: string) => q + name.replaceAll(q, q + q) + q;
    const name =
      (table.schema && table.schema !== "main"
        ? quote(table.schema) + "."
        : "") + quote(table.name);
    const sql = `SELECT *\nFROM ${name}\nLIMIT 100;`;
    const tabId = newTab(sql, table.name);
    void execute(sql, tabId);
  }
  function exportResult(type: "csv" | "json") {
    if (!result) return;
    if (type === "csv") exportToCsv(result);
    else exportToJson(result);
    setExportOpen(false);
    setToast("Results exported.");
  }
  function dismissError() {
    setError("");
    setQueryViews((previous) => ({
      ...previous,
      [contextKey]: { result: previous[contextKey]?.result ?? null, error: "" },
    }));
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || showGuide || showConnect || showPalette) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((p) => !p);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void execute();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveQuery();
      }
      if (e.key === "Escape") {
        setShowPalette(false);
        setExportOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [execute, current, saved, showGuide, showConnect, showPalette]);
  const tools = useDatabaseTools({
    connection,
    busyRef,
    blocked: loading || running,
    refreshSchema: async (target) => {
      const schema = await getSchema(target);
      if (connectionRef.current === target) setTables(schema);
    },
    onToast: setToast,
    onError: setError,
  });
  const actions: PaletteAction[] = [
    {
      id: "guide",
      label: "Remote connection guide",
      detail: "SSH, MariaDB, MySQL, and hosting setup",
      run: () => setShowGuide(true),
    },
    {
      id: "run",
      label: "Run current query",
      detail: "Ctrl + Enter",
      run: () => void execute(),
    },
    {
      id: "new",
      label: "New SQL query",
      detail: "Open a fresh editor",
      run: () => newTab(),
    },
    {
      id: "connect",
      label: "New database connection",
      detail: "PostgreSQL, MySQL, MariaDB, or SQLite · local and remote",
      run: () => setShowConnect(true),
    },
    ...(connection?.connected
      ? [
          {
            id: "disconnect",
            label: "Disconnect active connection",
            detail: connection.name,
            run: () => void disconnectActive(),
          },
        ]
      : []),
    {
      id: "save",
      label: "Save current query",
      detail: "Keep it on this device",
      run: saveQuery,
    },
    { id: "format", label: "Format SQL", run: formatQuery },
    ...(tools.canDump
      ? [
          {
            id: "export-database",
            label: "Export database",
            detail: "Every table and row in one .sql file",
            run: tools.openExport,
          },
          {
            id: "import-database",
            label: "Import database dump",
            detail: "Run a .sql dump statement by statement",
            run: () => void tools.openImport(),
          },
        ]
      : []),
    ...(tools.canDrop && tables.length
      ? [
          {
            id: "drop-all-tables",
            label: "Drop all tables",
            detail: connection?.name,
            run: tools.openDropAll,
          },
        ]
      : []),
    ...tables.map((t) => ({
      id: `table-${t.name}`,
      label: `Open ${t.name}`,
      detail: `Table · ${t.columns.length} columns`,
      run: () => tableQuery(t),
    })),
    ...saved.map((s) => ({
      id: s.id,
      label: s.name,
      detail: "Saved query",
      run: () => newTab(s.sql, s.name),
    })),
  ];
  return (
    <div
      data-query-running={running}
      className={`app astral-studio ${splitLayout ? "split-layout" : "stacked-layout"} ${sidebarOpen ? "" : "sidebar-collapsed"} ${inspectorOpen ? "" : "inspector-collapsed"}`}
    >
      <PageLoader />
      {showGuide && (
        <ConnectionGuideDialog onClose={() => setShowGuide(false)} />
      )}
      <WorkspaceContextMenu
        onNew={() => newTab()}
        onImport={() => void openSql()}
        onRefresh={() => {
          if (!busyRef.current && connection?.connected)
            void loadConnection(connectionId);
        }}
        onConnections={() => setShowConnections(true)}
      />
      <NavigationRail
        onHelp={() => setShowGuide(true)}
        view={view}
        onView={setView}
        onConnections={() => setShowConnections(true)}
        onNew={() => newTab()}
        onSearch={() => setShowPalette(true)}
      />
      <Header
        onSearch={() => setShowPalette(true)}
        onToggleSidebar={() => setSidebarOpen((s) => !s)}
      />
      <div className="app-body">
        <Sidebar
          connections={connections}
          activeConnection={connectionId}
          onConnection={(id) => void selectConnection(id)}
          onAdd={() => setShowConnect(true)}
          tables={tables}
          onTable={tableQuery}
          search={tableSearch}
          onSearch={setTableSearch}
          view={view}
          onView={setView}
          savedCount={saved.length}
          onImport={openSQLite}
          onImportSql={openSql}
          canDrop={tools.canDrop}
          canDump={tools.canDump}
          onDropTable={tools.openDrop}
          onDropAll={tools.openDropAll}
          onExportDatabase={tools.openExport}
          onImportDatabase={() => void tools.openImport()}
        />
        <main className="workspace">
          <div className="workspace-heading">
            <div className="heading-aurora">
              <AstralWaveCanvas intensity={0.62} />
            </div>
            <div className="workspace-eyebrow">
              <span className="eyebrow-line" /> WORKSPACE{" "}
              <span className="workspace-breadcrumb">
                / {connection?.name ?? "Your databases"}
              </span>
            </div>
            <div className="workspace-title-row">
              <div>
                <h1>
                  {view === "database"
                    ? "Query studio"
                    : view === "saved"
                      ? "Your query library"
                      : "Activity log"}
                  <span>.</span>
                </h1>
                <p>
                  {connection?.host || "On your device"} <span>·</span>{" "}
                  {tables.length} tables <span>·</span>{" "}
                  {DRIVER_LABELS[connection?.driver ?? "sqlite"]}
                </p>
              </div>
              <div className="studio-actions">
                <button
                  className="icon-button"
                  aria-label="Refresh schema"
                  title="Refresh schema"
                  disabled={loading || running || !connection?.connected}
                  onClick={() => void loadConnection(connectionId)}
                >
                  <RefreshCw size={17} />
                </button>
                <button
                  className="icon-button layout-toggle"
                  aria-label={
                    splitLayout
                      ? "Stack editor and results"
                      : "Place editor and results side by side"
                  }
                  title="Change workspace layout"
                  aria-pressed={splitLayout}
                  onClick={() => {
                    setSplitLayout(!splitLayout);
                    localStorage.setItem(
                      "astral-split-layout",
                      JSON.stringify(!splitLayout),
                    );
                  }}
                >
                  {splitLayout ? (
                    <PanelTop size={18} />
                  ) : (
                    <Columns2 size={18} />
                  )}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setShowConnections(true)}
                >
                  <Plus size={15} />
                  Connections
                </button>
              </div>
            </div>
          </div>
          <div
            className={`workbench ${view !== "database" ? "library-workbench" : ""}`}
          >
            <Tabs
              tabs={tabs}
              activeId={current.id}
              onSelect={(id) => {
                setActiveTab(id);
                setView("database");
              }}
              onAdd={() => newTab()}
              onClose={closeTab}
            />
            {view !== "database" ? (
              <section className="library-view">
                <div className="library-title">
                  <div>
                    <h2>
                      {view === "saved" ? "Saved queries" : "Query history"}
                    </h2>
                    <p>
                      {view === "saved"
                        ? "Good queries deserve a second run."
                        : "Your last 100 queries, stored on this device."}
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => setView("database")}
                  >
                    Back to editor <ArrowRight size={14} />
                  </button>
                </div>
                {(view === "saved" ? saved : history).length === 0 ? (
                  <div className="empty-state">
                    <Star size={28} />
                    <h3>
                      {view === "saved"
                        ? "Your collection starts here."
                        : "A fresh start."}
                    </h3>
                    <p>
                      {view === "saved"
                        ? "Save your current query with Ctrl + S."
                        : "Run a query to see it here."}
                    </p>
                  </div>
                ) : view === "saved" ? (
                  saved.map((s) => (
                    <article className="query-card" key={s.id}>
                      <FileCode2 size={18} />
                      <button onClick={() => newTab(s.sql, s.name)}>
                        <strong>{s.name}</strong>
                        <code>{s.sql}</code>
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Remove saved query ${s.name}`}
                        onClick={() =>
                          setSaved((x) => x.filter((q) => q.id !== s.id))
                        }
                      >
                        <X size={16} />
                      </button>
                    </article>
                  ))
                ) : (
                  history.map((h) => (
                    <article className="query-card" key={h.id}>
                      <History size={18} />
                      <button onClick={() => newTab(h.sql, "From history")}>
                        <strong>
                          {new Date(h.time).toLocaleString()}{" "}
                          <span>
                            {h.error
                              ? "Failed"
                              : `${h.rows} rows · ${h.elapsed.toFixed(1)} ms`}
                          </span>
                        </strong>
                        <code>{h.sql}</code>
                        {h.error && (
                          <small className="error-text">{h.error}</small>
                        )}
                      </button>
                    </article>
                  ))
                )}
              </section>
            ) : (
              <>
                <div className="editor-toolbar">
                  <div className="editor-context">
                    <Database size={14} />
                    <select
                      aria-label="Active connection"
                      value={connectionId}
                      onChange={(e) => void selectConnection(e.target.value)}
                      disabled={running || !connections.length}
                    >
                      {connections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span className="toolbar-divider" />
                    <span className="schema-name">
                      {selectedTable?.schema || "main"}
                    </span>
                    <ChevronDown size={12} />
                  </div>
                  <div className="editor-actions">
                    <button
                      className="icon-button"
                      title="Run SQL script"
                      aria-label="Run SQL script"
                      disabled={running || loading}
                      onClick={() => {
                        try {
                          setSqlImport({
                            name: current.name + ".sql",
                            sql: validateScriptText(current.sql),
                          });
                        } catch (error) {
                          setToast(
                            error instanceof Error
                              ? error.message
                              : String(error),
                          );
                        }
                      }}
                    >
                      <FileCode2 size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Format SQL"
                      aria-label="Format SQL"
                      onClick={formatQuery}
                    >
                      <AlignLeft size={17} />
                    </button>
                    <button
                      className="icon-button"
                      title="Save query · Ctrl+S"
                      aria-label="Save query"
                      onClick={saveQuery}
                    >
                      <Star size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Copy SQL"
                      aria-label="Copy SQL"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(current.sql)
                          .then(() => setToast("SQL copied."))
                          .catch(() =>
                            setToast(
                              "Clipboard unavailable. Select and copy SQL from the editor.",
                            ),
                          )
                      }
                    >
                      <Copy size={15} />
                    </button>
                    <span className="toolbar-divider" />
                    <button
                      className="run-button"
                      disabled={loading}
                      onClick={() =>
                        running
                          ? void cancelQuery(queryId.current).catch((e) =>
                              setError(String(e)),
                            )
                          : void execute()
                      }
                    >
                      {running ? (
                        <Square size={12} />
                      ) : (
                        <Play size={13} fill="currentColor" />
                      )}
                      {running ? "Stop query" : "Run query"}
                      <kbd>⌘ ↵</kbd>
                    </button>
                  </div>
                </div>
                <div className="editor-container">
                  <SqlEditor
                    value={current.sql}
                    onChange={updateSql}
                    onRun={(selection) => void execute(selection)}
                    schema={tables}
                    driver={connection?.driver || "sqlite"}
                  />
                  <div className="editor-watermark">
                    <Sparkles size={25} />
                  </div>
                </div>
                <div className="editor-footer">
                  <div>
                    <span className="sky-dot" />
                    {DRIVER_LABELS[connection?.driver ?? "sqlite"]}
                    <span className="muted-separator">/</span>UTF-8
                  </div>
                  <div>
                    <span>{current.sql.split("\n").length} lines</span>
                    <span className="muted-separator">/</span>
                    <span>Changes run immediately</span>
                    <ShieldCheck size={12} />
                  </div>
                </div>
                <div className="splitter">
                  <span />
                </div>
                <div className="results-toolbar">
                  <div className="result-tabs">
                    <button
                      className={resultView === "data" ? "active" : ""}
                      onClick={() => setResultView("data")}
                    >
                      <Table2 size={15} />
                      Results{result && <span>{result.rows.length}</span>}
                    </button>
                    <button
                      className={resultView === "structure" ? "active" : ""}
                      onClick={() => setResultView("structure")}
                    >
                      <Braces size={15} />
                      Structure
                    </button>
                    <button
                      className={resultView === "relations" ? "active" : ""}
                      onClick={() => setResultView("relations")}
                    >
                      <GitBranch size={15} />
                      Relations
                    </button>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Toggle table inspector"
                    title="Table inspector"
                    onClick={() => setInspectorOpen((s) => !s)}
                  >
                    <Info size={16} />
                  </button>
                </div>
                {error && (
                  <div className="query-error" role="alert">
                    <Info size={16} />
                    <div>
                      <strong>Query needs a second look</strong>
                      <pre>{error}</pre>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Dismiss error"
                      onClick={dismissError}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                <div className="results-content">
                  {resultView === "data" ? (
                    <>
                      <div className="result-controls">
                        <label className="row-filter">
                          <Filter size={14} />
                          <input
                            value={querySearch}
                            onChange={(e) => setQuerySearch(e.target.value)}
                            placeholder="Filter results…"
                            aria-label="Filter result rows"
                          />
                        </label>
                        <div>
                          <label className="row-limit">
                            Limit
                            <select
                              aria-label="Maximum query rows"
                              value={maxRows}
                              onChange={(e) =>
                                setMaxRows(Number(e.target.value))
                              }
                            >
                              <option value="100">100 rows</option>
                              <option value="1000">1,000 rows</option>
                              <option value="10000">10,000 rows</option>
                            </select>
                          </label>
                          <span className="toolbar-divider" />
                          <div className="export-container">
                            <button
                              className="export-button"
                              disabled={!result && (desktop || !connection)}
                              onClick={() => setExportOpen((x) => !x)}
                            >
                              <ArrowDownToLine size={14} />
                              Export
                              <ChevronDown size={12} />
                            </button>
                            {exportOpen && (
                              <div className="export-menu">
                                <button
                                  disabled={!result}
                                  onClick={() => exportResult("csv")}
                                >
                                  Export as CSV
                                </button>
                                <button
                                  disabled={!result}
                                  onClick={() => exportResult("json")}
                                >
                                  Export as JSON
                                </button>
                                {!desktop && (
                                  <button
                                    onClick={() => {
                                      setExportOpen(false);
                                      void downloadDatabase(connectionId).catch(
                                        (e) => setToast(String(e)),
                                      );
                                    }}
                                  >
                                    Backup SQLite file
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {loading ? (
                        <div className="empty-state">
                          <LoaderCircle className="spin" size={24} />
                          <p>Opening your local universe…</p>
                        </div>
                      ) : result ? (
                        <VirtualTable
                          key={contextKey}
                          result={result}
                          filter={querySearch}
                        />
                      ) : (
                        <div className="empty-state">
                          <Code2 size={28} />
                          <h3>Your next insight starts here.</h3>
                          <p>Write a query, then press Ctrl + Enter.</p>
                        </div>
                      )}
                    </>
                  ) : resultView === "relations" ? (
                    <RelationshipViewer tables={tables} />
                  ) : (
                    <div className="structure-list">
                      <div className="structure-head">
                        <h3>{selectedTable?.name || "Select a table"}</h3>
                        <span>
                          {selectedTable?.columns.length || 0} columns
                        </span>
                      </div>
                      {selectedTable?.columns.map((c) => (
                        <div className="structure-row" key={c.name}>
                          {c.primaryKey ? (
                            <KeyRound size={14} />
                          ) : (
                            <Rows3 size={14} />
                          )}
                          <strong>{c.name}</strong>
                          <code>{c.dataType}</code>
                          <span>
                            {c.primaryKey
                              ? "PRIMARY KEY"
                              : c.nullable
                                ? "NULLABLE"
                                : "NOT NULL"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="results-footer">
                  <div>
                    {running ? (
                      <LoaderCircle className="spin" size={13} />
                    ) : (
                      <CheckCircle2 size={13} />
                    )}
                    <span>
                      {running
                        ? "Query running…"
                        : error
                          ? "Last query failed"
                          : result
                            ? "Query completed"
                            : "Ready when you are"}
                    </span>
                    {result && !running && (
                      <>
                        <span className="muted-separator">·</span>
                        <span>{result.elapsedMs.toFixed(1)} ms</span>
                      </>
                    )}
                  </div>
                  <div>
                    {result?.truncated && (
                      <span className="truncate-note">Row limit reached</span>
                    )}
                    <span>{result?.rows.length || 0} rows</span>
                    <span className="muted-separator">·</span>
                    <span>{result?.columns.length || 0} columns</span>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="workspace-bottom">
            <span>
              <ShieldCheck size={13} />
              Your queries never pass through our servers.
            </span>
            <button onClick={() => setShowPalette(true)}>
              Find your flow <kbd>⌘ K</kbd>
            </button>
          </div>
        </main>
        <aside className="inspector">
          <div className="inspector-title">
            <span>TABLE INSPECTOR</span>
            <button
              className="icon-button"
              aria-label="Close table inspector"
              onClick={() => setInspectorOpen(false)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="table-emblem">
            <Table2 size={25} />
            <span className="emblem-star">✦</span>
          </div>
          <h2>{selectedTable?.name || "Your schema"}</h2>
          <p className="inspector-subtitle">
            {selectedTable?.schema || "main"}
            <span>/</span>Table
          </p>
          <div className="inspector-stats">
            <div>
              <span>Columns</span>
              <strong>{selectedTable?.columns.length || "—"}</strong>
            </div>
            <div>
              <span>Primary keys</span>
              <strong>
                {selectedTable?.columns.filter((c) => c.primaryKey).length ||
                  "—"}
              </strong>
            </div>
          </div>
          <div className="inspector-section-title">
            COLUMNS <span>{selectedTable?.columns.length || 0}</span>
          </div>
          <div className="inspector-columns">
            {selectedTable?.columns.map((c) => (
              <div key={c.name}>
                <span className={c.primaryKey ? "key-icon" : "column-icon"}>
                  {c.primaryKey ? (
                    <KeyRound size={13} />
                  ) : c.dataType.toLowerCase().includes("int") ? (
                    <span>#</span>
                  ) : (
                    <span>T</span>
                  )}
                </span>
                <span>{c.name}</span>
                <code>{c.dataType.toLowerCase()}</code>
              </div>
            ))}
          </div>
          <div className="inspector-section-title">
            RELATIONSHIPS <GitBranch size={13} />
          </div>
          <div className="relationship-summary">
            {selectedTable?.foreignKeys.length ? (
              selectedTable.foreignKeys.map((f) => (
                <div key={f.column}>
                  <GitBranch size={14} />
                  <span>
                    {f.column}
                    <small>
                      → {f.referencedTable}.{f.referencedColumn}
                    </small>
                  </span>
                </div>
              ))
            ) : (
              <p>
                No outgoing foreign keys.
                <br />
                <span>View all links in Relations.</span>
              </p>
            )}
          </div>
          <button
            className="inspect-button"
            onClick={() => {
              setResultView("structure");
              setView("database");
            }}
          >
            View table structure
            <ArrowRight size={14} />
          </button>
          <div className="keyboard-card">
            <span className="tiny-star">✦</span>
            <h3>
              Less clicking.
              <br />
              More creating.
            </h3>
            <p>A few shortcuts to stay in orbit.</p>
            <div>
              <span>Run query</span>
              <kbd>Ctrl ↵</kbd>
            </div>
            <div>
              <span>Command palette</span>
              <kbd>Ctrl K</kbd>
            </div>
            <div>
              <span>Save query</span>
              <kbd>Ctrl S</kbd>
            </div>
          </div>
          <div className="inspector-bottom">
            <span className="status-dot" />
            All systems local
          </div>
        </aside>
      </div>
      <footer className="statusbar">
        <div>
          <span className="status-dot" />
          {connection?.connected
            ? "Connected"
            : connection
              ? "Disconnected"
              : loading
                ? "Initializing"
                : "No connection"}
          <span className="statusbar-divider" />
          {connection?.name || "Local workspace"}
          <span className="driver-badge">
            {connection?.driver.toUpperCase() || "SQLITE"}
          </span>
        </div>
        <div>
          <ShieldCheck size={12} />
          {desktop ? "Native Rust runtime" : "Local SQLite · Browser preview"}
          <span className="statusbar-divider" />
          <span>v0.1.5</span>
          <Sparkles size={12} />
        </div>
      </footer>
      <input
        ref={fileInput}
        hidden
        type="file"
        accept=".sqlite,.sqlite3,.db"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={sqlFileInput}
        hidden
        type="file"
        accept=".sql"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          try {
            if (file.size > MAX_SCRIPT_BYTES)
              throw new Error("SQL scripts must be 16 MiB or smaller.");
            const sql = new TextDecoder("utf-8", { fatal: true }).decode(
              await file.arrayBuffer(),
            );
            setSqlImport({ name: file.name, sql: validateScriptText(sql) });
          } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
          }
        }}
      />
      {sqlImport && (
        <SqlImportDialog
          file={sqlImport}
          connection={connection}
          onClose={() => setSqlImport(null)}
          onOpen={() => {
            newTab(sqlImport.sql, sqlImport.name);
            setSqlImport(null);
          }}
          onImport={() => execute(sqlImport.sql, undefined, true)}
          onCancel={() => void cancelQuery(queryId.current)}
        />
      )}
      {tools.dialogs}
      {showConnect && (
        <ConnectionDialog
          onHelp={() => setShowGuide(true)}
          initial={editingProfile}
          desktop={Boolean(desktop)}
          onClose={() => {
            setShowConnect(false);
            setEditingProfile(undefined);
          }}
          onConnect={connect}
        />
      )}{" "}
      {showConnections && (
        <ConnectionManager
          connections={connections}
          busy={running || loading}
          onClose={() => setShowConnections(false)}
          onNew={() => {
            setShowConnections(false);
            setEditingProfile(undefined);
            setShowConnect(true);
          }}
          onSelect={(id) => {
            setShowConnections(false);
            setView("database");
            void selectConnection(id);
          }}
          onEdit={(id) => {
            const profile = profiles.find((p) => p.id === id);
            if (profile) {
              setEditingProfile(profile);
              setShowConnections(false);
              setShowConnect(true);
            } else {
              setToast(
                "Browser SQLite imports reopen directly from this device.",
              );
            }
          }}
          onDisconnect={(id) => void disconnectActive(id)}
        />
      )}
      {showPalette && (
        <CommandPalette
          actions={actions}
          onClose={() => setShowPalette(false)}
        />
      )}{" "}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
