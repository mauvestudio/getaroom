import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Code2,
  FolderGit2,
  Bot,
  Zap,
  Search,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  PlayCircle,
  Inbox,
  GitBranch,
  GitPullRequest,
} from "lucide-react";
import { useRoom } from "../../context/RoomContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useMode } from "../../context/ModeContext";
import { projectGroup } from "../../lib/project-groups";
import { roomProviderLabel } from "../../lib/room-provider-label";
import { type LiveStatus } from "../../lib/room-status";
import { timeAgo } from "../../lib/time";
import { cn } from "../../lib/utils";
import { LiveBadge } from "../room/LiveBadge";
import { PressButton, PressTarget } from "../ui/button";
import { StatsModal } from "./StatsModal";
import { HermesStatusBadge } from "../ui/HermesStatusBadge";
import { usePaseo } from "../../context/PaseoContext";
import type { GitStatusSummary } from "../../lib/paseo/types";
import { githubRemoteLabel } from "../../lib/paseo/git-status";

type ScopeFilter = "all" | "room" | "studio";

interface OpenSpaceItem {
  key: string;
  kind: "room" | "studio";
  id: string;
  name: string;
  subTitle: string;
  avatarUrl?: string;
  accentColor: string;
  universe: "room" | "mauve" | "perso";
  universeLabel: string;
  identityLabel?: string;
  identityProviderId?: string;
  identityHostId?: string;
  model?: string;
  effort?: string;
  status: LiveStatus;
  previewText?: string;
  previewTime?: number | string;
  tokensCount?: number;
  statsTargetId: string;
  stats?: Array<{ label: string; value: string }>;
  projectId?: string;
  workspaceId?: string;
  gitStatus?: GitStatusSummary;
  hasSession?: boolean;
  open: () => void;
}

const COLUMNS: Array<{
  id: LiveStatus;
  label: string;
  subLabel: string;
  colorClass: string;
  badgeClass: string;
  borderClass: string;
  Icon: typeof AlertTriangle;
}> = [
  {
    id: "approval",
    label: "À répondre",
    subLabel: "Validation requise",
    colorClass: "text-amber-600 dark:text-amber-400",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    borderClass: "border-amber-500/40",
    Icon: AlertTriangle,
  },
  {
    id: "working",
    label: "Au travail",
    subLabel: "En cours d'exécution",
    colorClass: "text-purple-600 dark:text-purple-400",
    badgeClass: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
    borderClass: "border-purple-500/40",
    Icon: PlayCircle,
  },
  {
    id: "review",
    label: "À relire",
    subLabel: "Tâches terminées",
    colorClass: "text-sky-600 dark:text-sky-400",
    badgeClass: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    borderClass: "border-sky-500/40",
    Icon: CheckCircle2,
  },
  {
    id: "idle",
    label: "Disponibles",
    subLabel: "Prêts pour instruction",
    colorClass: "text-muted-foreground",
    badgeClass: "bg-muted text-muted-foreground border-border",
    borderClass: "border-border/60",
    Icon: Clock,
  },
];

export function OpenSpaceHome() {
  const { agents: roomAgents, statusOf, sessionsOf, openAgent } = useRoom();
  const { allAgents: studioAgents, workspaces, projects, models, setActiveAgentId, setActiveWorkspaceId } = useWorkspace();
  const { getClientForHost, getHostState } = usePaseo();
  const { setMode } = useMode();

  const [scope, setScope] = useState<ScopeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statsTargetId, setStatsTargetId] = useState<string | undefined>();
  const [statsOpen, setStatsOpen] = useState(false);
  const [projectGitStatuses, setProjectGitStatuses] = useState<Record<string, GitStatusSummary>>({});
  const localClient = getClientForHost("local");
  const localConnected = getHostState("local") === "connected";

  useEffect(() => {
    if (!localConnected || !localClient) {
      setProjectGitStatuses({});
      return;
    }
    let cancelled = false;
    const check = async () => {
      for (let index = 0; index < projects.length && !cancelled; index += 4) {
        await Promise.all(projects.slice(index, index + 4).map(async (project) => {
          if (!project.rootPath) return;
          try {
            const status = await localClient.getGitStatus(project.rootPath, undefined, false);
            if (!cancelled) setProjectGitStatuses((current) => ({ ...current, [project.id]: status }));
          } catch { /* Un projet inaccessible n'affiche aucune action Git. */ }
        }));
      }
    };
    void check();
    return () => { cancelled = true; };
  }, [projects, localClient, localConnected]);

  // Transformation des agents et sessions
  const allItems = useMemo<OpenSpaceItem[]>(() => {
    const list: OpenSpaceItem[] = [];

    // 1. Agents de ROOM (Paseo ACP)
    for (const a of roomAgents) {
      const st = statusOf(a);
      const sessions = [...sessionsOf(a)].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
      const last = sessions[0];

      list.push({
        key: `room-${a.id}`,
        kind: "room",
        id: a.id,
        statsTargetId: a.id,
        name: a.name,
        subTitle: a.role,
        avatarUrl: a.avatarUrl,
        accentColor: a.accentColor,
        universe: "room",
        universeLabel: "ROOM",
        identityLabel: a.paseo.providerLabel || roomProviderLabel(last?.provider || a.paseo.provider, models),
        identityProviderId: a.paseo.provider,
        identityHostId: a.paseo.hostId,
        model: last?.model || a.paseo.model || undefined,
        stats: [
          { label: "Sessions aujourd’hui", value: String(sessions.filter((session) => new Date(session.createdAt).toDateString() === new Date().toDateString()).length) },
          { label: "Tours traités", value: String(sessions.reduce((total, session) => total + (session.turnsCount || 0), 0)) },
        ],
        effort: undefined,
        status: st,
        previewText: last?.title || last?.name || "Prêt pour une nouvelle tâche.",
        previewTime: last?.updatedAt,
        tokensCount: undefined,
        open: () => {
          setMode("room");
          openAgent(a.id);
        },
      });
    }

    // 2. Sessions de PROJETS (Studio Dev local)
    for (const s of studioAgents) {
      if (s.hostId && s.hostId !== "local") continue;
      const ws = workspaces.find((w) => w.id === s.workspaceId);
      const p = ws?.projectId ? projects.find((proj) => proj.id === ws.projectId) : undefined;
      const rootPath = ws?.path || p?.rootPath;
      const group = projectGroup(rootPath);
      const universe = group === "mauve" ? "mauve" : "perso";
      const universeLabel = group === "mauve" ? "Mauve" : "Perso";

      const st: LiveStatus =
        (s.pendingPermissions?.length ?? 0) > 0
          ? "approval"
          : s.status === "running"
            ? "working"
            : s.requiresAttention && s.attentionReason === "finished"
              ? "review"
              : "idle";

      const tokens =
        s.tokenUsage?.contextWindowUsedTokens ||
        s.lastUsage?.contextWindowUsedTokens ||
        s.tokenUsage?.inputTokens;

      const effort = s.thinkingOptionId || s.effectiveThinkingOptionId;

      list.push({
        key: `studio-${s.id}`,
        kind: "studio",
        id: s.id,
        statsTargetId: p?.id || group,
        projectId: p?.id,
        workspaceId: s.workspaceId,
        name: s.title || s.name || "Session sans titre",
        subTitle: p?.name || ws?.name || "Projet local",
        avatarUrl: undefined,
        accentColor: universe === "mauve" ? "#D97706" : "#6366F1",
        universe,
        universeLabel,
        model: s.model || undefined,
        stats: [
          { label: "Sessions aujourd’hui", value: new Date(s.createdAt).toDateString() === new Date().toDateString() ? "1" : "0" },
          { label: "Tours traités", value: String(s.turnsCount || 0) },
        ],
        effort: effort ? String(effort) : undefined,
        status: st,
        previewText: s.attentionReason || undefined,
        previewTime: s.updatedAt || s.createdAt,
        tokensCount: tokens,
        open: () => {
          setMode("studio");
          if (s.workspaceId) setActiveWorkspaceId(s.workspaceId);
          setActiveAgentId(s.id);
        },
      });
    }

    return list;
  }, [roomAgents, studioAgents, statusOf, sessionsOf, workspaces, projects, models, openAgent, setActiveAgentId, setActiveWorkspaceId, setMode]);

  // Filtrage par recherche
  const filteredItems = useMemo(() => {
    let result = allItems;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.subTitle.toLowerCase().includes(q) ||
          (i.model && i.model.toLowerCase().includes(q)) ||
          (i.identityLabel && i.identityLabel.toLowerCase().includes(q)) ||
          (i.previewText && i.previewText.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [allItems, searchQuery]);

  // Séparation ROOM et PROJETS
  const roomItems = useMemo(
    () => filteredItems.filter((i) => i.kind === "room"),
    [filteredItems],
  );
  const studioItems = useMemo(() => {
    const sessions = allItems.filter((item) => item.kind === "studio");
    const used = new Set<string>();
    const cards: OpenSpaceItem[] = [];
    const makeCard = (id: string, name: string, rootPath: string | undefined, matches: OpenSpaceItem[], workspaceId?: string) => {
      matches.forEach((item) => used.add(item.key));
      const recent = [...matches].sort((a, b) => new Date(b.previewTime || 0).getTime() - new Date(a.previewTime || 0).getTime())[0];
      const group = projectGroup(rootPath);
      const universe = group === "mauve" ? "mauve" : "perso";
      const status = recent?.status || "idle";
      cards.push({
        key: `project-${id}`, kind: "studio", id, statsTargetId: id,
        name, subTitle: recent?.name || "Aucune session récente",
        accentColor: universe === "mauve" ? "#D97706" : "#6366F1",
        universe, universeLabel: universe === "mauve" ? "Mauve" : "Perso",
        model: recent?.model, status, hasSession: Boolean(recent),
        previewText: recent?.name, previewTime: recent?.previewTime,
        gitStatus: projectGitStatuses[id],
        stats: [
          { label: "Sessions", value: String(matches.length) },
          { label: "Tours traités", value: String(matches.reduce((total, item) => total + Number(item.stats?.[1]?.value || 0), 0)) },
        ],
        open: () => {
          if (recent) { recent.open(); return; }
          setMode("studio");
          setActiveWorkspaceId(workspaceId || null);
          setActiveAgentId(null);
        },
      });
    };
    for (const project of projects) {
      const matches = sessions.filter((item) => item.projectId === project.id);
      const workspace = workspaces.find((item) => item.projectId === project.id);
      makeCard(project.id, project.name, project.rootPath, matches, workspace?.id);
    }
    for (const session of sessions) {
      if (used.has(session.key)) continue;
      const workspace = workspaces.find((item) => item.id === session.workspaceId);
      const siblings = sessions.filter((item) => !used.has(item.key) && item.workspaceId === session.workspaceId);
      makeCard(workspace?.id || session.id, workspace?.name || session.subTitle, workspace?.path, siblings, workspace?.id);
    }
    cards.sort((a, b) => new Date(b.previewTime || 0).getTime() - new Date(a.previewTime || 0).getTime());
    const query = searchQuery.toLowerCase().trim();
    return query ? cards.filter((item) => [item.name, item.subTitle, item.model, item.universeLabel, item.gitStatus?.branch, item.gitStatus?.hasGithubRemote ? "github" : ""].some((value) => value?.toLowerCase().includes(query))) : cards;
  }, [allItems, projects, workspaces, projectGitStatuses, searchQuery, setMode, setActiveWorkspaceId, setActiveAgentId]);

  const totalWorking = useMemo(
    () => allItems.filter((i) => i.status === "working" || i.status === "approval").length,
    [allItems],
  );

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1720px]">
      {/* Barre supérieure : Titre, recherche et filtres */}
      <div className="mb-6 flex flex-col gap-4 border-b border-border/40 pb-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Open Space</h1>
              {totalWorking > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                  <Zap className="h-3 w-3" />
                  {totalWorking} en action
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Agents, projets et actions à suivre réunis au même endroit</p>
          </div>

          {/* Filtres de périmètre compacts */}
          <div className="flex flex-wrap items-center gap-2 self-start xl:self-auto">
          <PressButton onPress={() => { setStatsTargetId(undefined); setStatsOpen(true); }} className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground"><BarChart3 className="h-3.5 w-3.5" />Statistiques</PressButton>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/80 border border-border/60" role="tablist">
            {(
              [
                { id: "all", label: "Tous", count: roomAgents.length + studioItems.length },
                { id: "room", label: "ROOM", count: allItems.filter((i) => i.kind === "room").length },
                { id: "studio", label: "PROJETS", count: studioItems.length },
              ] as const
            ).map((t) => (
              <PressButton
                key={t.id}
                role="tab"
                aria-selected={scope === t.id}
                onPress={() => setScope(t.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors touch-manipulation",
                  scope === t.id
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{t.label}</span>
                <span className="text-[10px] opacity-75">({t.count})</span>
              </PressButton>
            ))}
          </div>
          </div>
        </div>

        {/* Barre de recherche rapide */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, rôle, projet ou modèle…"
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-card border border-border/80 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-8">
      {(scope === "all" || scope === "room") && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Bot className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                ROOM — Agents
              </h2>
              <span className="text-xs text-muted-foreground">· Agents Hermes • Unraid via ACP</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {roomItems.length} agent{roomItems.length > 1 ? "s" : ""}
            </span>
          </div>

          <LargeCardsGrid items={roomItems} onStats={(targetId) => { setStatsTargetId(targetId); setStatsOpen(true); }} />
        </section>
      )}

      {(scope === "all" || scope === "studio") && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                <Code2 className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                PROJETS — Studio & Dev
              </h2>
              <span className="text-xs text-muted-foreground">· Dépôts locaux & terminal PTY Mac</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {studioItems.length} projet{studioItems.length > 1 ? "s" : ""}
            </span>
          </div>

          <LargeCardsGrid items={studioItems} onStats={(targetId) => { setStatsTargetId(targetId); setStatsOpen(true); }} />
        </section>
      )}
        </div>
        <aside className="space-y-3" aria-label="File d’attention">
          <h2 className="border-b border-border/60 pb-2 text-sm font-bold text-foreground">À surveiller</h2>
          {COLUMNS.filter((column) => column.id !== "idle").map((column) => {
            const entries = filteredItems.filter((item) => item.status === column.id);
            return <section key={column.id} className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-semibold"><column.Icon className={cn("h-3.5 w-3.5", column.colorClass)} />{column.label}</span><span className={cn("rounded-full border px-2 py-0.5 font-mono text-[10px]", column.badgeClass)}>{entries.length}</span></div>
              <div className="space-y-1.5">{entries.length ? entries.map((item) => <AttentionCard key={item.key} item={item} />) : <p className="px-1 py-2 text-[11px] text-muted-foreground">Rien à signaler</p>}</div>
            </section>;
          })}
        </aside>
      </div>
      {statsOpen && <StatsModal initialTargetId={statsTargetId} onClose={() => setStatsOpen(false)} />}
      </div>
    </div>
  );
}

function LargeCardsGrid({ items, onStats }: { items: OpenSpaceItem[]; onStats: (targetId: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{items.map((item) => <OpenSpaceCard key={item.key} item={item} onStats={() => onStats(item.statsTargetId)} />)}{!items.length && <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Aucun élément pour ce filtre.</p>}</div>
  );
}

function AttentionCard({ item }: { item: OpenSpaceItem }) {
  return <PressTarget onPress={item.open} className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-card p-2 text-left cursor-pointer touch-manipulation hover:border-foreground/30">
    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.accentColor }} />
    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-foreground">{item.name}</span><span className="block truncate text-[10px] text-muted-foreground">{item.subTitle}</span></span>
    <span className="text-[10px] text-muted-foreground">{timeAgo(item.previewTime)}</span>
  </PressTarget>;
}

/** Fiche d'agent horizontale, centrée dans la grille Bento. */
function OpenSpaceCard({ item, onStats }: { item: OpenSpaceItem; onStats: () => void }) {
  const isWorking = item.status === "working";
  const isApproval = item.status === "approval";

  if (item.kind === "room") {
    return (
      <PressTarget
        onPress={item.open}
        className="open-space-agent-card group relative isolate flex min-h-[260px] w-full flex-col overflow-hidden rounded-[22px] border p-5 text-left cursor-pointer touch-manipulation"
        style={{
          "--agent-accent": item.accentColor,
          "--agent-tint": `${item.accentColor}30`,
          "--agent-glow": `${item.accentColor}28`,
          "--agent-border": `${item.accentColor}70`,
          "--agent-sheen": `${item.accentColor}18`,
        } as CSSProperties}
      >
        <div className="relative z-10 flex items-start justify-between gap-2">
          <HermesStatusBadge providerId={item.identityProviderId} hostId={item.identityHostId} providerLabel={item.identityLabel} compact />
          <LiveBadge status={item.status} accent={item.accentColor} className="shrink-0" />
        </div>
        <div className="relative z-10 flex min-h-0 flex-1 items-center gap-5 py-4">
          <span className="open-space-agent-portrait flex h-32 w-32 shrink-0 items-end justify-center overflow-hidden rounded-[28px] border sm:h-36 sm:w-36">
            <img src={item.avatarUrl} alt="" className="h-[94%] w-[94%] pointer-events-none object-contain drop-shadow-xl" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xl font-semibold tracking-tight text-foreground">{item.name}</h3>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.subTitle}</p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
              {(item.stats || []).map((stat) => <span key={stat.label} className="text-[11px] text-muted-foreground">{stat.label} <strong className="font-mono font-semibold text-foreground">{stat.value}</strong></span>)}
            </div>
          </div>
        </div>
        <div className="relative z-10 flex min-w-0 items-center justify-between gap-3 border-t border-border/60 pt-3">
          <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{item.model || "Modèle non renseigné"}</span>
          <PressButton onPress={onStats} className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-card/70 px-2.5 text-[11px] font-semibold text-foreground backdrop-blur-sm"><BarChart3 className="h-3.5 w-3.5" />Voir les stats</PressButton>
        </div>
      </PressTarget>
    );
  }

  return (
    <PressTarget
      onPress={item.open}
      className={cn(
        "group flex min-h-[190px] flex-col justify-between rounded-[22px] border bg-card p-4 cursor-pointer transition-all duration-150 touch-manipulation hover:border-foreground/40 hover:shadow-sm",
        isApproval
          ? "border-amber-500/50 bg-amber-500/[0.03]"
          : isWorking
            ? "border-purple-500/40"
            : "border-border/80",
      )}
      style={{
        borderColor: isWorking ? `${item.accentColor}66` : undefined,
      }}
    >
      <div>
        {/* Ligne d'univers + Statut */}
        <div className="flex items-center justify-between gap-1.5 mb-2">
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[8px] font-bold tracking-normal",
              item.universe === "mauve"
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                  : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30",
            )}
          >
            {item.universeLabel}
          </span>

          <div className="flex min-w-0 items-center gap-1.5">
            {item.gitStatus?.isGitRepo && <span className="inline-flex max-w-28 items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground" title={`Branche ${item.gitStatus.branch}`}><GitBranch className="h-3 w-3 shrink-0" /><span className="truncate">{item.gitStatus.branch}</span></span>}
            {item.gitStatus?.hasGithubRemote && <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-semibold text-foreground" title={`Remote GitHub configuré : ${githubRemoteLabel(item.gitStatus.remoteUrl) || "dépôt distant"}`}><GitPullRequest className="h-3 w-3" />GitHub</span>}
            {item.hasSession && <LiveBadge status={item.status} accent={item.accentColor} className="shrink-0 whitespace-nowrap" />}
          </div>
        </div>

        {/* Identité : Avatar / Icône + Nom */}
        <div className="flex items-start gap-2.5 mb-2.5">
          {item.avatarUrl ? (
            <span
            className="flex h-14 w-14 shrink-0 items-end justify-center overflow-hidden rounded-xl"
              style={{ backgroundColor: `${item.accentColor}26` }}
            >
              <img src={item.avatarUrl} alt="" className="h-12 pointer-events-none object-contain" />
            </span>
          ) : (
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${item.accentColor}20` }}
            >
              <FolderGit2 className="h-6 w-6 text-foreground" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
              {item.name}
            </h3>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dernière session</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.subTitle}</p>
          </div>
        </div>
      </div>

      {/* Pied de carte : Modèle & Horodatage */}
      <div className="flex flex-col gap-1 pt-2 border-t border-border/30 font-mono text-[10px] text-muted-foreground/80">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate max-w-[140px]">
            {item.model || "Modèle indisponible"}
          </span>
          {item.previewTime && <span className="shrink-0">{timeAgo(item.previewTime)}</span>}
        </div>
        <PressButton onPress={onStats} className="mt-1 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-muted/60 font-sans text-[11px] font-semibold text-foreground hover:bg-muted"><BarChart3 className="h-3.5 w-3.5" />Voir les stats</PressButton>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {(item.stats || []).map((stat) => <span key={stat.label} className="font-sans text-[10px] text-muted-foreground">{stat.label}: <strong className="font-mono text-foreground">{stat.value}</strong></span>)}
        </div>
      </div>
    </PressTarget>
  );
}
