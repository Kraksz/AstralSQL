# Final database validation

Date: September 11, 2026. Application: Astral SQL 0.1.5 beta.

## Results

| Engine | Local validation | External server validation |
| --- | --- | --- |
| SQLite | PASS: nine integration tests, including file persistence after reconnect | Embedded database; no database server protocol |
| MySQL 8.4.11 | PASS: localhost and 127.0.0.1, each with TLS disabled and required | No external authenticated test endpoint supplied |
| MariaDB 11.4.10 | PASS: localhost and 127.0.0.1, each with TLS disabled and required | Previously supplied endpoint refused TCP connections; authentication could not be tested |
| PostgreSQL 17.11 | PASS: localhost and 127.0.0.1, each with TLS disabled and required | No external authenticated test endpoint supplied |

The Windows disposable-server matrix completed successfully: 12/12 connection configurations, with both network integration suites passing in every configuration. These are real database servers accessed through the application's Rust database layer, not mocked network responses. All listeners were restricted to loopback, and temporary servers were stopped after testing. No user database was modified.

Additional checks: 56 current frontend tests, 16 native core/connection/SQLite tests, one explicitly enabled OS credential-vault integration test, and Rust formatting passed. Archived source copies previously inflated frontend totals; Vitest now discovers only current tests under `tests/`.

## Behaviors exercised

- Connection testing, authenticated sessions, custom ports, invalid passwords, nonexistent databases, closed connections, and reconnect persistence.
- Queries, inserts, updates, deletion, constraints, row limits, Unicode including Cyrillic and emoji, numeric precision, null values, schema metadata, quoted identifiers, and foreign keys.
- SQL script session state and failed DML transaction rollback.
- Query cancellation and subsequent connection recovery.
- Server-confirmed encrypted sessions when TLS is required.
- Rejection of a deliberately untrusted certificate in verify-ca and verify-full modes, without modifying the OS trust store.

The first matrix attempt encountered a Windows executable lock caused by a concurrent Cargo build and an unsupported PostgreSQL initdb stdin-password option. The runner was corrected to use a temporary password file, removed immediately after initialization; the complete sequential rerun passed. No application runtime fix was needed for these failures.

## Limits and release status

Local TLS tests do not prove that a public server's firewall, account grants, certificate chain, or SSH tunnel works. The remote MariaDB refusal occurred before authentication; the exact server-side cause is not established. Follow [remote connection setup](remote-connections.md), then repeat an authenticated test against a disposable database once the server owner makes it reachable. A phpMyAdmin web page being reachable does not establish direct database-protocol connectivity.

Successful trusted-CA/hostname verification against an external server, IPv6 transport, external SSH tunneling, and other database versions remain unverified. SQL Server, Oracle, and other engines outside the four listed above are not supported by this release.

This pass exercised the Rust database entry points and frontend tests; it did not repeat every installed-app UI workflow, clean-machine installation, export download, or platform packaging check. The outstanding stable-release gates in [the release checklist](release-checklist.md) still apply. The result is a tested beta, not a claim that every database/server combination works.

## Reproduction and evidence

See the [README verification instructions](../README.md#verification) and `scripts/test-databases-windows.ps1`. Use an isolated `astral_test` database only. Never commit credentials or private server addresses.

The local completed run is identified by `astral-final-db-7cf0478dd37f4871988c81b6694e2a0d` under the testing user's temporary directory. Its `results.json` records all 12 outcomes and links to per-case logs. The workspace also retains `final-database-matrix-rerun.log`, `final-database-native-current.log`, `final-database-frontend-current.log`, and `final-database-keychain.log`. These machine-local logs are excluded from source distribution.

The database CI workflow now includes the acceptance suite for future runs. Changes from this validation pass have not yet been pushed to GitHub or included in a new download.
