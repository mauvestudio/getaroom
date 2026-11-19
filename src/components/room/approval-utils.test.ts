import { expect, test } from "bun:test";
import { describeApproval, pickChoices, toResponse } from "./approval-utils";

const req = (o: object) => ({ id: "1", provider: "claude", name: "x", kind: "tool", ...o }) as any;

test("décrit une commande, une modification et une création", () => {
  expect(describeApproval(req({ detail: { type: "shell", command: "rm -rf dist" } }))).toMatchObject({ kind: "shell", subject: "rm -rf dist" });
  const e = describeApproval(req({ detail: { type: "edit", filePath: "a.md", unifiedDiff: "-a\n+b" } }));
  expect(e).toMatchObject({ kind: "edit", subject: "a.md", preview: "-a\n+b" });
  expect(describeApproval(req({ detail: { type: "write", filePath: "n.md", content: "x" } })).title).toContain("Créer");
  expect(describeApproval(req({ name: "WebFetch" })).kind).toBe("other");
});

test("tronque les longs aperçus", () => {
  const long = Array.from({ length: 40 }, (_, i) => `l${i}`).join("\n");
  const v = describeApproval(req({ detail: { type: "edit", filePath: "a", unifiedDiff: long } }));
  expect(v.preview!.split("\n").length).toBe(15);
  expect(v.preview).toContain("26 lignes de plus");
});

test("choix des boutons : défaut et actions fournies", () => {
  const d = pickChoices(undefined);
  expect([d.deny.id, d.allow.id, d.always?.id]).toEqual(["deny", "allow_once", "allow_always"]);
  const c = pickChoices([
    { id: "no", label: "Non", behavior: "deny" }, { id: "yes", label: "Oui", behavior: "allow", variant: "primary" },
  ]);
  expect([c.deny.id, c.allow.id, c.always]).toEqual(["no", "yes", null]);
});

test("réponses : jamais d'approbation implicite", () => {
  expect(toResponse({ id: "deny", label: "", behavior: "deny" })).toMatchObject({ behavior: "deny" });
  expect(toResponse({ id: "allow_once", label: "", behavior: "allow" })).toEqual({ behavior: "allow", selectedActionId: "allow_once" });
});
