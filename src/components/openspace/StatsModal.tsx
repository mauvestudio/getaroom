import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, BarChart3, CalendarDays, Clock3, Coins, Gauge, Layers3, MessageSquareText, RefreshCw, Timer, X } from "lucide-react";
import { useRoom } from "../../context/RoomContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { projectGroup } from "../../lib/project-groups";
import { calculateUsageMetrics, filterUsageSessions, formatDuration, previousUsageRange, type UsageSession, type UsageUniverse } from "../../lib/stats/usage-stats";
import { cn } from "../../lib/utils";
import { PressButton } from "../ui/button";

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? NaN, (month ?? NaN) - 1, day ?? NaN);
}

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function StatsModal({ initialTargetId, onClose }: { initialTargetId?: string; onClose: () => void }) {
  const { agents: roomAgents, sessionsOf } = useRoom();
  const { allAgents, workspaces, projects, refreshAgents, refreshWorkspaces } = useWorkspace();
  const [targetId, setTargetId] = useState(initialTargetId || "all");
  const [universe, setUniverse] = useState<"all" | UsageUniverse>("all");
  const defaultTo = new Date();
  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  const [fromValue, setFromValue] = useState(dateInputValue(defaultFrom));
  const [toValue, setToValue] = useState(dateInputValue(defaultTo));
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { sessions, targets } = useMemo(() => {
    const entries: UsageSession[] = [];
    const targetEntries = new Map<string, { id: string; name: string; universe: UsageUniverse }>();
    const roomSessionIds = new Set<string>();
    for (const agent of roomAgents) {
      const agentSessions = sessionsOf(agent);
      targetEntries.set(agent.id, { id: agent.id, name: agent.name, universe: "room" });
      for (const session of agentSessions) {
        roomSessionIds.add(session.id);
        entries.push({
          id: session.id, universe: "room", targetId: agent.id, targetName: agent.name,
          createdAt: session.createdAt, updatedAt: session.updatedAt, status: session.status,
          turnsCount: session.turnsCount,
          inputTokens: session.tokenUsage?.inputTokens ?? session.lastUsage?.inputTokens,
          outputTokens: session.tokenUsage?.outputTokens ?? session.lastUsage?.outputTokens,
          costUsd: session.tokenUsage?.totalCostUsd ?? session.lastUsage?.totalCostUsd,
        });
      }
    }
    for (const session of allAgents) {
      if (roomSessionIds.has(session.id)) continue;
      const workspace = workspaces.find((item) => item.id === session.workspaceId);
      const project = workspace?.projectId ? projects.find((item) => item.id === workspace.projectId) : undefined;
      const group = projectGroup(workspace?.path || project?.rootPath || session.cwd);
      const targetKey = project?.id || group;
      const targetName = project?.name || (group === "mauve" ? "Mauve" : group === "perso" ? "Perso" : "Autres projets");
      targetEntries.set(targetKey, { id: targetKey, name: targetName, universe: "studio" });
      entries.push({
        id: session.id, universe: "studio", targetId: targetKey, targetName,
        createdAt: session.createdAt, updatedAt: session.updatedAt, status: session.status,
        turnsCount: session.turnsCount,
        inputTokens: session.tokenUsage?.inputTokens ?? session.lastUsage?.inputTokens,
        outputTokens: session.tokenUsage?.outputTokens ?? session.lastUsage?.outputTokens,
        costUsd: session.tokenUsage?.totalCostUsd ?? session.lastUsage?.totalCostUsd,
      });
    }
    return { sessions: entries, targets: [...targetEntries.values()].sort((a, b) => a.name.localeCompare(b.name, "fr")) };
  }, [roomAgents, sessionsOf, allAgents, workspaces, projects, refreshKey]);

  const range = useMemo(() => ({ from: parseDate(fromValue), to: parseDate(toValue) }), [fromValue, toValue]);
  const scopedSessions = useMemo(() => filterUsageSessions(sessions, range, { targetId: targetId === "all" ? undefined : targetId, universe }), [sessions, range, targetId, universe]);
  const current = useMemo(() => calculateUsageMetrics(scopedSessions, range), [scopedSessions, range]);
  const previousRange = useMemo(() => previousUsageRange(range), [range]);
  const previousSessions = useMemo(() => filterUsageSessions(sessions, previousRange, { targetId: targetId === "all" ? undefined : targetId, universe }), [sessions, previousRange, targetId, universe]);
  const previous = useMemo(() => calculateUsageMetrics(previousSessions, previousRange), [previousSessions, previousRange]);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([refreshAgents(), refreshWorkspaces()]); setRefreshKey((key) => key + 1); }
    finally { setRefreshing(false); }
  };

  const kpis = [
    { label: "Temps ouvert", value: formatDuration(current.openMs), Icon: Clock3, detail: "Durée cumulée des sessions" },
    { label: "Actif", value: formatDuration(current.activeMs), Icon: Activity, detail: "Sessions en cours, estimé", accent: true },
    { label: "Inactif", value: formatDuration(current.idleMs), Icon: Timer, detail: "Attente estimée" },
    { label: "Agents actifs moy.", value: current.averageConcurrent.toFixed(1), Icon: Gauge, detail: "Simultanéité estimée" },
    { label: "Prompts / Tours", value: current.prompts.toLocaleString("fr-FR"), Icon: MessageSquareText, detail: "Tours remontés par Paseo" },
    { label: "Sessions ouvertes", value: current.sessions.toLocaleString("fr-FR"), Icon: Layers3, detail: "Sessions créées sur la période" },
    { label: "Tokens", value: current.tokens.toLocaleString("fr-FR"), Icon: Coins, detail: "Total d’usage exposé" },
    { label: "Coût estimé", value: current.costUsd === null ? "Indisponible" : `$${current.costUsd.toFixed(2)}`, Icon: BarChart3, detail: current.costUsd === null ? "Facturation non remontée" : "Usage remonté par le provider" },
  ];

  const tableRows = [
    { label: "Période", current: `${dateLabel(range.from)} – ${dateLabel(range.to)}`, previous: `${dateLabel(previousRange.from)} – ${dateLabel(previousRange.to)}` },
    { label: "Sessions / Tâches traitées", current: current.sessions.toLocaleString("fr-FR"), previous: previous.sessions.toLocaleString("fr-FR") },
    { label: "Tours / Prompts", current: current.prompts.toLocaleString("fr-FR"), previous: previous.prompts.toLocaleString("fr-FR") },
    { label: "Tokens / Coût attribuable", current: `${current.tokens.toLocaleString("fr-FR")} tokens · ${current.costUsd === null ? "Indisponible" : `$${current.costUsd.toFixed(2)}`}`, previous: `${previous.tokens.toLocaleString("fr-FR")} tokens · ${previous.costUsd === null ? "Indisponible" : `$${previous.costUsd.toFixed(2)}`}` },
  ];

  // Portail : sans lui, le z-index reste enfermé dans la zone principale et la sidebar recouvre la modale.
  return createPortal(<div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/75 p-2 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="stats-title" className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[22px] border border-border bg-background shadow-xl">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><BarChart3 className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><h2 id="stats-title" className="text-lg font-semibold tracking-tight text-foreground">Statistiques & Activité</h2><p className="text-xs text-muted-foreground">Paseo · mesures issues des sessions disponibles</p></div>
        <PressButton onPress={onClose} aria-label="Fermer les statistiques" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></PressButton>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-4 sm:p-6">
        <section aria-labelledby="activity-title">
          <div className="mb-3 flex items-center justify-between"><h3 id="activity-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activité</h3><span className="font-mono text-[10px] text-muted-foreground">{scopedSessions.length} session{scopedSessions.length === 1 ? "" : "s"} analysée{scopedSessions.length === 1 ? "" : "s"}</span></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {kpis.map(({ label, value, Icon, detail, accent }) => <article key={label} className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[10px]">{label}</span><Icon className={cn("h-3.5 w-3.5 shrink-0", accent ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} /></div>
              <p className={cn("mt-2 truncate text-lg font-bold tracking-tight sm:text-xl", accent && "text-emerald-700 dark:text-emerald-400", value === "Indisponible" && "text-sm text-muted-foreground")}>{value}</p>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">{detail}</p>
            </article>)}
          </div>
        </section>

        <section aria-labelledby="efficiency-title">
          <div className="mb-3 flex items-center justify-between"><div><h3 id="efficiency-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Efficacité</h3><p className="mt-1 text-xs text-muted-foreground">Compare la période sélectionnée à la précédente.</p></div><span className="hidden items-center gap-1 text-[10px] text-muted-foreground sm:flex"><CalendarDays className="h-3 w-3" />Plage personnalisée</span></div>
          <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_1fr_auto] sm:p-4">
            <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cible<select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-xs font-medium normal-case tracking-normal text-foreground"><option value="all">Tous</option>{targets.map((target) => <option key={target.id} value={target.id}>{target.name} · {target.universe === "room" ? "ROOM" : "PROJETS"}</option>)}</select></label>
            <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Univers<select value={universe} onChange={(e) => setUniverse(e.target.value as "all" | UsageUniverse)} className="h-10 rounded-lg border border-border bg-background px-2 text-xs font-medium normal-case tracking-normal text-foreground"><option value="all">Tous</option><option value="room">ROOM (Hermes • Unraid)</option><option value="studio">PROJETS (Studio & Dev)</option></select></label>
            <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Du<input type="date" value={fromValue} max={toValue} onChange={(e) => setFromValue(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 font-mono text-xs text-foreground" /></label>
            <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Au<input type="date" value={toValue} min={fromValue} max={dateInputValue(new Date())} onChange={(e) => setToValue(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 font-mono text-xs text-foreground" /></label>
            <PressButton onPress={() => void onRefresh()} disabled={refreshing} className="mt-auto flex h-10 items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-xs font-semibold text-secondary-foreground disabled:opacity-50"><RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />Actualiser</PressButton>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto"><table className="w-full min-w-[620px] border-collapse text-left text-xs">
              <thead className="bg-muted/70 text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-3 font-semibold sm:px-4">Métrique</th><th className="px-3 py-3 font-semibold sm:px-4">Période sélectionnée</th><th className="px-3 py-3 font-semibold sm:px-4">Période précédente</th></tr></thead>
              <tbody>{tableRows.map((row) => <tr key={row.label} className="border-t border-border"><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium text-foreground sm:px-4">{row.label}</th><td className="px-3 py-3 font-mono text-foreground sm:px-4">{row.current}</td><td className="px-3 py-3 font-mono text-muted-foreground sm:px-4">{row.previous}</td></tr>)}</tbody>
            </table></div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Les temps actif/inactif et la simultanéité sont estimés depuis les horodatages des sessions. Les coûts restent indisponibles si le provider ne transmet aucune donnée de facturation.</p>
        </section>
      </div>
    </section>
  </div>, document.body);
}
