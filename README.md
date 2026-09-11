# Astral SQL

A local-first SQL workspace with a Rust/Tauri 2 desktop core, React/TypeScript interface, and a matching celestial blue landing page.

**Status: functional beta, not a verified production release.** The web app runs real local SQLite. The Rust core passes native SQLite tests and live MySQL 8.4.11, MariaDB 11.4.10, and PostgreSQL 17.11 integration tests. Windows credential-vault storage is tested. Installer signing, platform-wide validation, startup benchmarks, and total process-tree memory measurements remain release work. Sub-40 MB RAM and instant startup are design targets, not measured results.

## Run the workspace

Requires Node.js 24 LTS and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:1420. The playground starts with 100 synthetic users and related orders, products, and order items. All browser SQL runs in a Web Worker with locally bundled SQLite/WASM. No database relay or analytics is implemented. Fonts are bundled locally.

## Run the native desktop app

The Windows x64 beta installer is available on the landing page under **Desktop**. It is unsigned. WebView2 is required; the installer can bootstrap it when missing. To build or develop the app yourself, follow the steps below.

Install the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). Windows needs Rust's MSVC toolchain, Microsoft C++ Build Tools with the Windows SDK, and WebView2. Then:

```sh
npm ci
npm run desktop
```

To build an installer:

```sh
npm run desktop:build
```

The database implementation is in `src-tauri/src/db`. Passwords are passed to Rust transiently and saved in the OS keychain only when requested. Saved connection profiles contain an explicit allowlist of nonsecret fields. PostgreSQL, MySQL, and MariaDB use direct connections and TLS settings selected in the connection dialog. Use certificate verification for remote production databases.

## Features

For remote servers and existing phpMyAdmin-managed databases, see [connection setup](docs/remote-connections.md).

- An original Query Studio layout: navigation rail, connection cards, side-by-side or stacked editor/results, and a focused schema explorer.
- SQL completion, syntax highlighting, formatting, editor tabs, and selected-statement execution.
- Direct local/LAN/remote PostgreSQL, MySQL, and MariaDB connections in the desktop app, with custom ports, TLS, and a temporary connection test.
- Ctrl/Cmd+Enter runs SQL; Ctrl/Cmd+K opens the command palette; Ctrl/Cmd+S saves a query.
- Schema explorer, column metadata, primary and foreign keys, and relationships.
- Virtualized results with loaded-row sorting, filtering, cell selection/copy, CSV/JSON exports.
- Exact 64-bit integers represented as strings when outside JavaScript's safe range.
- Per-tab/per-connection query results, saved queries, and the last 100 executed queries.
- Native SQLite file chooser; browser SQLite import, IndexedDB persistence, database backups, and cancellation.
- Mouse-responsive sky-blue ribbons with visible drift, pointer bending, a pause control, and explicit opt-in when the system prefers reduced motion.
- Sky-only WebGL rendering, lazy Three.js, reduced-motion handling, hidden/offscreen suspension, bounded pixel resolution, and GPU cleanup.

## Query and storage behavior

Queries execute one statement at a time in auto-commit mode. Writes run immediately. The regular Run query action rejects multiple statements and interactive transactions. Use Open SQL file or Run SQL script to review and import a complete script in one session. Cancellation is best effort: a native write may already have committed, so inspect the data before retrying.

The default result cap is 1,000 rows, with up to 10,000 selectable. Native queries also have a 16 MiB returned-value budget and a 30-second query timeout. Large results are capped; native drivers drain the response until completion/timeout so a result limit does not silently stop a write with RETURNING halfway through. This is a memory cap, not database-level pagination. Arbitrary large individual server values can still require more memory while decoding.

The browser playground supports database files up to 128 MB. Browser imports are copies, saved in origin-specific IndexedDB; the original file on disk is not overwritten. Export a SQLite backup to obtain the changed file. Closing the tab, clearing browser data, private browsing, storage quotas, and different site origins affect persistence. Use the native app for large databases and serious database operations. Queries and history may contain sensitive SQL literals; they are stored on the device, so avoid putting passwords in SQL text.

Schema inspection covers the active database and up to 1,000 tables in the native app. Unsupported server-specific types produce a clear error and may be inspected with an explicit cast to text. Built-in SSH tunnel management, interactive transactions, in-grid editing, database administration tooling, and signed update distribution are not implemented.

## Landing page

The separate `website/` project uses the Sites/Vinext starter. It includes the shared aurora, product presentation, and a copy of the browser playground at `/playground/index.html`.

```sh
cd website
npm ci
npm run dev
```

Before building a refreshed landing page, build the desktop frontend from the repository root and run `npm run website:sync` to copy the current browser bundle. Then run `npm run build` inside `website`. Source archives are generated with `npm run source:zip` and exclude databases, credentials, build directories, dependencies, logs, and deployment credentials.

## Verification

```sh
npm test
npm run build
cargo test -p astral-sql --no-default-features
cargo check -p astral-sql --features desktop
```

JavaScript tests exercise the real SQLite engine, bounded results, integer precision, failed writes, parser edge cases, foreign keys, persistence bytes, safe exports, worker lifecycle, and credential allowlisting. CI is provided for native compilation/tests on an environment with the required toolchain. A passing browser build does not validate the Rust executable.

Live network checks are reproducible with `cargo test --no-default-features --test network_integration -- --ignored`. They require an isolated database named `astral_test` and `ASTRAL_TEST_DRIVER`, `ASTRAL_TEST_HOST`, `ASTRAL_TEST_PORT`, `ASTRAL_TEST_USER`, and `ASTRAL_TEST_PASSWORD` environment variables. The test creates and drops uniquely named fixture tables. Never point these checks at a user database. A separate optional OS-vault check is available with `cargo test --no-default-features --test keychain_integration -- --ignored`; it removes its temporary credential after reading it.

The local app was also checked through its rendered UI for real SQL execution and a clean browser console. Performance and memory usage need measurement on each supported platform, counting both the native process and its webview child processes. No fixed FPS guarantee is made.

## SQL file imports (0.1.1)

Choose Open SQL file (.sql), review the script and destination, then choose Import into database. Open in editor loads the file without executing it. Run SQL script reviews the current editor contents. UTF-8 files up to 16 MiB are supported. Native imports have a 120-second overall timeout (PostgreSQL also retains its 30-second statement timeout). Native sessions are dedicated for the import; SQLx drains results without retaining SELECT rows. MySQL/MariaDB exports may contain version comments, SET, USE, transactions, and DDL. DELIMITER client directives and psql/COPY FROM STDIN data streams are not supported; use plain SQL or INSERT-format exports. MySQL/MariaDB DDL may commit immediately, so imports are not universally atomic. Errors and cancellation may leave earlier writes committed. SQL statements can explicitly target other schemas; review the source before running it.

Browser imports support SQLite SQL only and run against a staged copy; the original is preserved if execution or saving fails. Native SQLite rolls back an unclosed transaction, preserves its in-memory connection, and restores foreign-key enforcement. This is script execution, not cross-engine dump conversion.

## GitHub and releases

The repository includes frontend/site, native, disposable network-database, and Windows artifact workflows; an MIT license; contribution and security guidance; and issue/PR templates. Start with [GitHub publishing](docs/github-release.md) and the [release checklist](docs/release-checklist.md). Run `npm run release:check` to validate synchronized versions and required release documents. A source ZIP contains the full clean repository tree, including the website, without private hosting bindings.

The Learn guide is available offline in the app and at `/docs/connections` on the website; `/connect` redirects there. The `/docs` handbook includes installation, query workflows, FAQ, and source guidance. Aurora animation is always enabled while the canvas is visible; no animation toggle or stored pause preference is used. Hidden tabs and offscreen canvases still suspend rendering.
