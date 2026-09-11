import { useEffect, useRef, useState } from "react";

export default function WorkspaceContextMenu({
  onNew,
  onImport,
  onRefresh,
  onConnections,
}: {
  onNew: () => void;
  onImport: () => void;
  onRefresh: () => void;
  onConnections: () => void;
}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const open = (event: MouseEvent) => {
      if (
        (event.target as Element).closest(
          "input,textarea,[contenteditable=true],dialog",
        )
      )
        return;
      event.preventDefault();
      setPosition({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 232)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 202)),
      });
    };
    const close = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) setPosition(null);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPosition(null);
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
    if (position) ref.current?.querySelector("button")?.focus();
  }, [position]);
  if (!position) return null;
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Workspace actions"
      className="workspace-context-menu"
      style={{ left: position.x, top: position.y }}
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
      {(
        [
          ["New query", onNew],
          ["Open SQL file…", onImport],
          ["Refresh schema", onRefresh],
          ["Connections…", onConnections],
        ] as const
      ).map(([label, action]) => (
        <button
          role="menuitem"
          key={label}
          onClick={() => {
            setPosition(null);
            action();
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
