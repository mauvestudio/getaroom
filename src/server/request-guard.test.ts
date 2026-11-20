import { afterEach, describe, expect, test } from "bun:test";
import { guardRoutes, isTrustedRequest } from "./request-guard";

const request = (headers: Record<string, string>, method = "POST") =>
  new Request("http://127.0.0.1:5555/api/test", { method, headers });

afterEach(() => {
  delete process.env.GETAROOM_LOOPBACK_ONLY;
  delete process.env.GETAROOM_ALLOWED_ORIGINS;
});

describe("isTrustedRequest", () => {
  test("accepte l'origine identique au Host", () => {
    expect(isTrustedRequest(request({ host: "127.0.0.1:5555", origin: "http://127.0.0.1:5555" }))).toBe(true);
  });

  test("accepte un client natif sans Origin", () => {
    expect(isTrustedRequest(request({ host: "127.0.0.1:5555" }))).toBe(true);
  });

  test("refuse un site tiers (CSWSH / CSRF)", () => {
    expect(isTrustedRequest(request({ host: "127.0.0.1:5555", origin: "https://evil.example" }))).toBe(false);
    expect(isTrustedRequest(request({ host: "127.0.0.1:5555", origin: "null" }))).toBe(false);
    expect(isTrustedRequest(request({ host: "127.0.0.1:5555", "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  test("autorise les origines déclarées explicitement", () => {
    process.env.GETAROOM_ALLOWED_ORIGINS = "https://room.example.net/";
    expect(isTrustedRequest(request({ host: "127.0.0.1:5555", origin: "https://room.example.net" }))).toBe(true);
  });

  test("bloque le DNS rebinding en mode loopback-only", () => {
    process.env.GETAROOM_LOOPBACK_ONLY = "1";
    expect(isTrustedRequest(request({ host: "evil.example:5555", origin: "http://evil.example:5555" }))).toBe(false);
    expect(isTrustedRequest(request({ host: "localhost:5555", origin: "http://localhost:5555" }))).toBe(true);
  });
});

describe("guardRoutes", () => {
  const routes = guardRoutes({
    "/api/x": { GET: () => new Response("get"), POST: () => new Response("post") },
    "/static": new Response("static"),
  });

  test("laisse passer les GET et bloque les POST inter-origines", async () => {
    const evil = { host: "127.0.0.1:5555", origin: "https://evil.example" };
    expect(await (routes["/api/x"].GET as (r: Request) => Response)(request(evil, "GET")).text()).toBe("get");
    expect((routes["/api/x"].POST as (r: Request) => Response)(request(evil)).status).toBe(403);
    expect(routes["/static"]).toBeInstanceOf(Response);
  });
});
