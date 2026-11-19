/** Fichiers présentés dans le tiroir : Markdown et texte brut. */
export const isDocumentName = (name: string) => /\.(md|markdown|txt)$/i.test(name);

/** Dossiers explorés : on évite les dépendances, les builds et les dossiers cachés. */
export const shouldDescend = (name: string) =>
  !name.startsWith(".") &&
  !["node_modules", "dist", "build", "out", "coverage", "vendor"].includes(name);

export interface RoomDocument {
  id: string;
  name: string;
  title: string;
  content: string;
  modifiedAt: string;
  size: number;
  source: "conversation" | "workspace";
  threadId?: string;
  threadTitle?: string;
}

/**
 * Extrait les documents et artefacts Markdown produits ou cités
 * dans les messages d'un fil de conversation (aucun scan disque local).
 */
export function extractDocumentsFromMessages(
  messages: Array<{ id: string; role: string; content: string; createdAt?: number }>,
  threadTitle?: string,
  threadId?: string,
): RoomDocument[] {
  const docs: RoomDocument[] = [];
  const seenTitles = new Set<string>();

  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.content?.trim()) continue;
    const content = msg.content;
    const dateStr = msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString();

    // 1. Recherche de blocs de code markdown explicites ```markdown ... ``` ou ```md ... ```
    const codeBlockRegex = /```(?:markdown|md)\s*(?:[^\n]*\b([a-zA-Z0-9_\-./]+\.md)\b)?\n([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    let blockIndex = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      blockIndex++;
      const explicitFilename = match[1];
      const blockContent = match[2]?.trim();
      if (!blockContent) continue;

      // Cherche un titre # dans le bloc
      const titleMatch = /^#\s+(.+)$/m.exec(blockContent);
      const title = titleMatch && titleMatch[1] ? titleMatch[1].trim() : (explicitFilename || `Artefact Markdown ${blockIndex}`);
      const filename = explicitFilename || `${slugifyTitle(title)}.md`;

      if (!seenTitles.has(filename)) {
        seenTitles.add(filename);
        docs.push({
          id: `${msg.id}-block-${blockIndex}`,
          name: filename,
          title,
          content: blockContent,
          modifiedAt: dateStr,
          size: new TextEncoder().encode(blockContent).length,
          source: "conversation",
          threadId,
          threadTitle,
        });
      }
    }

    // 2. Si aucun bloc de code explicite n'a été extrait et que le message entier est un document Markdown structuré (titre #)
    if (blockIndex === 0) {
      const mainTitleMatch = /^#\s+([^\n]+)/m.exec(content);
      if (mainTitleMatch && mainTitleMatch[1] && content.length > 50) {
        const title = mainTitleMatch[1].trim();
        const filename = `${slugifyTitle(title)}.md`;

        if (!seenTitles.has(filename)) {
          seenTitles.add(filename);
          docs.push({
            id: `${msg.id}-doc`,
            name: filename,
            title,
            content: content.trim(),
            modifiedAt: dateStr,
            size: new TextEncoder().encode(content).length,
            source: "conversation",
            threadId,
            threadTitle,
          });
        }
      }
    }
  }

  return docs;
}

function slugifyTitle(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "document";
}
