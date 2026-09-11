"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Search, ChevronDown, ArrowUpRight } from "lucide-react";

export const docPages = [
  { href: "/docs", title: "Welcome to Astral", group: "GET STARTED", keywords: "introduction overview quickstart" },
  { href: "/docs/install", title: "Installation", group: "GET STARTED", keywords: "Windows Linux macOS iOS download requirements" },
  { href: "/docs/querying", title: "Your first query", group: "WORK WITH DATA", keywords: "SQL SQLite import export results save" },
  { href: "/docs/connections", title: "Remote connections", group: "WORK WITH DATA", keywords: "phpMyAdmin MySQL MariaDB SSH TLS refused timeout password" },
  { href: "/docs/faq", title: "Frequently asked questions", group: "REFERENCE", keywords: "FAQ privacy free antivirus SmartScreen support" },
  { href: "/docs/source", title: "Source & contributing", group: "REFERENCE", keywords: "GitHub GitBook development build license" },
];

export default function DocsNavigation() {
  const path = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const results = docPages.filter(page => `${page.title} ${page.keywords}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <aside className="docs-sidebar">
    <button className="docs-mobile-toggle" aria-expanded={open} aria-controls="docs-sidebar-content" onClick={() => setOpen(!open)}><BookOpen size={17} /> Browse documentation <ChevronDown size={17} /></button>
    <div id="docs-sidebar-content" className="docs-sidebar-content" data-open={open}>
      <label className="docs-search"><Search size={16} /><input type="search" aria-label="Search documentation" placeholder="Find a guide…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <nav aria-label="Documentation">
        {results.map((page, i) => <div key={page.href}>
          {(i === 0 || results[i - 1].group !== page.group) && <p className="docs-nav-group">{page.group}</p>}
          <a href={page.href} aria-current={path === page.href ? "page" : undefined} onClick={() => { setOpen(false); setQuery(""); }}>{page.title}</a>
        </div>)}
        {results.length === 0 && <p className="docs-search-empty" role="status">No guide found. Try “SSH”, “import”, or “Windows”.</p>}
      </nav>
      <a className="docs-repo" href="https://github.com/Kraksz/AstralSQL" target="_blank" rel="noreferrer">Astral on GitHub <ArrowUpRight size={15} /></a>
    </div>
  </aside>;
}
