import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText, History, LayoutGrid } from "lucide-react";
import { useRoom } from "../../context/RoomContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useSessionView } from "../../context/SessionViewContext";
import { useMode } from "../../context/ModeContext";
import type { PublicAgent } from "../../config/agents";
import { deriveStatus } from "../../lib/room-status";
import { cn } from "../../lib/utils";
import { ChatTimeline } from "../chat/ChatTimeline";
import { PromptComposer } from "../composer/PromptComposer";
import { PressButton } from "../ui/button";
import { DocumentsDrawer } from "./DocumentsDrawer";
import { LiveBadge } from "./LiveBadge";
import { ThreadRail, type ThreadItem } from "./ThreadRail";
import { SessionViewSwitch } from "../session/SessionViewSwitch";
import { RoomTerminalView } from "./RoomTerminalView";
import { roomProviderLabel } from "../../lib/room-provider-label";
import { HermesStatusBadge } from "../ui/HermesStatusBadge";
import { SessionGitControls } from "../layout/SessionGitControls";
import { TheRoomCanvas } from "./TheRoomCanvas";
import { VisualHistoryButton } from "../chat/VisualHistoryButton";
import { useAgentHistory } from "../../lib/useAgentHistory";
import type { HistorySession } from "../../lib/paseo/agent-history";
import { ErrorBoundary } from "../ui/error-boundary";

function PaseoConversation({ agent, activeId }: { agent: PublicAgent; activeId: string | null }) {
  const { providers, models, setActiveAgentId, setActiveWorkspaceId } = useWorkspace();
  const { sessionsOf } = useRoom();
  const provider = agent.paseo.provider;
  const available = providers.some((item) => item.id === provider && item.enabled &&
    (!agent.paseo.hostId || item.hostId === agent.paseo.hostId));
  const providerModels = models.filter((model) => model.agentProvider === provider);
  const defaultModel = agent.paseo.model || providerModels[0]?.id;
  const active = sessionsOf(agent).find((session) => session.id === activeId) ?? null;
  const syncedAgentId = useRef<string | null | undefined>(undefined);
  const syncedWorkspaceId = useRef<string | null>(null);

  useEffect(() => {
    // WorkspaceContext setters change identity as live events update the agent and
    // timeline. Reapplying setActiveAgentId on every update clears the timeline.
    const nextWorkspaceId = active?.workspaceId || agent.paseo.workspaceId || null;
    if (nextWorkspaceId && syncedWorkspaceId.current !== nextWorkspaceId) {
      syncedWorkspaceId.current = nextWorkspaceId;
      setActiveWorkspaceId(nextWorkspaceId);
    }
    const nextAgentId = active?.id ?? null;
    if (syncedAgentId.current !== nextAgentId) {
      syncedAgentId.current = nextAgentId;
      setActiveAgentId(nextAgentId);
    }
    // The active session already publishes its model and reasoning via Paseo.
    // newSessionOptions below carries the defaults for a new session.
  }, [active?.id, active?.workspaceId, agent.paseo.workspaceId, setActiveAgentId, setActiveWorkspaceId]);

  const newSessionOptions = provider ? {
    provider,
    model: defaultModel,
    hostId: agent.paseo.hostId,
    workspaceId: agent.paseo.workspaceId,
    reasoning: agent.paseo.reasoning,
    preamble: [`Rôle : ${agent.name} — ${agent.role}`, agent.paseo.instructions?.trim()].filter(Boolean).join("\n"),
  } : undefined;
  return <div className="flex min-h-0 flex-1 flex-col">
    {active ? <ChatTimeline /> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm font-medium text-foreground">Écris à {agent.name}</p>
      <p className="max-w-sm text-xs text-muted-foreground">La session Paseo sera créée automatiquement à l’envoi de ton premier message.</p>
      {!available && <p role="status" className="text-xs text-muted-foreground">Aucun provider ACP actif n’est associé à cet agent pour le moment.</p>}
    </div>}
    {(active || available) && <PromptComposer modelProvider={provider} newSessionOptions={active ? undefined : newSessionOptions} />}
  </div>;
}

export function AgentSpace({ agent }: { agent: PublicAgent }) {
  const { agents, statusOf, openHome, threadId, setThreadId, sessionsOf, approvalsOf } = useRoom();
  const { models, resumeArchivedSession } = useWorkspace();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState("");
  const history = useAgentHistory({ enabled: historyOpen, hostId: agent.paseo.hostId });
  // Mêmes critères que les fils actifs de l'agent (sessionsOf), limités aux archivés.
  const archived = useMemo(() => {
    const provider = agent.paseo.provider?.toLocaleLowerCase();
    return history.sessions.filter((session) => session.archivedAt && session.provider?.toLocaleLowerCase() === provider
      && (!agent.paseo.workspaceId || session.workspaceId === agent.paseo.workspaceId));
  }, [history.sessions, agent.paseo.provider, agent.paseo.workspaceId]);
  const { hasMore, isLoading: historyLoading, isLoadingMore, loadMore } = history;
  // Les archivés de cet agent peuvent se trouver au-delà de la première page.
  useEffect(() => {
    if (historyOpen && archived.length === 0 && hasMore && !historyLoading && !isLoadingMore) void loadMore();
  }, [historyOpen, archived.length, hasMore, historyLoading, isLoadingMore, loadMore]);
  const { viewMode } = useSessionView();
  const { setMode } = useMode();
  const status = statusOf(agent);
  const [docsOpen, setDocsOpen] = useState(false);
  const [draft, setDraft] = useState(false);
  const draftBaselineIds = useRef<Set<string> | null>(null);
  const sessions = sessionsOf(agent);
  const pending = approvalsOf(agent);
  const items: ThreadItem[] = useMemo(() => [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((s) => ({
    id: s.id, title: s.title || s.name || "Nouveau fil", at: s.updatedAt,
    status: deriveStatus([s], pending.some((p) => p.agentId === s.id)),
  })), [sessions, pending]);
  const stored = threadId(agent.id);
  const activeId = draft ? null : items.some((i) => i.id === stored) ? stored : items[0]?.id ?? null;
  const activeSession = sessions.find((session) => session.id === activeId);
  const providerModels = models.filter((model) => model.agentProvider === agent.paseo.provider);
  const modelLabel = activeSession?.model || agent.paseo.model || providerModels[0]?.id;
  const activeAgents = agents.filter((candidate) => statusOf(candidate) !== "idle").length;
  useEffect(() => {
    if (!draft || !draftBaselineIds.current) return;
    const created = sessions.find((session) => !draftBaselineIds.current?.has(session.id));
    if (!created) return;
    draftBaselineIds.current = null;
    setThreadId(agent.id, created.id);
    setDraft(false);
  }, [draft, sessions, agent.id, setThreadId]);
  const newThread = () => { draftBaselineIds.current = new Set(sessions.map((session) => session.id)); setDraft(true); setThreadId(agent.id, null); };
  const selectThread = (id: string) => { draftBaselineIds.current = null; setDraft(false); setThreadId(agent.id, id); };
  const resume = async (session: HistorySession) => {
    setResumingId(session.id);
    setResumeError("");
    try {
      await resumeArchivedSession(session);
      selectThread(session.id);
      setHistoryOpen(false);
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : "Impossible de reprendre ce fil.");
    } finally {
      setResumingId(null);
    }
  };
  return <div className="flex min-h-0 flex-1 flex-col">
    <header data-tauri-drag-region className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 sm:gap-2.5 sm:px-4">
      <PressButton onPress={openHome} aria-label="Retour à la vue d'ensemble" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground cursor-pointer touch-manipulation"><ArrowLeft className="h-4 w-4 pointer-events-none" /></PressButton>
      <span className="flex h-9 w-9 shrink-0 items-end justify-center overflow-hidden rounded-lg" style={{ backgroundColor: `${agent.accentColor}1f` }}><img src={agent.avatarUrl} alt="" className="h-8 w-8 pointer-events-none object-contain" /></span>
      <div className="min-w-[140px] flex-[1_1_140px]"><div className="flex items-baseline gap-2"><h1 className="truncate text-sm font-semibold leading-tight text-foreground">{agent.name}</h1><LiveBadge status={status} accent={agent.accentColor} className="shrink-0" /></div><div className="truncate text-[11px] text-muted-foreground">{agent.role}</div></div>
      <div className="flex items-center gap-1.5">
        <HermesStatusBadge providerId={agent.paseo.provider} hostId={agent.paseo.hostId} providerLabel={agent.paseo.providerLabel || roomProviderLabel(activeSession?.provider || agent.paseo.provider, models)} compact />
        {modelLabel && <span className="hidden truncate font-mono text-[10px] text-muted-foreground md:inline">{modelLabel}</span>}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <SessionGitControls room session={activeSession} />
        <SessionViewSwitch activeAgents={activeAgents} />
        <VisualHistoryButton className="h-8 w-8" />
        <PressButton onPress={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen} aria-label="Historique des fils" title="Historique des fils" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><History className="h-4 w-4" /></PressButton>
        <PressButton onPress={() => setDocsOpen((v) => !v)} aria-pressed={docsOpen} aria-label="Documents" title="Documents" className={cn("flex h-8 w-8 items-center justify-center rounded-md", docsOpen ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}><FileText className="h-4 w-4 pointer-events-none" /></PressButton>
        <PressButton onPress={() => setMode("openspace")} aria-label="Ouvrir Open Space" title="Ouvrir Open Space" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><LayoutGrid className="h-4 w-4 pointer-events-none" /></PressButton>
      </div>
    </header>
    {historyOpen && <section aria-label="Fils archivés" className="max-h-48 shrink-0 overflow-auto border-b border-border p-3">
      {(resumeError || history.error) && <p role="alert" className="pb-1 text-xs text-destructive">{resumeError || history.error}</p>}
      {history.hostErrors.map((entry) => <p key={entry.hostId} role="status" className="pb-1 text-[10px] text-muted-foreground">{`${entry.hostLabel} · Impossible de charger l’historique`}</p>)}
      {(historyLoading || isLoadingMore) && archived.length === 0 && <p role="status" className="text-xs text-muted-foreground">Chargement de l’historique…</p>}
      {history.loaded && !historyLoading && !isLoadingMore && !hasMore && !history.error && history.hostErrors.length === 0 && archived.length === 0 && <p role="status" className="text-xs text-muted-foreground">Aucun fil archivé pour cet agent.</p>}
      {archived.map((session) => <div key={session.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-xs">
        <span className="min-w-0 truncate">{session.title || session.name || "Fil sans titre"} <span className="text-muted-foreground">· {session.hostLabel}</span></span>
        <PressButton disabled={resumingId !== null} onPress={() => void resume(session)} className="rounded-lg border border-border px-3 py-2 disabled:opacity-50">{resumingId === session.id ? "Reprise…" : "Reprendre"}</PressButton>
      </div>)}
      {hasMore && archived.length > 0 && <PressButton disabled={isLoadingMore} onPress={() => void loadMore()} className="mt-1 w-full rounded-md py-1.5 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-50">Charger plus</PressButton>}
    </section>}
    <div className="flex min-h-0 flex-1">
      <ThreadRail layout="rail" items={items} activeId={activeId} accent={agent.accentColor} onSelect={selectThread} onNew={newThread} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ThreadRail layout="chips" items={items} activeId={activeId} accent={agent.accentColor} onSelect={selectThread} onNew={newThread} />
        <div className={cn("min-h-0 flex-1 flex-col", viewMode === "discussion" ? "flex" : "hidden")}>
          <PaseoConversation agent={agent} activeId={activeId} />
        </div>
        <div className={cn("min-h-0 flex-1", viewMode === "terminal" ? "flex" : "hidden")}>
          <RoomTerminalView agent={agent} threadId={activeId} />
        </div>
        <div className={cn("min-h-0 flex-1", viewMode === "the-room" ? "block" : "hidden")}>
          <ErrorBoundary resetKey={agent.id}>
            <TheRoomCanvas active={viewMode === "the-room"} />
          </ErrorBoundary>
        </div>
      </div>
      {docsOpen && <DocumentsDrawer agent={agent} activeThreadId={activeId} refreshToken={status} onClose={() => setDocsOpen(false)} />}
    </div>
  </div>;
}
