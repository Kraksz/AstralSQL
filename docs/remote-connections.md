# Connect a local or remote database

In the native desktop app, choose **New connection**, then **MySQL**, **MariaDB**, or **PostgreSQL**. Enter a name, the database server's hostname or IP address, port, database name, username, and password. Localhost, LAN addresses, public hostnames, IPv4 and IPv6 are accepted. Default ports are 3306 for MySQL/MariaDB and 5432 for PostgreSQL; custom ports are supported.

Keep **Verify server certificate and hostname** selected for a server with a publicly trusted certificate. Other TLS modes are explicit choices. Custom CA files, client certificates and built-in SSH tunnels are not exposed yet. An independently established tunnel can be used through its local forwarded host/port; its TLS identity must still match the chosen verification settings.

Choose **Test connection** to authenticate and execute `SELECT 1`. The temporary connection closes after the test. Testing never saves a profile or reads/writes a saved password. Choose **Connect to database** to open the workspace; optionally save the password in the OS keychain. Nonsecret profiles remain available after restarting the app.

## If you currently use phpMyAdmin

phpMyAdmin is a web administration interface for MySQL and MariaDB, not a database engine. Astral needs the **database endpoint**, not the phpMyAdmin URL. Use the host/port and database credentials supplied by your hosting provider. A host shown as `localhost` inside phpMyAdmin refers to that server's machine, not your own computer.

Some shared hosting plans only permit SQL connections from their own web server. If a remote connection is refused or times out, check whether your provider supports remote database access, whether your client IP is allowed, and whether the host, port, firewall rules and database account grants are correct. Authentication errors and certificate errors require checking the credentials and TLS configuration respectively. Astral does not modify your server or firewall settings.

The browser playground runs SQLite locally. Browsers cannot use the desktop's direct database sockets; remote connections and tests require a compiled Rust desktop build. A phpMyAdmin page working in your browser does not establish that your SQL server accepts direct connections from your computer.

## A server that only accepts local connections

A refused TCP port means no SQL authentication has started. Changing the password or disabling TLS cannot open that port. A phpMyAdmin dashboard showing `localhost` or a UNIX socket uses the server's own local connection.

If you already have SSH access, you can keep MariaDB private and forward a local port through SSH:

```sh
ssh -N -L 127.0.0.1:13306:127.0.0.1:3306 YOUR_SSH_USER@YOUR_SERVER
```

Keep the SSH session open. In Astral select MariaDB, host `127.0.0.1`, port `13306`, your database name and database credentials. SSH and database usernames/passwords are separate. Verify the SSH host identity through your provider. When the database does not offer TLS, Disabled is appropriate only for this local endpoint protected by the established SSH tunnel. Do not disable certificate verification on a direct public connection to work around an unrelated timeout.

If a provider manages the server, ask for its remote database endpoint and client-IP allowlisting, or supported SSH tunnel access. Do not expose port 3306 to everyone. An account named `phpmyadmin` is not proof that it accepts remote logins; use a database account intended for this client.

## Validation status

Frontend tests cover all three remote engines, custom ports, IPv6, invalid web URLs, saved MariaDB profiles, the native command boundary, and rejection of network calls in the browser. Native source includes MariaDB serialization/dialect, host-validation, and temporary SQLite connection tests. Native tests now pass against isolated MySQL 8.4.11, MariaDB 11.4.10, and PostgreSQL 17.11 servers. These tests cover connection, Unicode/decimal/null reads, inserts and updates, row limits, schema metadata, foreign keys, and disconnects. These fixtures run on loopback; public-network reachability and TLS certificates still depend on your actual server configuration.

References: [phpMyAdmin](https://www.phpmyadmin.net/) and [SQLx 0.8.6 engine support](https://docs.rs/crate/sqlx/0.8.6).

## Interactive walkthrough

Open **Learn** in the desktop navigation rail, or **Connecting from another PC?** in the new connection dialog. The same guide is available at https://astral-sql-celestial.kraksz.chatgpt.site/connect. It includes SSH, restricted direct MariaDB access, hosting-provider instructions, copyable commands, connection fields, and error explanations. The desktop guide works offline. Its source lives in src/components/help/ConnectionGuide.tsx; website:sync copies it and its stylesheet into the website.
