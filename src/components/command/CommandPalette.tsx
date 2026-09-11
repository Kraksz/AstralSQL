import { useEffect, useRef, useState } from "react";
import { ArrowRight, Command, Search } from "lucide-react";
export interface PaletteAction {
  id: string;
  label: string;
  detail?: string;
  run: () => void;
}
export default function CommandPalette({
  actions,
  onClose,
}: {
  actions: PaletteAction[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = actions.filter((a) =>
    (a.label + " " + a.detail).toLowerCase().includes(search.toLowerCase()),
  );
  useEffect(() => {
    const last = document.activeElement as HTMLElement;
    ref.current?.querySelector("input")?.focus();
    return () => last?.focus();
  }, []);
  function run(i: number) {
    filtered[i]?.run();
    onClose();
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="command-palette"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelected((s) => Math.min(s + 1, filtered.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelected((s) => Math.max(0, s - 1));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            run(selected);
          }
          if (e.key === "Tab") {
            e.preventDefault();
            ref.current?.querySelector("input")?.focus();
          }
        }}
      >
        <div className="command-input">
          <Search size={20} />
          <input
            aria-label="Search commands"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(0);
            }}
            placeholder="Where would you like to go?"
          />
          <kbd>esc</kbd>
        </div>
        <div className="command-heading">YOUR WORKSPACE</div>
        <div className="command-items">
          {filtered.length ? (
            filtered.map((a, i) => (
              <button
                key={a.id}
                className={i === selected ? "selected" : ""}
                onClick={() => run(i)}
                onMouseEnter={() => setSelected(i)}
              >
                <Command size={16} />
                <span>
                  {a.label}
                  <small>{a.detail}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))
          ) : (
            <p>No matching commands.</p>
          )}
        </div>
        <footer>
          ↑ ↓ to navigate <span>↵ to select</span>
        </footer>
      </div>
    </div>
  );
}
