import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import DocsNavigation from "@/components/docs/DocsNavigation";
import SiteNavigation from "@/components/SiteNavigation";
import "./docs.css";

export const metadata: Metadata = { title: "Documentation — Astral SQL", description: "Install Astral SQL, run your first query, connect to remote databases, and find answers in the Astral handbook." };
export default function DocsLayout({ children }: { children: ReactNode }) {
  return <div className="docs-site">
    <a className="docs-skip" href="#docs-content">Skip to content</a>
    <header className="site-header"><a href="/" className="site-brand"><img src="/logo.svg" alt="" />astral<span>SQL / DOCS</span></a><SiteNavigation guide /><a className="header-cta" href="/playground/index.html">Open playground <ArrowUpRight size={15} /></a></header>
    <div className="docs-shell"><DocsNavigation /><main id="docs-content">{children}</main></div>
  </div>;
}
