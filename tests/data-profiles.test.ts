import { describe, expect, it } from "vitest";
import {
  CONNECTION_PROFILES_KEY,
  disconnectedProfile,
  readConnectionProfiles,
  sanitizeConnectionProfile,
  writeConnectionProfiles,
} from "../src/lib/connectionProfiles";
import type { ConnectionConfig } from "../src/lib/types";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(
    initial ? [[CONNECTION_PROFILES_KEY, initial]] : [],
  );
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const config: ConnectionConfig = {
  id: "stable-connection-id",
  name: "Local PostgreSQL",
  driver: "postgres",
  host: "localhost",
  port: 5432,
  database: "shop",
  username: "astral",
  password: "sensitive-regression-test-password",
  rememberPassword: true,
  sslMode: "require",
};

describe("native connection profiles", () => {
  it("restores a remote MariaDB profile without persisting its password", () => {
    const storage = memoryStorage();
    writeConnectionProfiles(
      [{ ...config, driver: "mariadb", host: "db.example.com", port: 3307 }],
      storage,
    );
    const restored = readConnectionProfiles(storage)[0];
    expect(restored).toMatchObject({
      driver: "mariadb",
      host: "db.example.com",
      port: 3307,
    });
    expect(restored).not.toHaveProperty("password");
  });
  it("serializes only the explicit nonsecret allowlist, even when a full config is passed", () => {
    const storage = memoryStorage();
    const supplied = {
      ...config,
      accessToken: "token-that-must-never-persist",
      sshPrivateKey: "private-key-that-must-never-persist",
    };
    writeConnectionProfiles([supplied], storage);
    const serialized = storage.getItem(CONNECTION_PROFILES_KEY)!;
    expect(serialized).not.toContain(config.password);
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain(supplied.accessToken);
    expect(serialized).not.toContain(supplied.sshPrivateKey);
    expect(Object.keys(JSON.parse(serialized)[0]).sort()).toEqual([
      "database",
      "driver",
      "host",
      "id",
      "name",
      "port",
      "rememberPassword",
      "sslMode",
      "username",
    ]);
  });

  it("restores disconnected profiles with the same keychain identity across restarts", () => {
    const storage = memoryStorage();
    writeConnectionProfiles([sanitizeConnectionProfile(config)], storage);
    const restored = readConnectionProfiles(storage)[0];
    expect(restored).toMatchObject({
      id: config.id,
      driver: config.driver,
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      rememberPassword: true,
    });
    expect(restored).not.toHaveProperty("password");
    expect(disconnectedProfile(restored)).toMatchObject({
      id: config.id,
      connected: false,
      name: config.name,
    });
  });

  it("strips unexpected secret fields from preexisting stored data on read and rewrite", () => {
    const storage = memoryStorage(
      JSON.stringify([{ ...config, futureSecret: "also-sensitive" }]),
    );
    const restored = readConnectionProfiles(storage);
    expect(restored[0]).not.toHaveProperty("password");
    expect(restored[0]).not.toHaveProperty("futureSecret");
    writeConnectionProfiles(restored, storage);
    expect(storage.getItem(CONNECTION_PROFILES_KEY)).not.toContain("sensitive");
  });

  it("rejects malformed profiles and omits the demo connection", () => {
    const storage = memoryStorage(
      JSON.stringify([
        { ...config, id: "demo" },
        { ...config, id: "bad-port", port: 99999 },
        { ...config, id: "bad-host", host: { password: "hidden" } },
        { ...config, id: "bad-driver", driver: "untrusted" },
        config,
        config,
      ]),
    );
    expect(
      readConnectionProfiles(storage).map((profile) => profile.id),
    ).toEqual([config.id]);
    writeConnectionProfiles([{ ...config, id: "demo" }], storage);
    expect(storage.getItem(CONNECTION_PROFILES_KEY)).toBe("[]");
    expect(readConnectionProfiles(memoryStorage("{invalid json"))).toEqual([]);
  });
});
