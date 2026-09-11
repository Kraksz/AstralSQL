import { describe, expect, it } from "vitest";
import {
  connectionFromForm,
  normalizeServerHost,
} from "../src/lib/connectionForm";

describe("local and remote SQL connection details", () => {
  it.each([
    "localhost",
    "10.0.0.5",
    "203.0.113.10",
    "db.example.com",
    "::1",
    "2001:db8::1",
  ])("accepts SQL host %s", (host) => {
    expect(normalizeServerHost(host)).toBe(host);
  });
  it("normalizes whitespace and bracketed IPv6", () => {
    expect(normalizeServerHost(" [2001:db8::1] ")).toBe("2001:db8::1");
  });
  it.each([
    "https://host.example/phpmyadmin",
    "host.example:3306",
    "db.example/path",
    "user@host",
    "bad host",
    "::invalid",
    "",
  ])("rejects a URL or malformed host %s", (host) => {
    expect(() => normalizeServerHost(host)).toThrow();
  });
  it.each(["mysql", "mariadb", "postgres"] as const)(
    "preserves remote credentials and uses safe defaults for %s",
    (driver) => {
      const form = new FormData();
      for (const [key, value] of Object.entries({
        name: "Remote shop",
        host: "db.example.com",
        database: "shop",
        username: "shop_user",
        password: "  spaces are significant  ",
      }))
        form.set(key, value);
      expect(connectionFromForm(form, driver)).toMatchObject({
        driver,
        host: "db.example.com",
        port: driver === "postgres" ? 5432 : 3306,
        password: "  spaces are significant  ",
        sslMode: "verify-full",
        rememberPassword: false,
      });
      form.set("port", "33306");
      expect(connectionFromForm(form, driver).port).toBe(33306);
      form.set("port", "70000");
      expect(() => connectionFromForm(form, driver)).toThrow(/Port/);
    },
  );
});
