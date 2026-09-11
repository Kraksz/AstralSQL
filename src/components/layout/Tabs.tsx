import { Plus, SquareTerminal, X } from "lucide-react";
export interface QueryTab {
  id: string;
  name: string;
  sql: string;
}
export function Tabs({
  tabs,
  activeId,
  onSelect,
  onAdd,
  onClose,
}: {
  tabs: QueryTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
}) {
  return (
    <div className="query-tabs" role="tablist" aria-label="Query editors">
      {tabs.map((tab) => (
        <div
          className={`query-tab ${tab.id === activeId ? "active" : ""}`}
          key={tab.id}
        >
          <button
            role="tab"
            aria-selected={tab.id === activeId}
            onClick={() => onSelect(tab.id)}
          >
            <SquareTerminal size={15} />
            {tab.name}
            <span className="tab-dot" />
          </button>
          <button
            className="tab-close"
            aria-label={`Close ${tab.name}`}
            onClick={() => onClose(tab.id)}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button className="icon-button" onClick={onAdd} aria-label="New query">
        <Plus size={16} />
      </button>
      <span className="tab-spacer" />
      <span className="tab-hint">A clearer view of your data.</span>
    </div>
  );
}
