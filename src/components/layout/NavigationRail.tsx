import {
  BookOpen,
  Database,
  History,
  Plus,
  Search,
  SquareTerminal,
  Star,
} from "lucide-react";
import type { SidebarView } from "./Sidebar";
import logo from "../../assets/logo.svg";

export function NavigationRail({
  view,
  onView,
  onConnections,
  onNew,
  onSearch,
  onHelp,
}: {
  view: SidebarView;
  onView: (view: SidebarView) => void;
  onConnections: () => void;
  onNew: () => void;
  onSearch: () => void;
  onHelp: () => void;
}) {
  return (
    <nav className="navigation-rail" aria-label="Main navigation">
      <img src={logo} alt="Astral" className="rail-logo" />
      <button
        className={view === "database" ? "active" : ""}
        onClick={() => onView("database")}
        title="Query studio"
        aria-label="Query studio"
      >
        <SquareTerminal size={21} />
        <span>Studio</span>
      </button>
      <button
        onClick={onConnections}
        title="Manage connections"
        aria-label="Manage connections"
      >
        <Database size={21} />
        <span>Connect</span>
      </button>
      <button
        className={view === "saved" ? "active" : ""}
        onClick={() => onView("saved")}
        title="Saved queries"
        aria-label="Saved queries"
      >
        <Star size={20} />
        <span>Library</span>
      </button>
      <button
        className={view === "history" ? "active" : ""}
        onClick={() => onView("history")}
        title="Query history"
        aria-label="Query history"
      >
        <History size={21} />
        <span>History</span>
      </button>
      <div className="rail-spacer" />
      <button
        onClick={onHelp}
        title="Remote connection guide"
        aria-label="Remote connection guide"
      >
        <BookOpen size={20} />
        <span>Learn</span>
      </button>
      <button onClick={onNew} title="New query" aria-label="Create query">
        <Plus size={21} />
      </button>
      <button
        onClick={onSearch}
        title="Search commands"
        aria-label="Open command menu"
      >
        <Search size={20} />
      </button>
      <div className="rail-local" title="Local workspace">
        <span />
      </div>
    </nav>
  );
}
