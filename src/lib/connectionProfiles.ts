import type { ConnectionConfig, ConnectionInfo, Driver } from "./types";

export type ConnectionProfile = Omit<ConnectionConfig, "password">;
export const CONNECTION_PROFILES_KEY = "astral-connection-profiles";
type ProfileStorage = Pick<Storage, "getItem" | "setItem">;

/** Explicit allowlist: adding a field to ConnectionConfig cannot leak it to disk. */
export function sanitizeConnectionProfile(
  config: ConnectionConfig,
): ConnectionProfile {
  return {
    id: config.id,
    name: config.name,
    driver: config.driver,
    database: config.database,
    host: config.host,
    port: config.port,
    username: config.username,
    rememberPassword: config.rememberPassword === true,
    sslMode: config.sslMode,
  };
}

export function readConnectionProfiles(
  storage: ProfileStorage = localStorage,
): ConnectionProfile[] {
  try {
    const raw: unknown = JSON.parse(
      storage.getItem(CONNECTION_PROFILES_KEY) ?? "[]",
    );
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw.slice(0, 100).flatMap((value: unknown) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      if (
        typeof item.id !== "string" ||
        !item.id ||
        item.id === "demo" ||
        seen.has(item.id) ||
        typeof item.name !== "string" ||
        typeof item.database !== "string" ||
        !["sqlite", "postgres", "mysql", "mariadb"].includes(
          String(item.driver),
        )
      )
        return [];
      if (
        item.port !== undefined &&
        (typeof item.port !== "number" ||
          !Number.isInteger(item.port) ||
          item.port < 1 ||
          item.port > 65535)
      )
        return [];
      if (item.host !== undefined && typeof item.host !== "string") return [];
      if (item.username !== undefined && typeof item.username !== "string")
        return [];
      if (
        item.sslMode !== undefined &&
        !["disable", "prefer", "require", "verify-ca", "verify-full"].includes(
          String(item.sslMode),
        )
      )
        return [];
      seen.add(item.id);
      return [
        sanitizeConnectionProfile({
          id: item.id,
          name: item.name,
          driver: item.driver as Driver,
          database: item.database,
          host: item.host as string | undefined,
          port: item.port as number | undefined,
          username: item.username as string | undefined,
          rememberPassword: item.rememberPassword === true,
          sslMode: item.sslMode as ConnectionConfig["sslMode"],
        }),
      ];
    });
  } catch {
    return [];
  }
}

export function writeConnectionProfiles(
  profiles: readonly ConnectionProfile[],
  storage: ProfileStorage = localStorage,
): void {
  storage.setItem(
    CONNECTION_PROFILES_KEY,
    JSON.stringify(
      profiles
        .filter((profile) => profile.id !== "demo")
        .slice(0, 100)
        .map(sanitizeConnectionProfile),
    ),
  );
}

export function disconnectedProfile(
  profile: ConnectionProfile,
): ConnectionInfo {
  return {
    id: profile.id,
    name: profile.name,
    driver: profile.driver,
    database: profile.database,
    host: profile.host,
    connected: false,
  };
}
