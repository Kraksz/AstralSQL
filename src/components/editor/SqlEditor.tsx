import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { MySQL, PostgreSQL, SQLite, sql } from "@codemirror/lang-sql";
import { EditorView, keymap } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Driver, TableInfo } from "../../lib/types";

export interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: (selection?: string) => void;
  schema?: TableInfo[];
  driver?: Driver;
}

const astralTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "#d6e4f1",
      backgroundColor: "transparent",
      fontSize: "13px",
    },
    ".cm-content": {
      padding: "19px 0",
      fontFamily: '"Azeret Mono", "JetBrains Mono", monospace',
      caretColor: "#7dd3fc",
    },
    ".cm-line": { padding: "0 20px", lineHeight: "1.9" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "#435168",
      border: "none",
      padding: "19px 0 19px 12px",
    },
    ".cm-gutterElement": { lineHeight: "1.9", paddingRight: "8px" },
    ".cm-activeLineGutter": {
      color: "#bae6fd",
      backgroundColor: "transparent",
    },
    ".cm-activeLine": { backgroundColor: "rgba(56,189,248,.035)" },
    ".cm-cursor": { borderLeftColor: "#7dd3fc" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      { backgroundColor: "#16364a !important" },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: '"Azeret Mono", "JetBrains Mono", monospace',
    },
    ".cm-tooltip": {
      backgroundColor: "#090e1a",
      borderColor: "rgba(56,189,248,.2)",
      color: "#cbd5e1",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "#16364a",
      color: "#bae6fd",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#131d31",
      border: "none",
      color: "#7dd3fc",
    },
    ".cm-matchingBracket": {
      backgroundColor: "#16364a",
      outline: "1px solid #0ea5e9",
    },
  },
  { dark: true },
);

const astralSyntax = HighlightStyle.define([
  { tag: tags.keyword, color: "#7dd3fc" },
  { tag: tags.comment, color: "#536b83", fontStyle: "italic" },
  { tag: tags.string, color: "#86d5cf" },
  { tag: tags.number, color: "#f1c78f" },
  { tag: tags.operator, color: "#94a3b8" },
  { tag: tags.name, color: "#d6e4f1" },
  { tag: tags.typeName, color: "#38bdf8" },
  { tag: tags.special(tags.string), color: "#bae6fd" },
  { tag: tags.punctuation, color: "#94a3b8" },
]);

export function SqlEditor({
  value,
  onChange,
  onRun,
  schema = [],
  driver = "sqlite",
}: SqlEditorProps) {
  const editorRef = useRef<EditorView | undefined>(undefined);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [clipboardError, setClipboardError] = useState("");
  useEffect(() => {
    const close = () => setMenu(null);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, []);
  async function editAction(action: "copy" | "cut" | "paste" | "select") {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.state.selection.main;
    try {
      if (action === "select")
        editor.dispatch({
          selection: { anchor: 0, head: editor.state.doc.length },
        });
      else if (action === "paste")
        editor.dispatch(
          editor.state.replaceSelection(await navigator.clipboard.readText()),
        );
      else {
        await navigator.clipboard.writeText(
          editor.state.sliceDoc(selection.from, selection.to),
        );
        if (action === "cut")
          editor.dispatch(editor.state.replaceSelection(""));
      }
      setClipboardError("");
    } catch {
      setClipboardError(
        "Clipboard access unavailable. Use Ctrl+C, Ctrl+X or Ctrl+V in the editor.",
      );
    }
    setMenu(null);
    editor.focus();
  }
  const extensions = useMemo(
    () => [
      sql({
        dialect:
          driver === "postgres"
            ? PostgreSQL
            : driver === "mysql" || driver === "mariadb"
              ? MySQL
              : SQLite,
        schema: Object.fromEntries(
          schema.map((table) => [
            table.name,
            table.columns.map((column) => column.name),
          ]),
        ),
        upperCaseKeywords: true,
      }),
      astralTheme,
      syntaxHighlighting(astralSyntax),
      EditorView.contentAttributes.of({
        "aria-label": "SQL query editor",
        spellcheck: "false",
      }),
      keymap.of([
        {
          key: "Mod-Enter",
          run: (view) => {
            const selection = view.state.selection.main;
            onRun(
              selection.empty
                ? undefined
                : view.state.sliceDoc(selection.from, selection.to),
            );
            return true;
          },
        },
      ]),
    ],
    [schema, driver, onRun],
  );

  return (
    <div
      className="sql-editor"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setMenu({
          x: Math.max(8, Math.min(event.clientX, window.innerWidth - 232)),
          y: Math.max(8, Math.min(event.clientY, window.innerHeight - 210)),
        });
      }}
    >
      {clipboardError && <span role="status">{clipboardError}</span>}
      {menu && (
        <div
          role="menu"
          aria-label="SQL editor actions"
          className="workspace-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => {
            event.stopPropagation();
            event.preventDefault();
          }}
        >
          {(
            [
              ["Copy", "copy"],
              ["Cut", "cut"],
              ["Paste", "paste"],
              ["Select all", "select"],
            ] as const
          ).map(([label, action]) => (
            <button
              role="menuitem"
              key={action}
              onClick={() => void editAction(action)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <CodeMirror
        onCreateEditor={(editor) => {
          editorRef.current = editor;
        }}
        value={value}
        height="100%"
        theme="none"
        extensions={extensions}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          autocompletion: true,
          bracketMatching: true,
        }}
      />
    </div>
  );
}

export default SqlEditor;
