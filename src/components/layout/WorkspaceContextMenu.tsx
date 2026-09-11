import { useEffect, useRef, useState } from "react";

export default function WorkspaceContextMenu({
  onNew,
  onImport,
  onRefresh,
  onConnections,
  onDeleteRow,
}: {
  onNew: () => void;
  onImport: () => void;
  onRefresh: () => void;
  onConnections: () => void;
  /** Offered when the menu opens over a result row (`data-row-index`). */
  onDeleteRow?: (rowIndex: number) => void;
}) {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    row?: number;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const open = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest("input,textarea,[contenteditable=true],dialog"))
        return;
      event.preventDefault();
      const row =
        target.closest<HTMLElement>("[data-row-index]")?.dataset.rowIndex;
      setMenu({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 232)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 246)),
        row: row === undefined ? undefined : Number(row),
      });
    };
    const close = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) setMenu(null);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("contextmenu", open);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keys);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("contextmenu", open);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keys);
      window.removeEventListener("blur", close);
    };
  }, []);
  useEffect(() => {
    if (menu) ref.current?.querySelector("button")?.focus();
  }, [menu]);
  if (!menu) return null;
  const row = menu.row;
  const items: [string, () => void, boolean][] = [
    ...(row !== undefined && onDeleteRow
      ? [
          ["Delete row", () => onDeleteRow(row), true] as [
            string,
            () => void,
            boolean,
          ],
        ]
      : []),
    ["New query", onNew, false],
    ["Open SQL file…", onImport, false],
    ["Refresh schema", onRefresh, false],
    ["Connections…", onConnections, false],
  ];
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Workspace actions"
      className="workspace-context-menu"
      style={{ left: menu.x, top: menu.y }}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const buttons = [...e.currentTarget.querySelectorAll("button")];
          const i = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          buttons[
            (i + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
              buttons.length
          ]?.focus();
        }
      }}
    >
      {items.map(([label, action, danger]) => (
        <button
          role="menuitem"
          key={label}
          className={danger ? "is-danger" : undefined}
          onClick={() => {
            setMenu(null);
            action();
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
