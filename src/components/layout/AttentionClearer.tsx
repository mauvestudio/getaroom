// Comme dans Paseo : la pastille verte « terminé » d'une session disparaît quand on l'ouvre.
import { useEffect, useRef } from "react";
import { usePaseo } from "../../context/PaseoContext";
import { useMode } from "../../context/ModeContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useSessionView } from "../../context/SessionViewContext";
import { sessionVisual } from "../../lib/session-visual";

const READ_DELAY_MS = 800;

export function AttentionClearer() {
  const { client } = usePaseo();
  const { mode } = useMode();
  const { viewMode } = useSessionView();
  const { activeAgentId, allAgents } = useWorkspace();
  const cleared = useRef(new Set<string>());
  const active = allAgents.find((agent) => agent.id === activeAgentId);
  const finished = sessionVisual(active) === "finished";
  // La conversation est réellement à l'écran : Dev ou Room, vue discussion.
  const onScreen = (mode === "studio" || mode === "room") && viewMode === "discussion";

  useEffect(() => {
    if (!activeAgentId || !finished || !onScreen) return;
    if (cleared.current.has(activeAgentId)) return;
    const id = activeAgentId;
    const markRead = () => {
      if (document.hidden || !document.hasFocus()) return;
      cleared.current.add(id);
      void client.clearAgentAttention(id).catch(() => { cleared.current.delete(id); });
    };
    const timer = window.setTimeout(markRead, READ_DELAY_MS);
    window.addEventListener("focus", markRead);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", markRead);
    };
  }, [activeAgentId, finished, onScreen, client]);

  // Une session qui repasse en cours pourra à nouveau être marquée comme lue à sa prochaine fin.
  useEffect(() => {
    for (const id of [...cleared.current]) {
      const session = allAgents.find((agent) => agent.id === id);
      if (session && sessionVisual(session) !== "finished") cleared.current.delete(id);
    }
  }, [allAgents]);

  return null;
}
