import { expect, test } from "bun:test";
import { publicHost, withoutSecrets } from "./profile-api";

test("un profil portable standard exclut tous les caches de jetons", () => {
  const preferences = withoutSecrets({
    "getaroom-language": "fr",
    "amble-paseo-token": "private-token",
    "getaroom-paseo-hosts-v1": '[{"token":"private-token"}]',
    "getaroom-sync-path": "/home/example/private.json",
  });
  expect(preferences).toEqual({ "getaroom-language": "fr" });
  const host = publicHost({ id: "remote", name: "Remote", url: "wss://user:pass@example.com/ws", token: "private-token", enabled: true });
  expect(host.token).toBeUndefined();
  expect(host.url).toBe("wss://example.com/ws");
});
