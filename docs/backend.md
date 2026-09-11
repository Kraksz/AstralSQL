# Astral SQL native backend

The desktop app uses Tauri 2 and typed SQLx PostgreSQL, MySQL, MariaDB, and SQLite drivers. Database traffic travels directly from the Rust process to the selected database. The backend has no cloud relay, analytics SDK or telemetry endpoint. The browser demo is a separate local SQLite implementation; it cannot connect to database servers.

## Build and validation

The canonical Tauri configuration is `src-tauri/tauri.conf.json`. There is deliberately no root-level Tauri config: a second config causes Tauri CLI discovery to select the wrong application directory and ignore the native window/CSP settings.

Install Node.js 22, a current stable Rust toolchain (Rust 1.88 or later), and the [platform prerequisites documented by Tauri](https://v2.tauri.app/start/prerequisites/). Windows needs Microsoft Visual Studio C++ Build Tools (Desktop development with C++, MSVC and Windows SDK) and Microsoft Edge WebView2. macOS needs Xcode Command Line Tools. Linux desktop builds also need WebKitGTK 4.1 and Tauri's listed distribution packages; the credential-vault implementation needs an available Secret Service, D-Bus and its build dependencies.

From the repository root:

```sh
npm ci
cargo fmt --all -- --check
cargo test --workspace --no-default-features --locked
npm run desktop
```

To check native integration or produce a release:

```sh
npm run build
cargo check --workspace --all-targets --locked
npm run desktop:build
```

`.github/workflows/native.yml` runs formatting and core/SQLite tests on Windows and Ubuntu, then checks the complete Tauri Windows application. PostgreSQL/MySQL/MariaDB integration requires separately provisioned servers and is not represented by the SQLite tests. Signing/notarization certificates and release publishing are not configured.

The Windows development environment now has the stable Rust MSVC toolchain, Visual Studio C++ Build Tools, Windows SDK, and WebView2. All 15 core/connection/SQLite tests pass. Live integration tests pass on MySQL 8.4.11, MariaDB 11.4.10, and PostgreSQL 17.11. A real Windows credential-vault test passes save, identity-bound read, deletion, and missing-entry behavior. macOS/Linux desktop runtime checks and signing remain unverified.

## Command contract

Tauri command arguments use camelCase. No command returns a password.

| Command               | Arguments                                                                                                   | Result                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `connect_database`    | `{ config: { id, name, driver, host, port?, database, username, password?, rememberPassword?, sslMode? } }` | `{ id, name, driver, database, host, connected: true }`                            |
| `disconnect_database` | `{ connectionId }`                                                                                          | `null`                                                                             |
| `test_connection`     | `{ config }` (same fields as connect)                                                                       | elapsed milliseconds; temporary connection closed, no profile or vault persistence |
| `execute_query`       | `{ connectionId, sql, maxRows?, queryId }`                                                                  | `{ columns: [{ name, dataType }], rows, rowsAffected, elapsedMs, truncated }`      |
| `cancel_query`        | `{ queryId }`                                                                                               | `null`                                                                             |
| `get_schema`          | `{ connectionId }`                                                                                          | tables with `name`, `schema`, `columns` and `foreignKeys`                          |
| `forget_password`     | `{ connectionId }`                                                                                          | `null`                                                                             |

Use a new unique `queryId` for every run. IDs allow 1–128 ASCII letters, digits, dots, underscores and hyphens. `driver` is `sqlite`, `postgres`, `mysql`, or `mariadb`. SQLite accepts an existing absolute file path or `:memory:`; missing paths are not silently created. The reserved pair `id: "demo", database: ":astral-demo:"` opens a disposable, seeded SQLite database containing users, products, orders and order_items. It never seeds a user database.

## Credentials and TLS

MySQL and MariaDB share SQLx's MySQL protocol implementation while retaining separate driver labels and saved identities. Hostnames and IPv4/IPv6 are accepted for local and remote connections; HTTP URLs and host/port combinations in the host field are rejected. See [remote connection setup](remote-connections.md), including phpMyAdmin hosting guidance.

Passwords exist briefly in frontend form state for invocation, then only in the Rust connection configuration while connected. They must never be copied into localStorage, logs, SQL history or connection-profile JSON. The backend disables SQLx statement logging. Temporary password buffers owned by this app are zeroed when practical; SQLx necessarily retains authentication material inside pool options, so this is not a guarantee that every process-memory copy is erased.

When `rememberPassword` is true, the OS vault stores the password, bound to driver, host, port, database and username. A changed destination cannot silently receive a password saved for another endpoint. A missing vault fails explicitly when a save/read was requested. Disconnecting does not delete a saved credential; `forget_password` does. Disabling remembering for a new connection does not delete an older vault entry automatically.

Remote connections default to `verify-full`. Allowed modes are `verify-full`, `verify-ca`, `require` and explicitly selected `disable`. `require` encrypts without complete server identity verification; choose `verify-full` for identity verification. Custom CA/client certificate configuration is not exposed in this version. SQLx PostgreSQL environment settings may supply CA/client certificates, but `.pgpass` is bypassed. See [SQLx PostgreSQL options](https://docs.rs/sqlx/0.8.6/sqlx/postgres/struct.PgConnectOptions.html) and [MySQL options](https://docs.rs/sqlx/0.8.6/sqlx/mysql/struct.MySqlConnectOptions.html).

## Query semantics and limits

- One parsed SQL statement per invocation. The dialect-aware SQL parser handles comments, quoted semicolons and CTEs. It is not a regex SQL classifier. Unsupported vendor syntax fails before execution with a parser message; run supported statements separately. Database metadata determines result columns, including empty result sets.
- Queries auto-commit. Interactive `BEGIN`, `COMMIT`, `ROLLBACK`, savepoint and session `SET`/`USE` commands are rejected. Each run acquires a pooled connection; do not rely on temporary tables or connection-local settings persisting between runs. This is not a transaction editor. Affected-row counts are reported for top-level INSERT/UPDATE/DELETE/MERGE statements; read results report zero affected rows, including when a prior SQLite write left a changes counter.
- Up to 16 connected databases, three physical connections per remote/file database, and 32 in-flight query registrations. In-memory SQLite uses one physical connection. Idle remote/file connections expire, and prepared-statement caches are limited to 32 entries.
- Query execution is bounded to 30 seconds, with a separate five-second pool-acquisition limit and twelve-second connection-establishment limit. PostgreSQL additionally sets server-side statement and lock timeouts. SQLite installs a cancellable [progress handler](https://docs.rs/sqlx/0.8.6/sqlx/sqlite/struct.LockedSqliteHandle.html) so recursive/CPU-intensive queries stop inside SQLite.
- `maxRows` defaults to 1,000 and is clamped to 1–10,000. Returned JSON rows also have a 16 MiB retention budget. Rows beyond these caps are drained and discarded until completion, preserving statement completion and affected-row counts. Use a SQL `LIMIT` when you need to bound database work or network traffic. One large database value/packet can exceed the retention budget temporarily inside the driver; the cap is not a process-memory guarantee.
- Cancellation closes a remote query's physical connection instead of returning uncertain protocol state to the pool. This is best effort: disconnect does not prove a remote server has stopped an operation, and a write may already have committed. SQLite interrupts its worker and restores the connection. Inspect the database before retrying any cancelled or timed-out write. No cancel operation promises rollback.
- Schema inspection has a 30-second client deadline and a 1,000-table limit. Table/schema names are bound as query parameters, including SQLite table-valued PRAGMAs. PostgreSQL foreign keys align composite key columns by ordinal position. Cross-schema references use qualified table names. SQLite inspection covers the main database, not ATTACHed databases.

## Data representation

SQL NULL becomes JSON `null`; booleans remain booleans. Integers outside JavaScript's exact range become decimal strings, including integers nested inside JSON columns. Decimal/numeric values become strings to retain precision. Non-finite floats become strings because JSON has no representation for them. Binary fields become `0x`-prefixed hex strings. Dates/times become strings; PostgreSQL timezone-aware timestamps use UTC RFC 3339.

PostgreSQL supports common scalar types and nullable arrays of bool, integers, floats, numeric, text, UUID and JSON. MySQL supports common integer (including unsigned), decimal, floating, text, JSON, binary, date, datetime/timestamp and TIME types. SQLite uses each value's runtime type, rather than assuming its declared column type. Unsupported domain/custom/range/geometric types and invalid dates produce an explicit column/type error advising a SQL cast; they are never silently converted to NULL. Cast unusual types to text in the query when needed.

## Performance claims

The native architecture removes Electron and supports low-overhead direct database access, but a sub-40 MB total RAM footprint, a particular boot time, or constant 60/120 FPS have not been measured or guaranteed. WebView processes, database results and an enabled WebGL shader consume additional memory. Benchmark release builds on each target OS with representative schemas and query results before publishing numerical claims.

## Explicit SQL imports

The open_sql_file command opens a native SQL file picker and returns UTF-8 name/sql fields, with a 16 MiB bounded read. import_sql_script accepts connectionId, sql, queryId and uses the shared cancellation registry. It bypasses the single-query parser only for this explicit review/import path. All statements run through the database raw SQL protocol on one acquired connection. Network sessions close afterward to avoid leaking SET/USE or transaction state into future pooled queries. Results are drained without accumulating selected rows. SQLite uses its progress callback for cancellation and preserves its in-memory session; open transactions are rolled back and foreign keys restored. Imports may be partially committed on errors, especially MySQL/MariaDB DDL. See README for format limits.

Connection setup performs a bounded TCP reachability check before database authentication, distinguishing refused ports and unreachable hosts from SQL errors. No server firewall or listener configuration is changed by the client.
