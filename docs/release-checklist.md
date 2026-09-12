# Release verification — 0.1.7 beta

This document records checks for the source package. It is not a claim that every
server, operating system, or SQL dialect has been validated.

## Automated checks

- Frontend: real SQLite behavior, SQL import rollback, credential/profile
  allowlisting, export safety, worker handling, pointer mapping, frame-rate
  independent damping, and visible-canvas animation.
- Native: parser guards, remote-host validation, temporary connection tests,
  real SQLite types, schemas, imports, cancellation, and connection survival.
- Disposable network integration: MySQL 8.4.11, MariaDB 11.4.10, and PostgreSQL
  17.11. Tests cover connection, script session state, Unicode, row limits,
  schema/foreign keys, inserts/updates, and disconnects. They use loopback and
  do not validate a user's public endpoint, firewall, SSH setup, or TLS chain.
- Frontend and website production builds; Windows NSIS build and executable launch.
- npm production dependency advisory checks for both projects.
- Version consistency and clean source archive contents.

## Manual workflow checks

- [x] Landing-page aurora starts automatically; the pause toggle and stored preference were removed.
- [x] Cursor sweep visibly changes ribbon deformation. Offscreen/hidden rendering suspension remains.
- [x] Tutorial SSH/direct/hosting choices, copy feedback, and return navigation.
- [x] Browser SQL execution, result filtering/clearing, saved queries, script review/import, imported data, editor context menu, and guide dialog.
- [x] Phone landing/guide layouts and navigation at 390px and 320px; no horizontal overflow.
- [ ] Browser download completion: CSV serialization tests pass and the UI dispatches export, but the in-app browser download event could not be confirmed. Verify file saving in Chrome/Edge and the installed desktop app.
- [x] Final Windows NSIS installer built; packaged executable launched and remained responsive with no stderr output. Clean-machine installer testing remains pending.
- [x] Clean source checkout install and website build without private hosting metadata.

Earlier database validation on September 10–11, 2026: 59 frontend tests and 15 native core/SQLite tests passed. Separate live MySQL, MariaDB, and PostgreSQL integration checks passed. Both npm production dependency audits reported zero known vulnerabilities. Native OS-vault tests were run in an earlier beta, not repeated for this UI-only release.

## Gates before a stable release

- [ ] Trusted Windows publisher signing and installer verification.
- [ ] Clean-machine installation, upgrade, and uninstall checks on supported Windows versions.
- [ ] macOS and Linux desktop packaging and UI verification.
- [ ] Measured startup, frame rate, and total process-tree memory on named hardware.
- [ ] External TLS, SSH tunnel, and real hosting configuration validation by the server owner.
- [x] First GitHub Actions runs in the published repository (commit `614bfb6`: frontend/site, native Windows/Linux, and all three disposable database jobs passed).

Built-in SSH management, interactive transactions, and in-grid editing other than
deleting a row by its primary key are not implemented. SQL script execution is not
cross-engine dump conversion.
Publish a clearly labelled beta until the stable-release gates are completed.

## 0.1.5 UI and docs verification

- Historical frontend total of 115 included archived source copies. The isolated current suite has 56 tests, all passing on September 11, 2026; `vitest.config.ts` now excludes archives from discovery.
- Windows NSIS package built successfully.
- Docs search, FAQ disclosures, connection-error disclosures, wrapped command blocks, and phone documentation navigation checked in browser.
- Website and platform source-build instructions do not claim verified Linux/macOS/iOS installers.
- GitBook Markdown handbook is prepared for Git Sync; no GitBook workspace has been connected.

## 0.1.6 database tools verification

- MySQL/MariaDB schema inspection loads tables, columns and foreign keys in three queries instead of two per table, so a remote MariaDB with hundreds of tables no longer hits the 30-second limit.
- New: drop one table or all tables, whole-database `.sql` export and import for MySQL/MariaDB, and deleting a result row by its primary key.
- Checks on September 12, 2026: 25 native tests (including dump statement splitting, literal encoding and generated-column detection) and 64 frontend tests passed; TypeScript, frontend, and Windows NSIS/MSI release builds succeeded.
- Export, import and row delete have not yet been verified against a live MySQL/MariaDB server or in the installed app. Test them on a copy of the data first.

## 0.1.7 PostgreSQL schema verification

- PostgreSQL schema inspection now loads tables, columns, primary keys and foreign keys in four queries for the whole database instead of two queries per table, matching the MySQL/MariaDB change in 0.1.6.
- The per-column `EXISTS` primary-key subquery was replaced with a single `pg_constraint` query, so wide schemas no longer pay for it per column.
- Checks on September 12, 2026: 25 native tests and 64 frontend tests passed; TypeScript, frontend, and Windows release builds succeeded.
- The new PostgreSQL queries were not run against a live server on the release machine. The disposable database workflow exercises PostgreSQL 17.11 on each push.
