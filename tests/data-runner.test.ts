import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nativeInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: nativeInvoke }));

class FakeWorker {
  static instances: FakeWorker[] = [];
  messages: Record<string, unknown>[] = [];
  terminated = false;
  onmessage?: (event: { data: Record<string, unknown> }) => void;
  onerror?: (event: { message: string }) => void;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: Record<string, unknown>) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(index: number, result: unknown) {
    this.onmessage?.({ data: { id: this.messages[index].id, result } });
  }
}

beforeEach(() => {
  vi.resetModules();
  nativeInvoke.mockReset();
  FakeWorker.instances = [];
  vi.stubGlobal("window", {});
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe("browser SQL worker lifecycle", () => {
  it.each(["mysql", "mariadb", "postgres"] as const)(
    "passes remote %s host and custom port directly to Rust",
    async (driver) => {
      vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
      const config = {
        id: "remote",
        name: "Remote",
        driver,
        database: "shop",
        host: "db.example.com",
        port: 33306,
        username: "shop_user",
        password: "test-only",
        rememberPassword: true,
      };
      nativeInvoke.mockResolvedValue({ ...config, connected: true });
      const runner = await import("../src/components/editor/queryRunner");
      await runner.connectDatabase(config);
      expect(nativeInvoke).toHaveBeenCalledWith("connect_database", { config });
      nativeInvoke.mockResolvedValue(42);
      expect(await runner.testConnection(config)).toBe(42);
      expect(nativeInvoke).toHaveBeenLastCalledWith("test_connection", {
        config: { ...config, rememberPassword: false },
      });
      expect(FakeWorker.instances).toHaveLength(0);
    },
  );
  it("never simulates a successful remote test in the browser", async () => {
    const runner = await import("../src/components/editor/queryRunner");
    const config = {
      id: "remote",
      name: "Remote",
      driver: "mariadb" as const,
      database: "shop",
      host: "db.example.com",
    };
    await expect(runner.testConnection(config)).rejects.toThrow(/desktop app/);
    await expect(runner.connectDatabase(config)).rejects.toThrow(/desktop app/);
    expect(nativeInvoke).not.toHaveBeenCalled();
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it("shares initialization across React StrictMode callers", async () => {
    const runner = await import("../src/components/editor/queryRunner");
    const first = runner.initializeDemo();
    const second = runner.initializeDemo();
    expect(first).toBe(second);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].messages).toHaveLength(1);
    const info = {
      id: "demo",
      name: "Astral playground",
      driver: "sqlite",
      database: "astral_demo.sqlite",
      connected: true,
    };
    FakeWorker.instances[0].reply(0, info);
    expect(await first).toEqual(info);
  });

  it("settles pending work on cancellation and isolates the replacement worker", async () => {
    const runner = await import("../src/components/editor/queryRunner");
    const query = runner.runQuery("demo", "SELECT 1", 1000, "cancel-me");
    const schema = runner.getSchema("demo");
    const queryFailure = expect(query).rejects.toThrow(/last saved database/);
    const schemaFailure = expect(schema).rejects.toThrow(/last saved database/);
    const old = FakeWorker.instances[0];
    await runner.cancelQuery("cancel-me");
    await Promise.all([queryFailure, schemaFailure]);
    expect(old.terminated).toBe(true);

    const replacement = runner.runQuery("demo", "SELECT 2");
    expect(FakeWorker.instances).toHaveLength(2);
    old.onerror?.({ message: "An error delivered after termination" });
    const current = FakeWorker.instances[1];
    expect(current.terminated).toBe(false);
    const result = {
      columns: [{ name: "2", dataType: "INTEGER" }],
      rows: [[2]],
      rowsAffected: 0,
      elapsedMs: 1,
      truncated: false,
    };
    current.reply(0, result);
    expect(await replacement).toEqual(result);
  });

  it("does not interrupt unrelated work for an unknown cancellation identifier", async () => {
    const runner = await import("../src/components/editor/queryRunner");
    const query = runner.runQuery("demo", "SELECT 1", 999999, "running");
    const worker = FakeWorker.instances[0];
    expect(worker.messages[0].maxRows).toBe(10000);
    await runner.cancelQuery("unknown");
    expect(worker.terminated).toBe(false);
    worker.reply(0, { rows: [[1]] });
    await query;
  });

  it("rejects browser network connections without spawning fake connections", async () => {
    const runner = await import("../src/components/editor/queryRunner");
    await expect(
      runner.connectDatabase({
        id: "remote",
        name: "remote",
        driver: "postgres",
        database: "app",
      }),
    ).rejects.toThrow(/desktop app/);
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("turns native string failures into consistent Error objects", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    nativeInvoke.mockRejectedValue("Database authentication failed");
    const runner = await import("../src/components/editor/queryRunner");
    expect(runner.isDesktop).toBe(true);
    await expect(runner.runQuery("remote", "SELECT 1")).rejects.toThrow(
      "Database authentication failed",
    );
    expect(nativeInvoke).toHaveBeenCalledWith(
      "execute_query",
      expect.objectContaining({
        connectionId: "remote",
        sql: "SELECT 1",
        maxRows: 1000,
      }),
    );
  });

  it("reconnects a native profile using its stable id without requiring a plaintext password", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    const profile = {
      id: "stable-keychain-id",
      name: "Saved database",
      driver: "postgres" as const,
      database: "shop",
      host: "localhost",
      username: "astral",
      rememberPassword: true,
    };
    nativeInvoke.mockResolvedValue({ ...profile, connected: true });
    const runner = await import("../src/components/editor/queryRunner");
    const connection = await runner.connectDatabase(profile);
    expect(connection.id).toBe(profile.id);
    expect(nativeInvoke).toHaveBeenCalledWith("connect_database", {
      config: profile,
    });
    expect(nativeInvoke.mock.calls[0][1].config).not.toHaveProperty("password");
    nativeInvoke.mockResolvedValue(undefined);
    await runner.disconnectDatabase(profile.id);
    expect(nativeInvoke).toHaveBeenLastCalledWith("disconnect_database", {
      connectionId: profile.id,
    });
  });
});
