import { useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Hash,
  KeyRound,
  Text,
  CalendarDays,
  Trash2,
} from "lucide-react";
import type { QueryResult } from "../../lib/types";
import { formatCell } from "./exportUtils";

export interface VirtualTableProps {
  result: QueryResult;
  filter?: string;
  /** Receives the row's index in `result.rows`; omit when rows cannot be deleted. */
  onDeleteRow?: (rowIndex: number) => void;
}

function columnWidth(name: string): number {
  if (name === "id") return 78;
  if (name.includes("email")) return 270;
  if (name.endsWith("_at")) return 196;
  if (name === "name") return 200;
  if (name === "country") return 180;
  if (name === "plan" || name === "status") return 124;
  return Math.max(142, name.length * 9 + 56);
}

export function VirtualTable({
  result,
  filter = "",
  onDeleteRow,
}: VirtualTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tableId = useId();
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [sort, setSort] = useState<{
    index: number;
    descending: boolean;
  } | null>(null);
  const rows = useMemo(() => {
    const search = filter.trim().toLowerCase();
    const matching = result.rows
      .map((cells, index) => ({ cells, index }))
      .filter(
        (row) =>
          !search ||
          row.cells.some((cell) =>
            formatCell(cell).toLowerCase().includes(search),
          ),
      );
    if (sort)
      matching.sort((left, right) => {
        const a = left.cells[sort.index];
        const b = right.cells[sort.index];
        const compare =
          a === b
            ? 0
            : a == null
              ? -1
              : b == null
                ? 1
                : typeof a === "number" && typeof b === "number"
                  ? a - b
                  : formatCell(a).localeCompare(formatCell(b), undefined, {
                      numeric: true,
                    });
        return sort.descending ? -compare : compare;
      });
    return matching;
  }, [result.rows, filter, sort]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 12,
  });
  const widths = result.columns.map((column) => columnWidth(column.name));
  const minWidth = widths.reduce((sum, width) => sum + width, 48);
  const gridTemplateColumns = `48px ${widths.map((width) => `minmax(${width}px, 1fr)`).join(" ")}`;

  async function copyCell(value: unknown, id: string) {
    try {
      await navigator.clipboard.writeText(
        value === null ? "" : formatCell(value),
      );
      setCopiedCell(id);
      setTimeout(
        () => setCopiedCell((current) => (current === id ? null : current)),
        1200,
      );
    } catch {
      /* Copy may be unavailable on insecure origins; the cell remains selectable. */
    }
  }

  if (!result.columns.length)
    return (
      <div className="grid-empty" role="status">
        <Check size={22} />
        <strong>Statement completed</strong>
        <span>
          {result.rowsAffected.toLocaleString()} row
          {result.rowsAffected === 1 ? "" : "s"} affected
        </span>
      </div>
    );

  return (
    <div
      className="virtual-table"
      ref={scrollRef}
      role="table"
      aria-label="Query results"
      aria-rowcount={rows.length + 1}
      aria-colcount={result.columns.length + 1}
    >
      <div
        className="data-grid-header"
        role="row"
        aria-rowindex={1}
        style={{ gridTemplateColumns, minWidth }}
      >
        <div className="data-grid-cell row-index" role="columnheader">
          #
        </div>
        {result.columns.map((column, index) => {
          const Icon =
            column.name === "id"
              ? KeyRound
              : column.dataType.includes("INT") || column.dataType === "REAL"
                ? Hash
                : column.name.endsWith("_at")
                  ? CalendarDays
                  : Text;
          const SortIcon =
            sort?.index === index && !sort.descending ? ArrowUp : ArrowDown;
          const changeSort = () =>
            setSort((previous) =>
              previous?.index === index
                ? previous.descending
                  ? null
                  : { index, descending: true }
                : { index, descending: false },
            );
          return (
            <div
              className="data-grid-cell column-heading"
              role="columnheader"
              tabIndex={0}
              aria-sort={
                sort?.index === index
                  ? sort.descending
                    ? "descending"
                    : "ascending"
                  : "none"
              }
              key={`${column.name}-${index}`}
              title={`${column.name} · ${column.dataType} · Sort loaded rows`}
              onClick={changeSort}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  changeSort();
                }
              }}
            >
              <Icon size={12} />
              <span>{column.name}</span>
              <span className="column-data-type">
                {column.dataType === "UNKNOWN"
                  ? ""
                  : column.dataType.toLowerCase()}
              </span>
              <SortIcon size={10} className="column-sort-hint" />
            </div>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <div className="grid-empty" role="status">
          <strong>{filter ? "No matching rows" : "No rows returned"}</strong>
          <span>
            {filter
              ? "Try a different filter."
              : "Your statement ran successfully."}
          </span>
        </div>
      ) : (
        <div
          className="data-grid-body"
          role="rowgroup"
          style={{
            height: virtualizer.getTotalSize(),
            minWidth,
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <div
                className="data-grid-row"
                role="row"
                aria-rowindex={virtualRow.index + 2}
                data-row-index={row.index}
                key={row.index}
                style={{
                  gridTemplateColumns,
                  height: virtualRow.size,
                  position: "absolute",
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="data-grid-cell row-index" role="cell">
                  <span className="row-number">{row.index + 1}</span>
                  {onDeleteRow && (
                    <button
                      className="row-delete"
                      aria-label={`Delete row ${row.index + 1}`}
                      title="Delete this row"
                      onClick={() => onDeleteRow(row.index)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                {row.cells.map((value, columnIndex) => {
                  const column = result.columns[columnIndex];
                  const id = `${row.index}:${columnIndex}`;
                  const isNull = value === null || value === undefined;
                  const isBadge =
                    column.name === "plan" || column.name === "status";
                  return (
                    <div
                      key={columnIndex}
                      id={`${tableId}-${id}`}
                      role="cell"
                      tabIndex={
                        selectedCell === id ||
                        (!selectedCell &&
                          virtualRow.index === 0 &&
                          columnIndex === 0)
                          ? 0
                          : -1
                      }
                      aria-label={`${column.name}: ${formatCell(value)}`}
                      className={`data-grid-cell${isNull ? " is-null" : ""}${typeof value === "number" ? " is-number" : ""}${selectedCell === id ? " is-selected" : ""}`}
                      title={`${formatCell(value)} — double-click to copy`}
                      onClick={(event) => {
                        setSelectedCell(id);
                        event.currentTarget.focus();
                      }}
                      onDoubleClick={() => void copyCell(value, id)}
                      onKeyDown={(event) => {
                        if (
                          (event.metaKey || event.ctrlKey) &&
                          event.key === "c"
                        ) {
                          event.preventDefault();
                          void copyCell(value, id);
                          return;
                        }
                        const direction = {
                          ArrowDown: [1, 0],
                          ArrowUp: [-1, 0],
                          ArrowRight: [0, 1],
                          ArrowLeft: [0, -1],
                        }[event.key];
                        if (!direction) return;
                        event.preventDefault();
                        const nextRow = Math.min(
                          rows.length - 1,
                          Math.max(0, virtualRow.index + direction[0]),
                        );
                        const nextColumn = Math.min(
                          result.columns.length - 1,
                          Math.max(0, columnIndex + direction[1]),
                        );
                        const nextCell = `${rows[nextRow].index}:${nextColumn}`;
                        setSelectedCell(nextCell);
                        virtualizer.scrollToIndex(nextRow, { align: "auto" });
                        requestAnimationFrame(() =>
                          document
                            .getElementById(`${tableId}-${nextCell}`)
                            ?.focus({ preventScroll: true }),
                        );
                      }}
                    >
                      {copiedCell === id ? (
                        <span className="cell-copied">
                          <Check size={12} /> Copied
                        </span>
                      ) : (
                        <span
                          className={
                            isBadge
                              ? `cell-badge badge-${String(value)
                                  .toLowerCase()
                                  .replace(/[^a-z0-9]/g, "")}`
                              : undefined
                          }
                        >
                          {formatCell(value)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default VirtualTable;
