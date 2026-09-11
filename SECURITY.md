# Security

Astral SQL is a beta database client. The latest beta is the supported development
version; older versions may not receive fixes independently.

Report a vulnerability through the repository's **Security → Report a
vulnerability** page after the owner enables private vulnerability reporting.
If that option is unavailable, ask the maintainer to enable a private reporting
channel before sending exploit details. Do not post credentials or sensitive
database contents in a public issue.

Include the affected version, operating system, database engine, a minimal
reproduction using synthetic data, impact, and any proposed fix.

## Data boundaries

- Desktop database traffic goes directly to the database. Browser SQLite executes
  locally in a worker; the website cannot make native database TCP connections.
- Password persistence is opt-in through the OS credential vault. Profiles omit
  passwords. SQL text, saved queries, and history can contain sensitive literals
  and are stored on the device without an application encryption layer.
- Use verified TLS for direct remote connections or an authenticated SSH tunnel.
- SQL imports execute supplied SQL with the connected user's privileges. They
  can change or delete data, and some engines commit earlier statements even
  when a later statement fails. Review scripts and use appropriate DB permissions.
- Windows installers are currently unsigned. A successful build or test is not
  proof of malware safety or a substitute for trusted publisher signing.

Release checks and known validation gaps are recorded in `docs/release-checklist.md`.
