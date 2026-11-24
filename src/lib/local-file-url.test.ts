import { describe, expect, test } from "bun:test";
import { fileUriToPath, localFilePath } from "./local-file-url";

describe("sources d'images locales", () => {
  test("file:// → chemin décodé", () => {
    expect(fileUriToPath("file:///var/folders/7x/T/paseo-attachments-abc/h.png")).toBe("/var/folders/7x/T/paseo-attachments-abc/h.png");
    expect(fileUriToPath("file:///Users/me/Mon%20Dossier/a.png?x=1#y")).toBe("/Users/me/Mon Dossier/a.png");
    expect(fileUriToPath("file:///C:/Users/me/a.png")).toBe("C:/Users/me/a.png");
  });
  test("reconnaît les fichiers du démon, pas les URL web", () => {
    expect(localFilePath("file:///tmp/a.png")).toBe("/tmp/a.png");
    expect(localFilePath("/tmp/a.png")).toBe("/tmp/a.png");
    expect(localFilePath("https://example.com/a.png")).toBeNull();
    expect(localFilePath("data:image/png;base64,AAAA")).toBeNull();
    expect(localFilePath("blob:http://x/1")).toBeNull();
    expect(localFilePath("//cdn.example.com/a.png")).toBeNull();
    expect(localFilePath("")).toBeNull();
    expect(localFilePath(undefined)).toBeNull();
  });
});

import { urlTransform } from "../components/chat/MarkdownRenderer";
describe("urlTransform du markdown", () => {
  test("garde file:// pour les images, filtre le reste", () => {
    expect(urlTransform("file:///tmp/a.png", "src")).toBe("file:///tmp/a.png");
    expect(urlTransform("file:///tmp/a.png", "href")).toBe("");
    expect(urlTransform("javascript:alert(1)", "href")).toBe("");
    expect(urlTransform("javascript:alert(1)", "src")).toBe("");
    expect(urlTransform("https://example.com/a.png", "src")).toBe("https://example.com/a.png");
  });
});
