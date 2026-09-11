import { Database, Download, Terminal, ArrowUpRight, ShieldCheck } from "lucide-react";
import DocArticle from "@/components/docs/DocArticle";
export default function DocsHome() {
  return <DocArticle title="A clear path to your data." description="Welcome to the Astral handbook. Start with a local database, or bring your own server into the workspace." sections={[{ id: "start", title: "Choose a starting point" }, { id: "model", title: "How Astral connects" }, { id: "first-session", title: "Your first session" }]} next={{ href: "/docs/install", title: "Installation" }}>
    <section id="start"><h2>Choose a starting point</h2><div className="docs-start-grid">
      <a href="/docs/install"><Download /><h3>Install Astral</h3><p>Get the Windows beta or build on Linux and macOS.</p><ArrowUpRight size={18} /></a>
      <a href="/docs/querying"><Terminal /><h3>Write your first query</h3><p>Open SQLite, explore tables, and export your results.</p><ArrowUpRight size={18} /></a>
      <a href="/docs/connections"><Database /><h3>Connect your server</h3><p>Use MySQL, MariaDB, or a database behind phpMyAdmin.</p><ArrowUpRight size={18} /></a>
    </div></section>
    <section id="model"><h2>How Astral connects</h2><p>The desktop app opens database connections from your computer through its Rust core. It supports SQLite, PostgreSQL, MySQL, and MariaDB. Remote servers still need to allow your computer to connect.</p><div className="docs-note"><ShieldCheck size={20} /><p>The browser playground runs SQLite on your device. It cannot connect directly to a remote MySQL or PostgreSQL TCP port. Use the desktop app for those connections.</p></div></section>
    <section id="first-session"><h2>Your first session</h2><ol><li>Install the desktop beta, or open the <a href="/playground/index.html">SQLite playground</a>.</li><li>Add a connection or open a SQLite database file.</li><li>Run <code>SELECT 1;</code> to confirm the session works.</li><li>Browse a table, open a query tab, and start exploring.</li></ol><p>Need an answer quickly? Start with the <a href="/docs/faq">FAQ</a> or the <a href="/docs/connections#troubleshooting">connection troubleshooting guide</a>.</p></section>
  </DocArticle>;
}
