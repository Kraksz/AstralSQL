import SiteNavigation from "@/components/SiteNavigation";
import {
  GitFork as Github,
  Monitor,
  Laptop,
  Code2,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Database,
  HardDrive,
  Keyboard,
  LockKeyhole,
  Play,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import RevealMotion from "@/components/RevealMotion";
import AstralWaveCanvas from "@/components/canvas/AstralWaveCanvas";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
const rows = [
  ["01", "Olivia Bennett", "olivia.bennett@example.com", "Pro"],
  ["04", "Noah Williams", "noah.williams@example.com", "Pro"],
  ["06", "Elijah Park", "elijah.park@example.com", "Pro"],
];
export default function Home() {
  return (
    <main>
      <RevealMotion />
      <header className="site-header">
        <a href="#" className="site-brand">
          <img src="/logo.svg" alt="" />
          astral<span>SQL</span>
        </a>
        <SiteNavigation />
        <a className="header-cta" href="/playground/index.html">
          Open playground <ArrowUpRight size={15} />
        </a>
      </header>
      <section className="hero">
        <div className="hero-aurora">
          <AstralWaveCanvas intensity={1.05} />
        </div>
        <div className="hero-content">
          <div className="release-label">
            <span />
            THE ASTRAL WORKSPACE <i>DESKTOP BETA</i>
            <ArrowRight size={12} />
          </div>
          <h1>
            Less friction.<br /><span>More discovery.</span>
          </h1>
          <p>
            A focused space for your databases. Write SQL, follow relationships, and find your next answer — directly from your computer.
          </p>
          <div className="hero-actions">
            <a className="cta-primary" href="#desktop">
              Try it locally
              <ArrowUpRight size={17} />
            </a>
            <a className="cta-secondary" href="https://github.com/Kraksz/AstralSQL" target="_blank" rel="noreferrer">
              <Github size={16} />
              View on GitHub
            </a>
          </div>
          <div className="hero-note">
            <ShieldCheck size={13} />
            No account. No cloud relay. Just you and your data.
          </div>
        </div>
        <aside className="hero-field-notes" aria-label="The Astral workflow"><span className="field-notes-label">YOUR NEXT QUERY STARTS HERE</span><a href="/docs/connections"><span>01</span><div><strong>Bring your database</strong><small>Four engines. One workspace.</small></div><ArrowUpRight size={18} /></a><a href="/playground/index.html"><span>02</span><div><strong>Find your focus</strong><small>SQL, schema, and results together.</small></div><ArrowUpRight size={18} /></a><a href="/docs/querying"><span>03</span><div><strong>Take the answer with you</strong><small>Save queries. Export results.</small></div><ArrowUpRight size={18} /></a><div className="field-notes-footer"><ShieldCheck size={14} /> On your machine. In your control.</div></aside>
        <div className="orbit-caption">
          <span>DIRECT BY DESIGN</span>
          <div />
          <span>01 / LOCAL UNIVERSE</span>
        </div>
      </section>
      <section className="workspace-showcase" id="workspace">
        <div className="showcase-label">
          <span>
            <Sparkles size={14} />A SPACE FOR YOUR NEXT INSIGHT
          </span>
          <a href="/playground/index.html">
            Try real SQLite <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="product-window studio-preview">
          <div className="product-topbar">
            <span className="window-dots">
              <i />
              <i />
              <i />
            </span>
            <span>
              <img src="/logo.svg" alt="" />
              Astral SQL
            </span>
            <span className="product-connected">
              <i />
              Local playground
            </span>
          </div>
          <div className="product-layout">
            <aside>
              <div className="product-workspace">
                <Sparkles size={15} />
                Personal workspace
              </div>
              <div className="product-nav active">
                <Database size={14} />
                Database explorer
              </div>
              <div className="product-section">CONNECTIONS</div>
              <div className="product-connection">
                <Database size={15} />
                <div>
                  Astral playground<small>SQLite · on your device</small>
                </div>
                <i />
              </div>
              <div className="product-section">main</div>
              {["order_items", "orders", "products", "users"].map((t) => (
                <div
                  key={t}
                  className={`product-table ${t === "users" ? "active" : ""}`}
                >
                  <span>›</span>
                  <Database size={12} />
                  {t}
                </div>
              ))}
              <div className="product-local">
                <ShieldCheck size={12} />
                All systems local
              </div>
            </aside>
            <div className="product-editor">
              <div className="preview-studio-heading">
                <span>PERSONAL WORKSPACE / SQLITE</span>
                <h3>Query studio<span>.</span></h3>
                <p>A little space to think. Everything you need to build.</p>
              </div>
              <div className="product-query-tab">
                <Terminal size={14} />
                Explore users<span>×</span>
              </div>
              <div className="product-query-toolbar">
                <span>
                  <Database size={13} />
                  Astral playground <span>/ main</span>
                </span>
                <a href="/playground/index.html">
                  <Play size={12} fill="currentColor" />
                  Run query <kbd>⌘ ↵</kbd>
                </a>
              </div>
              <div className="product-code">
                <span className="line-numbers">
                  1<br />2<br />3<br />4<br />5<br />6
                </span>
                <pre>
                  <span className="comment">
                    -- A little less friction. A lot more flow.
                  </span>
                  {"\n"}
                  <b>SELECT</b> id, name, email, plan{"\n"}
                  <b>FROM</b> users{"\n"}
                  <b>WHERE</b> plan = <em>'Pro'</em>
                  {"\n"}
                  <b>ORDER BY</b> created_at <b>DESC</b>
                  {"\n"}
                  <b>LIMIT</b> <em>100</em>;
                </pre>
              </div>
              <div className="product-result-label">
                <span>
                  Results <i>3 shown</i>
                </span>
                <span>
                  <Check size={12} />
                  Illustrative query preview
                </span>
              </div>
              <Table className="product-results">
                <TableHeader>
                  <TableRow>
                    {["id", "name", "email", "plan"].map((c) => (
                      <TableHead key={c}>{c}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row[0]}>
                      {row.map((cell, i) => (
                        <TableCell key={i}>
                          {i === 3 ? (
                            <span className="plan-tag">{cell}</span>
                          ) : (
                            cell
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="product-footer">
                <ShieldCheck size={11} />
                Your queries never pass through our servers.
                <span>SQLite / UTF-8</span>
              </div>
            </div>
          </div>
        </div>
        <div className="database-support">
          <span>ONE WORKSPACE. YOUR DATABASES.</span>
          <div>
            <Database size={20} />
            PostgreSQL
          </div>
          <div>
            <Database size={20} />
            MySQL
          </div>
          <div>
            <Database size={20} />
            MariaDB
          </div>
          <div>
            <HardDrive size={20} />
            SQLite
          </div>
        </div>
      </section>
      <section id="built-different" className="why-section">
        <div className="section-kicker">LIGHTER BY NATURE</div>
        <h2>
          Everything in your flow.
          <br />
          <span>Nothing in your way.</span>
        </h2>
        <div className="feature-grid">
          <article>
            <Zap />
            <h3>A Rust heart.</h3>
            <p>
              A native database core and your system webview. Built to keep the
              work moving.
            </p>
            <span>TAURI + RUST</span>
          </article>
          <article>
            <LockKeyhole />
            <h3>Your data stays yours.</h3>
            <p>
              Connect straight to your database. Credentials belong in your
              operating system’s keychain.
            </p>
            <span>ZERO CLOUD RELAY</span>
          </article>
          <article>
            <Keyboard />
            <h3>Made for your rhythm.</h3>
            <p>
              SQL completion, command search, saved queries, and a virtual grid.
              Keep your hands on the keys.
            </p>
            <span>KEYBOARD FIRST</span>
          </article>
        </div>
      </section>
      <section className="connection-invitation">
 <div><span className="section-kicker">FROM LOCALHOST TO YOUR NEXT CONNECTION</span><h2>A little guidance.<br /><span>A world of access.</span></h2><p>Already using phpMyAdmin? Connect the same database to Astral on your own PC. Follow our guide to SSH tunnels, server access, and hosting setup.</p><a className="cta-secondary" href="/docs/connections">Find your connection path <ArrowRight size={17} /></a></div>
 <a href="/docs/connections" className="connection-invitation-path" aria-label="Open the remote connection guide"><Terminal size={28} /><span>Your workspace</span><i /><LockKeyhole size={28} /><span>Private connection</span><i /><Database size={28} /><span>Your database</span><ArrowUpRight size={19} /></a>
 </section><section className="download-station" id="desktop">
        <div className="download-heading"><div><span className="section-kicker">CHOOSE YOUR WORKSPACE</span><h2>Astral, on your terms.</h2></div><p>Download the Windows beta, build it yourself, or explore the code. Your next connection is yours to make.</p></div>
        <div className="download-platforms">
          <article className="platform-card platform-ready"><span className="platform-label">READY TO DOWNLOAD</span><Monitor size={30} /><h3>Windows</h3><p>Windows 10 / 11 · x64<br />Native desktop beta · v0.1.6</p><a className="cta-primary" href="/downloads/Astral-SQL-Setup.exe?v=0.1.6" download>Download installer <ArrowDown size={16} /></a><a className="platform-footnote" href="/docs/faq">Unsigned beta · installation FAQ ↗</a></article>
          <article className="platform-card"><span className="platform-label">BUILD IT YOURSELF</span><Terminal size={30} /><h3>Linux</h3><p>Debian / Ubuntu and more.<br />Prebuilt packages not released yet.</p><a className="cta-secondary" href="/docs/install#linux">Linux setup <ArrowRight size={16} /></a><span className="platform-footnote">Rust + system WebKit</span></article>
          <article className="platform-card"><span className="platform-label">BUILD IT YOURSELF</span><Laptop size={30} /><h3>macOS</h3><p>For Mac computers.<br />Signed downloads not available yet.</p><a className="cta-secondary" href="/docs/install#macos">Mac setup <ArrowRight size={16} /></a><span className="platform-footnote">Build on your Mac</span></article>
          <article className="platform-card"><span className="platform-label">OPEN SOURCE</span><Code2 size={30} /><h3>Make it yours</h3><p>Read, build, and contribute.<br />MIT-licensed source on GitHub.</p><a className="cta-secondary" href="https://github.com/Kraksz/AstralSQL" target="_blank" rel="noreferrer"><Github size={16} /> View on GitHub</a><a className="platform-footnote" href="/docs/source">Development guide ↗</a></article>
        </div>
        <div className="download-bottom"><span>On iPhone or iPad? <a href="/docs/install#ios">Read the mobile availability note ↗</a></span><a href="/downloads/SHA256SUMS.txt">Download checksums ↗</a></div>
      </section>
      <footer className="site-footer">
        <a href="#" className="site-brand">
          <img src="/logo.svg" alt="" />
          astral<span>SQL</span>
        </a>
        <div className="footer-links"><a href="/docs">Documentation</a><a href="/docs/faq">FAQ</a><a href="https://github.com/Kraksz/AstralSQL" target="_blank" rel="noreferrer">GitHub ↗</a></div>
        <span>
          Local-first, always. <span>✦</span>
        </span>
      </footer>
    </main>
  );
}
