import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  KeyRound,
  Link2,
  Table2,
  Trash2,
} from "lucide-react";
import type { TableInfo } from "../../lib/types";

export interface SchemaTreeProps {
  tables: TableInfo[];
  onSelect: (table: TableInfo) => void;
  onDrop?: (table: TableInfo) => void;
  filter?: string;
}

export function SchemaTree({
  tables,
  onSelect,
  onDrop,
  filter = "",
}: SchemaTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string>("users");
  const search = filter.trim().toLowerCase();
  const filtered = tables.filter(
    (table) =>
      table.name.toLowerCase().includes(search) ||
      table.columns.some((column) =>
        column.name.toLowerCase().includes(search),
      ),
  );

  function toggle(key: string): void {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="schema-tree" aria-label="Database tables">
      {filtered.length === 0 && (
        <p className="schema-empty">
          {tables.length ? "No matching tables" : "No tables yet"}
        </p>
      )}
      {filtered.map((table) => {
        const key = `${table.schema ?? ""}.${table.name}`;
        const isOpen = expanded.has(key);
        return (
          <div className="schema-table" key={key}>
            <div
              className={`schema-table-row${selected === table.name ? " is-active" : ""}`}
            >
              <button
                className="schema-expand"
                aria-label={`${isOpen ? "Collapse" : "Expand"} ${table.name}`}
                aria-expanded={isOpen}
                onClick={() => toggle(key)}
              >
                {isOpen ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
              </button>
              <button
                className="schema-table-select"
                onClick={() => {
                  setSelected(table.name);
                  onSelect(table);
                }}
                title={`Query ${table.name}`}
              >
                <Table2 size={14} />
                <span>{table.name}</span>
                <span className="schema-column-count">
                  {table.columns.length}
                </span>
              </button>
              {onDrop && (
                <button
                  className="schema-drop"
                  aria-label={`Drop ${table.name}`}
                  title={`Drop ${table.name}`}
                  onClick={() => onDrop(table)}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            {isOpen && (
              <ul
                className="schema-columns"
                aria-label={`${table.name} columns`}
              >
                {table.columns.map((column) => {
                  const isForeign = table.foreignKeys.some(
                    (foreign) => foreign.column === column.name,
                  );
                  return (
                    <li
                      className="schema-column"
                      key={column.name}
                      title={`${column.dataType}${column.primaryKey ? " · Primary key" : ""}${isForeign ? " · Foreign key" : ""}${column.nullable ? " · Nullable" : " · Required"}`}
                    >
                      {column.primaryKey ? (
                        <KeyRound size={11} className="primary-key" />
                      ) : isForeign ? (
                        <Link2 size={11} />
                      ) : (
                        <Columns3 size={11} />
                      )}
                      <span>{column.name}</span>
                      <small>{column.dataType.toLowerCase()}</small>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default SchemaTree;
