import { BarChart3, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useRoom } from "../../context/RoomContext";
import type { PublicAgent } from "../../config/agents";
import { timeAgo } from "../../lib/time";
import { cn } from "../../lib/utils";
import { PressButton, PressTarget } from "../ui/button";
import { ApprovalCard } from "./ApprovalCard";
import { LiveBadge } from "./LiveBadge";
import { StatsModal } from "../openspace/StatsModal";
import { HermesStatusBadge } from "../ui/HermesStatusBadge";

const CARD = "rounded-[22px] border border-border bg-card";

function useLastThread(agent: PublicAgent) {
  const { sessionsOf } = useRoom();
  const sessions = [...sessionsOf(agent)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const last = sessions[0];
  return {
    count: sessions.length,
    title: last?.title ?? last?.name ?? null,
    preview: null,
    at: last?.updatedAt ?? null,
    model: last?.model ?? null,
  };
}

function AgentCard({ agent }: { agent: PublicAgent }) {
  const { statusOf, openAgent } = useRoom();
  const st = statusOf(agent);
  const [statsOpen, setStatsOpen] = useState(false);
  const last = useLastThread(agent);
  const providerLabel = agent.paseo.providerLabel || "Hermes • Unraid";
  const isWorking = st === "working";
  const isApproval = st === "approval";

  return (
    <>
    <PressTarget
      onPress={() => openAgent(agent.id)}
      className={cn(
        CARD,
        "group flex h-[370px] flex-col justify-between overflow-hidden p-5 cursor-pointer transition-all duration-200 touch-manipulation hover:border-foreground/30 hover:shadow-md",
        isApproval
          ? "border-amber-500/50 shadow-sm bg-amber-500/5"
          : isWorking
            ? "border-border shadow-sm"
            : "border-border",
      )}
      style={{
        borderColor: isWorking ? `${agent.accentColor}66` : undefined,
        boxShadow: isWorking ? `0 0 28px ${agent.accentColor}18` : undefined,
      }}
    >
      {/* Haut : Statut en direct + Avatar & Nom */}
      <div>
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <LiveBadge status={st} accent={agent.accentColor} className="whitespace-nowrap" />
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{last.count} {last.count > 1 ? "fils" : "fil"}</span>
          </div>
          <HermesStatusBadge providerId={agent.paseo.provider} hostId={agent.paseo.hostId} providerLabel={providerLabel} />
        </div>

        <div className="flex items-center gap-4">
          <span
            className="flex h-24 w-24 shrink-0 items-end justify-center overflow-hidden rounded-2xl border"
            style={{ background: `radial-gradient(circle at 50% 25%, ${agent.accentColor}4d, ${agent.accentColor}12 75%)`, borderColor: `${agent.accentColor}55` }}
          >
            <img src={agent.avatarUrl} alt="" className="h-[90px] w-[90px] pointer-events-none object-contain drop-shadow-lg" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
              {agent.name}
            </h2>
            <p className="truncate text-xs text-muted-foreground mt-0.5">{agent.role}</p>
          </div>
        </div>
      </div>

      {/* Centre : Extrait du dernier fil (hauteur clampée fixe et régulière) */}
      <div className="my-auto min-h-[96px] flex flex-col justify-center rounded-xl bg-muted/40 p-3 border border-border/40">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Dernier fil
        </p>
        {last.title ? (
          <>
            <p className="truncate text-xs font-semibold text-foreground">{last.title}</p>
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground mt-0.5">
              {last.preview || "Fil actif."}
            </p>
            <p className="text-[10px] font-mono text-muted-foreground/80 mt-1">{timeAgo(last.at)}</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Aucun fil pour l'instant.</p>
        )}
      </div>

      {/* Pied : Modèle LLM et endpoint */}
      <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3 font-mono text-[11px] text-muted-foreground">
        <span className="truncate max-w-[180px]">{last.model ?? agent.paseo.model ?? "Modèle non renseigné"}</span>
        <PressButton onPress={() => setStatsOpen(true)} className="flex min-h-9 shrink-0 items-center gap-1 rounded-lg bg-muted/70 px-2 font-sans text-[10px] font-semibold text-foreground"><BarChart3 className="h-3 w-3" />Voir les stats</PressButton>
      </div>
    </PressTarget>
    {statsOpen && <StatsModal initialTargetId={agent.id} onClose={() => setStatsOpen(false)} />}
    </>
  );
}

function ApprovalsBanner() {
  const { agents, approvalsOf } = useRoom();
  const { respondToPermission } = useWorkspace();
  const items = agents.flatMap((a) => approvalsOf(a).map((p) => ({ a, p })));

  if (items.length === 0) return null;

  return (
    <section className={cn(CARD, "mb-6 flex flex-col gap-3 p-5 border-amber-500/40 bg-amber-500/5")} aria-label="À valider">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          À valider ({items.length})
        </h2>
        <span className="text-xs text-muted-foreground">Actions sensibles en attente de ton accord</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map(({ a, p }) => (
          <ApprovalCard
            key={p.key}
            permission={p}
            agentLabel={a.name}
            onRespond={(r) => respondToPermission(p.agentId, p.request.id, r)}
          />
        ))}
      </div>
    </section>
  );
}

export function RoomHome() {
  const { agents, openAgent, customizeAgent, createAgentRequested, clearCreateAgentRequest } = useRoom();
  const activeProviders = useMemo(() => agents.filter((agent) => !!agent.paseo.provider), [agents]);
  const [adding, setAdding] = useState(false);
  const [providerId, setProviderId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [accentColor, setAccentColor] = useState("#6D75E3");
  const [avatar, setAvatar] = useState("robot.png");
  const selectedProvider = activeProviders.find((agent) => agent.paseo.provider === providerId);
  const availableAvatars = [...new Set(agents.map((agent) => agent.avatar))];
  const openCreation = () => {
    const first = activeProviders[0];
    setProviderId(first?.paseo.provider || "");
    setName(first?.name || "");
    setRole(first?.role || "");
    setAccentColor(first?.accentColor || "#6D75E3");
    setAvatar(first?.avatar || "robot.png");
    setAdding(true);
  };
  useEffect(() => {
    if (createAgentRequested) { openCreation(); clearCreateAgentRequest(); }
  }, [createAgentRequested, clearCreateAgentRequest]);
  const saveAgent = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProvider?.paseo.provider || !name.trim() || !role.trim()) return;
    customizeAgent(selectedProvider.paseo.provider, {
      name: name.trim(), role: role.trim(), accentColor, avatar,
    });
    setAdding(false);
    openAgent(selectedProvider.id);
  };
  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
      {/* En-tête ROOM */}
      <header className="mb-6 sm:mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">ROOM</h1>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {agents.length} agents
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground lowercase tracking-tight">
          Agents ACP actifs · synchronisés avec Paseo
        </p>
      </header>

      {/* Alertes d'approbation éventuelles */}
      <ApprovalsBanner />

      {/* Grille régulière parfaitement alignée */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {agents.map((a) => (
          <AgentCard key={a.id} agent={a} />
        ))}

        {/* Fiche Nouvel agent avec la même hauteur exacte */}
        <PressButton onPress={openCreation} className="flex h-[370px] w-full flex-col items-center justify-center gap-2.5 rounded-[22px] border border-dashed border-border/80 bg-card/30 p-6 text-center text-muted-foreground transition-colors hover:border-foreground/30 cursor-pointer touch-manipulation">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Plus className="h-5 w-5 pointer-events-none" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">Personnaliser un agent</p>
            <p className="max-w-[200px] text-xs leading-relaxed text-muted-foreground">Choisis un provider ACP actif dans Paseo</p>
          </div>
        </PressButton>
      </div>
      {adding && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-background/80 p-4 backdrop-blur-sm">
        <form onSubmit={saveAgent} className="box-border w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-xl">
          <header className="mb-4 flex min-w-0 items-center gap-3"><div className="min-w-0 flex-1"><h2 className="text-base font-semibold text-foreground">Personnaliser un agent ROOM</h2><p className="text-xs text-muted-foreground">Le provider et ses modèles viennent du daemon Paseo.</p></div><PressButton type="button" onPress={() => setAdding(false)} aria-label="Fermer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-4 w-4 pointer-events-none" /></PressButton></header>
          <div className="grid min-w-0 gap-3">
            {activeProviders.length === 0 && <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">Aucun fournisseur ACP actif n’est remonté par Paseo. Les agents de base restent visibles et seront associés dès qu’un provider sera disponible.</p>}
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Fournisseur ACP<select required value={providerId} onChange={(e) => { const next = activeProviders.find((agent) => agent.paseo.provider === e.target.value); setProviderId(e.target.value); if (next) { setName(next.name); setRole(next.role); setAccentColor(next.accentColor); setAvatar(next.avatar); } }} className="box-border h-10 w-full max-w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground"><option value="">Choisir un fournisseur actif…</option>{activeProviders.map((agent) => <option key={agent.paseo.provider} value={agent.paseo.provider}>{agent.name} · {agent.paseo.provider}</option>)}</select></label>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Nom affiché<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de l’agent" className="box-border h-10 w-full max-w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground" /></label>
            <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Rôle<input required value={role} onChange={(e) => setRole(e.target.value)} placeholder="Rôle de l’agent" className="box-border h-10 w-full max-w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground" /></label>
            <div className="grid min-w-0 grid-cols-2 gap-3"><label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Couleur<input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="box-border h-10 w-full max-w-full min-w-0 rounded-lg border border-border bg-background p-1" /></label><label className="grid min-w-0 gap-1 text-xs text-muted-foreground">Avatar<select value={avatar} onChange={(e) => setAvatar(e.target.value)} className="box-border h-10 w-full max-w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground">{availableAvatars.map((item) => <option key={item} value={item}>{item.replace(/\.[^.]+$/, "")}</option>)}</select></label></div>
          </div>
          <footer className="mt-5 flex min-w-0 justify-end gap-2"><PressButton type="button" onPress={() => setAdding(false)} className="h-10 rounded-lg px-3 text-sm text-muted-foreground">Annuler</PressButton><PressButton type="submit" disabled={!selectedProvider || !name.trim() || !role.trim()} className="box-border h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:pointer-events-none disabled:opacity-50">Enregistrer</PressButton></footer>
        </form>
      </div>}
    </div>
  );
}
