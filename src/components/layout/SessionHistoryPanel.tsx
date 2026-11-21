import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, X } from "lucide-react";
import { usePaseo } from "../../context/PaseoContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import {
  groupHistoryByDate, sessionActivityAt, type HistoryDateSection, type HistorySession, type HistorySort,
} from "../../lib/paseo/agent-history";
import { sessionVisual } from "../../lib/session-visual";
import { timeAgo } from "../../lib/time";
import { useAgentHistory } from "../../lib/useAgentHistory";
import { cn } from "../../lib/utils";
import { SessionStatusIcon } from "../ui/SessionStatusIcon";
import { PressButton } from "../ui/button";

const SEARCH_DEBOUNCE_MS = 250;
const SECTION_LABEL: Record<HistoryDateSection, string> = {
  today: "Aujourd’hui",
  yesterday: "Hier",
  thisWeek: "Cette semaine",
  thisMonth: "Ce mois-ci",
  older: "Plus anciens",
};
const selectClass = "h-7 min-w-0 flex-1 rounded-md border border-border/60 bg-background/60 px-1.5 text-[11px] text-muted-foreground outline-none focus-visible:border-ring";

function HistoryRow({ session, active, pending, showHost, resuming, onOpen, onResume }: {
  session: HistorySession;
  active: boolean;
  pending: boolean;
  showHost: boolean;
  resuming: boolean;
  onOpen: () => void;
  onResume: () => void;
}) {
  const place = [session.projectName || session.cwd?.split("/").filter(Boolean).pop(), session.branch, showHost ? session.hostLabel : null].filter(Boolean).join(" · ");
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
          active ? "bg-muted/70 text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
        )}
      >
        <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <SessionStatusIcon state={sessionVisual(session, pending)} idle={<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-foreground">{session.title || "Nouvelle session"}</span>
            {session.archivedAt && <span className="shrink-0 rounded-full border border-border bg-[var(--surface-3)] px-1.5 text-[10px] leading-4 text-muted-foreground">Archivé</span>}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted-foreground/80">
            <span className="truncate">{place}</span>
            <span className="shrink-0 font-mono">{timeAgo(sessionActivityAt(session))}</span>
          </span>
        </span>
      </button>
      {session.archivedAt && (
        <PressButton
          type="button"
          onPress={onResume}
          disabled={resuming}
          aria-label={`Reprendre ${session.title || "la session"}`}
          className={cn(
            "absolute right-1 top-1 flex h-6 items-center gap-1 rounded-md border border-border bg-sidebar px-2 text-[10px] font-medium text-foreground transition-opacity hover:bg-muted disabled:opacity-60",
            !resuming && "opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
          )}
        >
          {resuming && <Loader2 className="h-3 w-3 animate-spin" />}
          Reprendre
        </PressButton>
      )}
    </li>
  );
}

/** Vue Historique de la sidebar : mêmes données et mêmes sections que l'écran Historique de Paseo. */
export function SessionHistoryPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { hosts } = usePaseo();
  const { activeAgentId, pendingPermissions, openHistorySession, resumeArchivedSession } = useWorkspace();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<HistorySort>("activity");
  const [hostId, setHostId] = useState("all");
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState("");

  const enabledHosts = useMemo(() => hosts.filter((host) => host.enabled), [hosts]);
  const scopedHost = enabledHosts.some((host) => host.id === hostId) ? hostId : undefined;
  const history = useAgentHistory({ search, sort, hostId: scopedHost });
  const pendingIds = useMemo(() => new Set(pendingPermissions.map((entry) => entry.agentId)), [pendingPermissions]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input]);

  const searching = Boolean(search && history.isSearchSupported);
  // Un résultat de recherche ou un tri non chronologique n'a pas de sections de date.
  const groups = useMemo(
    () => sort === "activity" && !searching ? groupHistoryByDate(history.sessions) : [{ section: null, sessions: history.sessions }],
    [history.sessions, searching, sort],
  );

  const open = (session: HistorySession) => {
    openHistorySession(session);
    onNavigate?.();
  };

  const resume = async (session: HistorySession) => {
    setResumingId(session.id);
    setResumeError("");
    try {
      await resumeArchivedSession(session);
      onNavigate?.();
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : "Impossible de reprendre cette session.");
    } finally {
      setResumingId(null);
    }
  };

  return (
    <section aria-label="Historique" className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-1.5 border-b border-border/40 px-3 py-2">
        {history.isSearchSupported && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Rechercher dans l’historique"
              aria-label="Rechercher dans l’historique"
              className="box-border h-8 w-full rounded-md border border-border/60 bg-background/60 pl-7 pr-7 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
            />
            {input && (
              <button type="button" onClick={() => setInput("")} aria-label="Effacer la recherche" className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <select value={sort} onChange={(event) => setSort(event.target.value as HistorySort)} aria-label="Trier l’historique" disabled={searching} className={selectClass}>
            <option value="activity">Activité récente</option>
            <option value="created">Date de création</option>
            <option value="title">Titre</option>
          </select>
          {enabledHosts.length > 1 && (
            <select value={scopedHost ?? "all"} onChange={(event) => setHostId(event.target.value)} aria-label="Filtrer par hôte" className={selectClass}>
              <option value="all">Tous les hôtes</option>
              {enabledHosts.map((host) => <option key={host.id} value={host.id}>{host.name}</option>)}
            </select>
          )}
          <PressButton type="button" onPress={() => void history.reload()} disabled={history.isLoading} aria-label="Actualiser l’historique" title="Actualiser l’historique" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
            <RefreshCw className={cn("h-3.5 w-3.5 pointer-events-none", history.isLoading && "animate-spin")} />
          </PressButton>
        </div>
      </div>

      <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {(resumeError || history.error) && <p role="alert" className="mb-2 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">{resumeError || history.error}</p>}
        {history.hostErrors.map((entry) => <p key={entry.hostId} role="status" className="mb-1 px-2 text-[10px] text-muted-foreground">{`${entry.hostLabel} · Impossible de charger l’historique`}</p>)}

        {history.isInitialLoad && <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Chargement…</div>}
        {history.loaded && !history.isLoading && !history.error && history.hostErrors.length === 0 && history.sessions.length === 0 && (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">{searching ? "Aucune session correspondante" : "Aucune session pour l’instant"}</p>
        )}

        <div className={cn("space-y-3 transition-opacity", history.isLoading && history.sessions.length > 0 && "opacity-60")}>
          {groups.map((group) => (
            <div key={group.section ?? "results"}>
              {group.section && <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{SECTION_LABEL[group.section]}</h3>}
              <ul className="space-y-0.5">
                {group.sessions.map((session) => (
                  <HistoryRow
                    key={session.id}
                    session={session}
                    active={session.id === activeAgentId}
                    pending={pendingIds.has(session.id)}
                    showHost={enabledHosts.length > 1}
                    resuming={resumingId === session.id}
                    onOpen={() => open(session)}
                    onResume={() => void resume(session)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>

        {history.isSearchTruncated ? (
          <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">Trop de résultats, affinez la recherche</p>
        ) : history.hasMore && (
          <PressButton type="button" onPress={() => void history.loadMore()} disabled={history.isLoadingMore} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60">
            {history.isLoadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
            Charger plus
          </PressButton>
        )}
      </div>
    </section>
  );
}
