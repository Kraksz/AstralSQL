import type { ConnectionConfig, Driver } from "./types";

/** Host and port are deliberately separate; never interpret web admin URLs as SQL endpoints. */
export function normalizeServerHost(value: string): string {
  const host = value.trim().replace(/^\[(.*)\]$/, "$1");
  if (!host || host.length > 255 || /[\s/@?#\\]/.test(host)) {
    throw new Error(
      "Enter a database hostname or IP address, without https:// or a phpMyAdmin path.",
    );
  }
  if (host.includes(":")) {
    try {
      new URL(`http://[${host}]/`);
    } catch {
      throw new Error(
        "Enter the port in the Port field. IPv6 addresses are also supported.",
      );
    }
  } else if (!/^[a-zA-Z0-9._-]+$/.test(host)) {
    throw new Error("Enter a valid database hostname or IP address.");
  }
  return host;
}

export function connectionFromForm(
  form: FormData,
  driver: Driver,
): ConnectionConfig {
  const base: ConnectionConfig = {
    id: crypto.randomUUID(),
    name: String(form.get("name") || "").trim(),
    driver,
    database: String(form.get("database") || "").trim(),
  };
  if (!base.name || !base.database)
    throw new Error("Provide a connection name and database.");
  if (driver === "sqlite") return base;
  const port = Number(
    form.get("port") || (driver === "postgres" ? 5432 : 3306),
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port must be a whole number from 1 to 65535.");
  }
  return {
    ...base,
    host: normalizeServerHost(String(form.get("host") || "")),
    port,
    username: String(form.get("username") || "").trim(),
    password: String(form.get("password") || ""),
    rememberPassword: form.get("remember") === "on",
    sslMode: String(
      form.get("sslMode") || "verify-full",
    ) as ConnectionConfig["sslMode"],
  };
}
