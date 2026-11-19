import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, RefreshCw, X } from "lucide-react";
import type { PublicAgent } from "../../config/agents";
import { useRoom } from "../../context/RoomContext";
import { usePaseo } from "../../context/PaseoContext";
import { timeAgo } from "../../lib/time";
import { cn } from "../../lib/utils";
import { MarkdownRenderer } from "../chat/MarkdownRenderer";
import { PressButton, PressTarget } from "../ui/button";
import {
  extractDocumentsFromMessages,
  type RoomDocument,
} from "./documents-utils";

interface Props {
  agent: PublicAgent;
  activeThreadId?: string | null;
  refreshToken?: string;
  onClose: () => void;
}

export function DocumentsDrawer({ agent, activeThreadId, refreshToken, onClose }: Props) {
  const { client } = usePaseo();
  const { sessionsOf } = useRoom();
  const [docs, setDocs] = useState<RoomDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<RoomDocument | null>(null);
  const seq = useRef(0);

  const scan = useCallback(async () => {
    const my = ++seq.current;
    setError(null);

    try {
      const sessions = sessionsOf(agent).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const targets = activeThreadId ? sessions.filter((s) => s.id === activeThreadId) : sessions.slice(0, 5);
      const allDocs: RoomDocument[] = [];
      for (const session of targets) {
        const result = await client.fetchAgentTimeline(session.id).catch(() => null);
        const messages = (result?.entries ?? []).flatMap((entry: any) => {
          if (entry.type === "assistant_message") return [{ id: entry.messageId || `${session.id}-${entry.timestamp}`, role: "assistant", content: entry.text, createdAt: entry.timestamp ? new Date(entry.timestamp).getTime() : undefined }];
          if (entry.type === "user_message") return [{ id: entry.messageId || `${session.id}-${entry.timestamp}`, role: "user", content: entry.text, createdAt: entry.timestamp ? new Date(entry.timestamp).getTime() : undefined }];
          return [];
        });
        allDocs.push(...extractDocumentsFromMessages(messages, session.title || session.name, session.id));
      }
      if (my === seq.current) setDocs(allDocs.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)));
    } catch (e) {
      if (my === seq.current) {
        setError(e instanceof Error ? e.message : String(e));
        setDocs([]);
      }
    }
  }, [agent, activeThreadId, client, sessionsOf]);

  useEffect(() => {
    setOpenDoc(null);
    setDocs(null);
    void scan();
  }, [scan, refreshToken]);

  return (
    <aside
      aria-label="Documents"
      className="fixed inset-0 z-40 flex flex-col bg-background md:static md:z-auto md:w-80 md:shrink-0 md:border-l md:border-border lg:w-96"
    >
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        {openDoc ? (
          <PressButton
            onPress={() => setOpenDoc(null)}
            aria-label="Retour à la liste"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground cursor-pointer touch-manipulation"
          >
            <ArrowLeft className="h-4 w-4 pointer-events-none" />
          </PressButton>
        ) : null}
        <h2 className="flex-1 truncate px-1 text-sm font-semibold text-foreground">
          {openDoc ? openDoc.name : "Documents"}
        </h2>
        {!openDoc && (
          <PressButton
            onPress={() => void scan()}
            aria-label="Actualiser"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground cursor-pointer touch-manipulation"
          >
            <RefreshCw className="h-4 w-4 pointer-events-none" />
          </PressButton>
        )}
        <PressButton
          onPress={onClose}
          aria-label="Fermer les documents"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground cursor-pointer touch-manipulation"
        >
          <X className="h-4 w-4 pointer-events-none" />
        </PressButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {openDoc ? (
          <div className="p-4">
            <div className="mb-3 border-b border-border/60 pb-2">
              <p className="font-mono text-[11px] text-muted-foreground break-all">
                {openDoc.name} · {timeAgo(openDoc.modifiedAt)}
              </p>
              {openDoc.threadTitle && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Issu de : <span className="font-medium text-foreground">{openDoc.threadTitle}</span>
                </p>
              )}
            </div>
            <MarkdownRenderer content={openDoc.content} />
          </div>
        ) : docs === null ? (
          <p className="p-4 text-sm text-muted-foreground">Recherche des documents et artefacts…</p>
        ) : (
          <>
            {error && <p role="alert" className="p-4 text-sm text-destructive">{error}</p>}
            {!error && docs.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground leading-relaxed">
                Aucun document ou artefact Markdown dans les échanges pour l'instant. Les guides, fiches et articles produits apparaîtront ici automatiquement.
              </p>
            )}
            <ul className="p-2 space-y-1">
              {docs.map((d) => {
                const recent = Date.now() - new Date(d.modifiedAt).getTime() < 7_200_000;
                return (
                  <li key={d.id}>
                    <PressTarget
                      onPress={() => setOpenDoc(d)}
                      className="flex cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2.5 hover:bg-accent/40 touch-manipulation transition-colors"
                    >
                      <FileText
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          recent ? "text-foreground" : "text-muted-foreground",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{d.title || d.name}</span>
                          {recent && (
                            <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-foreground">
                              Récent
                            </span>
                          )}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {d.name} · {timeAgo(d.modifiedAt)}
                        </span>
                      </span>
                    </PressTarget>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
