# Frequently asked questions

## Is Astral free?

Yes. Astral uses the MIT license. Third-party dependencies retain their licenses.
The current release is beta.

## Which engines are supported?

Desktop: SQLite, PostgreSQL, MySQL, and MariaDB. Browser playground: SQLite only.
Other engines have not been validated.

## Can I connect to phpMyAdmin?

Connect to the database behind it, using the database endpoint and an allowed
account. phpMyAdmin's HTTP address is not a SQL endpoint. Follow [remote connections](connections.md).

## Where do queries and passwords go?

Desktop queries travel directly to your database. There is no cloud query relay
or app telemetry. Saved passwords use the OS keychain when requested; connection
profiles omit passwords. SQL history may itself contain sensitive text, so avoid
putting secrets in scripts.

## Why does Windows say Unknown publisher?

The beta installer is unsigned. SmartScreen reputation warnings differ from named
antivirus detections. A warning does not prove a file is safe or malicious. Do not
disable Windows protection. [Microsoft explains reputation checks here](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## Are Linux, Mac, and iOS downloads available?

Windows has a beta installer. Linux and macOS currently use source builds and need
release verification. iOS has no native app; the website and docs work on phones.

## Can I import a phpMyAdmin SQL export into SQLite?

Not as an automatic conversion. Use a matching MySQL/MariaDB destination or convert
and review the SQL separately. Opening the script does not execute it.

## Is this production-ready?

It is beta. Signing, clean-machine installation, cross-platform packaging,
external TLS/SSH validation, and measured performance remain release gates.
