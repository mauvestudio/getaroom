import { expect, test } from "bun:test";
import {
  isDocumentName,
  shouldDescend,
  extractDocumentsFromMessages,
} from "./documents-utils";

test("types de documents et dossiers explorés", () => {
  expect(["a.md", "B.MARKDOWN", "n.txt"].every(isDocumentName)).toBe(true);
  expect(["a.png", "md", "a.md.bak"].some(isDocumentName)).toBe(false);
  expect(shouldDescend("notes")).toBe(true);
  expect(["node_modules", ".git", "dist"].some(shouldDescend)).toBe(false);
});

test("extraction de documents markdown à partir des messages", () => {
  const messages = [
    {
      id: "m1",
      role: "user",
      content: "Peux-tu rédiger le guide de maintenance WordPress ?",
      createdAt: 1700000000000,
    },
    {
      id: "m2",
      role: "assistant",
      content:
        "# Guide de Maintenance WordPress\n\nVoici le protocole complet de mise à jour des plugins...",
      createdAt: 1700000001000,
    },
    {
      id: "m3",
      role: "assistant",
      content:
        "J'ai préparé la fiche technique :\n\n```markdown checklist.md\n# Checklist Sécurité\n- Vérifier les sauvegardes\n- Mettre à jour PHP\n```\n\nEt voilà !",
      createdAt: 1700000002000,
    },
  ];

  const docs = extractDocumentsFromMessages(messages, "Fil Maintenance", "t1");
  expect(docs.length).toBe(2);
  expect(docs[0]?.name).toBe("guide-de-maintenance-wordpress.md");
  expect(docs[0]?.title).toBe("Guide de Maintenance WordPress");
  expect(docs[0]?.source).toBe("conversation");
  expect(docs[1]?.name).toBe("checklist.md");
  expect(docs[1]?.title).toBe("Checklist Sécurité");
  expect(docs[1]?.content).toContain("- Vérifier les sauvegardes");
});
