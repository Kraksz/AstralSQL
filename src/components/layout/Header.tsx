import {
  ArrowUpRight,
  Command,
  PanelLeft,
  Search,
  ShieldCheck,
} from "lucide-react";
import logo from "../../assets/logo.svg";
export function Header({
  onSearch,
  onToggleSidebar,
}: {
  onSearch: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="app-header">
      <a className="brand" href="#" aria-label="Astral SQL workspace">
        <img id="astral-header-logo" src={logo} alt="" />
        <span>
          astral<span className="brand-sql">SQL</span>
        </span>
        <span className="version">BETA</span>
      </a>
      <button
        className="icon-button sidebar-toggle"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
      >
        <PanelLeft size={17} />
      </button>
      <div className="header-path">
        Workspace <span>/</span> <strong>SQL editor</strong>
      </div>
      <button
        className="global-search"
        aria-label="Search commands"
        onClick={onSearch}
      >
        <Search size={15} />
        <span>Search or jump to…</span>
        <kbd>
          <Command size={11} /> K
        </kbd>
      </button>
      <div className="privacy-label">
        <ShieldCheck size={14} /> Local. Private. Yours.
      </div>
      <a
        className="website-link"
        href="https://astral-sql-celestial.kraksz.chatgpt.site"
        target="_blank"
        rel="noreferrer"
      >
        Meet Astral <ArrowUpRight size={14} />
      </a>
      <div className="avatar" aria-label="Local workspace">
        A
      </div>
    </header>
  );
}
