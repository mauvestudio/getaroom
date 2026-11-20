import { useEffect, useMemo, useState } from "react";
import { Bot, Check, ChevronRight, Cpu, KeyRound, Loader2, Monitor, Moon, Plus, RefreshCw, ShieldCheck, SlidersHorizontal, Sun, Wifi } from "lucide-react";
import { usePaseo } from "../../context/PaseoContext";
import { useTheme } from "../../context/ThemeContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { ROOM_READ_APPROVAL_KEY, useRoom } from "../../context/RoomContext";
import { useMode } from "../../context/ModeContext";
import { LOCAL_HOST } from "../../lib/paseo/hosts";
import type { RoomAgentCustomization } from "../../config/agents";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { PressButton } from "../ui/button";
import { HostsSettingsPanel } from "./HostsSettingsPanel";
import { GetaroomMark } from "../ui/GetaroomMark";
import { ProfileSettings } from "./ProfileSettings";
import { checkForUpdate, formatCheckTime, readStoredUpdateCheck, storeUpdateCheck, type UpdateCheckResult } from "../../lib/updater";
import { useI18n } from "../../i18n/I18nContext";
import { APPROVAL_NOTIFICATIONS_KEY, approvalNotificationsEnabled } from "./GlobalShortcuts";

interface SettingsModalProps { isOpen: boolean; onClose: () => void; }
type Section = "hosts" | "models" | "agents" | "security" | "interface";
import pkg from "../../../package.json" with { type: "json" };

const APP_VERSION = pkg.version as string;
const DENSITY_KEY = "getaroom-display-density";
const NOTIFICATIONS_KEY = "getaroom-native-notifications";

const sections: Array<{ id: Section; label: string; icon: typeof Wifi }> = [
  { id: "hosts", label: "Hôtes & Réseau", icon: Wifi },
  { id: "models", label: "Modèles & Providers ACP", icon: Cpu },
  { id: "agents", label: "Agents ROOM", icon: Bot },
  { id: "security", label: "Permissions & Sécurité", icon: ShieldCheck },
  { id: "interface", label: "Interface & macOS", icon: SlidersHorizontal },
];

function ModelsPanel() {
  const { providers, models, refreshProviders } = useWorkspace();
  const { hosts } = usePaseo();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => { setRefreshing(true); try { await refreshProviders(); } finally { setRefreshing(false); } };
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold">Catalogue ACP</h3><p className="mt-1 text-xs text-muted-foreground">Providers et modèles publiés par les hôtes Paseo connectés.</p></div><PressButton onPress={() => void refresh()} className="flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Rafraîchir le catalogue</PressButton></div>
    {providers.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">Aucun provider n’est remonté pour le moment. Vérifie la connexion de tes hôtes.</p> : <div className="space-y-2">{providers.map((provider) => <article key={`${provider.hostId}:${provider.id}`} className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-xs font-semibold">{provider.label}</h4><p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{hosts.find((host) => host.id === provider.hostId)?.name || provider.hostId || LOCAL_HOST.name} · {provider.id}</p></div><span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">{provider.enabled ? "Disponible" : "Inactif"}</span></div>
      <div className="mt-3 flex flex-wrap gap-1.5">{provider.models.map((model) => <span key={model.id} className="rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-foreground" title={model.id}>{model.name}</span>)}{provider.models.length === 0 && <span className="text-[10px] text-muted-foreground">Aucun modèle publié</span>}</div>
    </article>)}</div>}
    <p className="text-[10px] text-muted-foreground">{providers.length} providers · {models.length} modèles · Les préférences par agent se règlent dans l’onglet Agents ROOM.</p>
  </div>;
}

function RoomAgentsPanel({ onClose }: { onClose: () => void }) {
  const { agents, customizeAgent, requestCreateAgent } = useRoom();
  const { setMode } = useMode();
  const { providers, models } = useWorkspace();
  const { hosts } = usePaseo();
  const [selectedId, setSelectedId] = useState(agents[0]?.id || "");
  const selected = agents.find((agent) => agent.id === selectedId) || agents[0];
  const [name, setName] = useState(selected?.name || "");
  const [role, setRole] = useState(selected?.role || "");
  const [providerOverride, setProviderKey] = useState<string | null>(null);
  const [model, setModel] = useState(selected?.paseo.model || "");
  const [reasoning, setReasoning] = useState(selected?.paseo.reasoning || "medium");
  const [color, setColor] = useState(selected?.accentColor || "#6D75E3");
  const [instructions, setInstructions] = useState(selected?.paseo.instructions || "");
  const [saved, setSaved] = useState(false);
  const availableProviders = providers.filter((provider) => provider.enabled);
  const providerKeyOf = (providerId?: string, hostId?: string) => providerId ? `${hostId || "local"}::${providerId}` : "";

  useEffect(() => {
    if (!selected) return;
    setName(selected.name); setRole(selected.role); setModel(selected.paseo.model || ""); setReasoning(selected.paseo.reasoning || "medium"); setColor(selected.accentColor); setInstructions(selected.paseo.instructions || "");
    setProviderKey(null);
  }, [selected?.id]);

  const currentProviderKey = providerKeyOf(selected?.paseo.provider, selected?.paseo.hostId);
  const providerKey = providerOverride ?? currentProviderKey;
  const chosenProvider = availableProviders.find((provider) => providerKeyOf(provider.id, provider.hostId) === providerKey);
  const currentProviderAvailable = availableProviders.some((provider) => providerKeyOf(provider.id, provider.hostId) === currentProviderKey);
  const providerModels = models.filter((item) => item.agentProvider === chosenProvider?.id && item.hostId === chosenProvider?.hostId);
  const save = () => {
    if (!selected?.paseo.provider) return;
    const profile: RoomAgentCustomization = {
      name: name.trim() || selected.name, role: role.trim() || selected.role, avatar: selected.avatar, accentColor: color,
      providerId: chosenProvider?.id || selected.paseo.provider, hostId: chosenProvider?.hostId || selected.paseo.hostId,
      model: model || undefined, reasoning, instructions: instructions.trim() || undefined,
    };
    customizeAgent(selected.id, profile);
    customizeAgent(selected.paseo.provider, profile);
    setSaved(true); setTimeout(() => setSaved(false), 1400);
  };

  if (!agents.length) return <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">Les profils Agents ROOM apparaîtront ici dès qu’ils seront chargés.</p>;
  return <div className="grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)]">
    <nav aria-label="Agents ROOM" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">{agents.map((agent) => <PressButton key={agent.id} onPress={() => setSelectedId(agent.id)} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-2 text-left text-xs lg:w-full ${agent.id === selected?.id ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}><img src={agent.avatarUrl} className="h-7 w-7 rounded-md object-cover" alt="" /><span className="truncate">{agent.name}</span></PressButton>)}<PressButton onPress={() => { setMode("room"); requestCreateAgent(); onClose(); }} className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-dashed border-border px-2 text-left text-xs text-muted-foreground hover:bg-muted/60 lg:w-full"><Plus className="h-3.5 w-3.5" />Créer un agent ROOM</PressButton></nav>
    <div className="min-w-0 space-y-4">
      <div><h3 className="text-sm font-semibold">Personnaliser {selected?.name}</h3><p className="mt-1 text-xs text-muted-foreground">Les modifications sont enregistrées dans Application Support.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="room-agent-name" className="text-xs">Nom affiché</Label><Input id="room-agent-name" value={name} onChange={(event) => setName(event.target.value)} className="w-full max-w-full box-border" /></div>
        <div className="space-y-1.5"><Label htmlFor="room-agent-role" className="text-xs">Rôle</Label><Input id="room-agent-role" value={role} onChange={(event) => setRole(event.target.value)} className="w-full max-w-full box-border" /></div>
        <div className="space-y-1.5"><Label htmlFor="room-agent-provider" className="text-xs">Hôte et provider ACP</Label><select id="room-agent-provider" value={providerKey} onChange={(event) => { setProviderKey(event.target.value); setModel(""); }} className="h-9 w-full max-w-full box-border rounded-lg border border-input bg-background px-2 text-xs text-foreground">{currentProviderKey && !currentProviderAvailable && <option value={currentProviderKey}>{hosts.find((host) => host.id === selected?.paseo.hostId)?.name || "Hôte non identifié"} · {selected?.paseo.provider} (absent du catalogue)</option>}{availableProviders.map((provider) => <option key={`${provider.hostId}:${provider.id}`} value={providerKeyOf(provider.id, provider.hostId)}>{hosts.find((host) => host.id === provider.hostId)?.name || provider.hostId} · {provider.label}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="room-agent-model" className="text-xs">Modèle préféré</Label><select id="room-agent-model" value={model} onChange={(event) => setModel(event.target.value)} className="h-9 w-full max-w-full box-border rounded-lg border border-input bg-background px-2 font-mono text-xs text-foreground"><option value="">Premier modèle du provider</option>{providerModels.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="room-agent-reasoning" className="text-xs">Raisonnement par défaut</Label><select id="room-agent-reasoning" value={reasoning} onChange={(event) => setReasoning(event.target.value)} className="h-9 w-full max-w-full box-border rounded-lg border border-input bg-background px-2 text-xs text-foreground"><option value="off">Désactivé</option><option value="low">Faible</option><option value="medium">Moyen</option><option value="high">Élevé</option></select></div>
        <div className="space-y-1.5"><Label htmlFor="room-agent-color" className="text-xs">Couleur de l’agent</Label><div className="flex h-9 items-center gap-2 rounded-lg border border-input px-2"><input id="room-agent-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-6 w-8 rounded border-0 bg-transparent p-0" /><span className="font-mono text-[10px] text-muted-foreground">{color}</span></div></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="room-agent-instructions" className="text-xs">Instructions du profil</Label><textarea id="room-agent-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} placeholder="Notes locales pour ce profil…" className="w-full max-w-full box-border resize-y rounded-lg border border-input bg-background p-2.5 text-xs text-foreground" /><p className="text-[10px] text-muted-foreground">Le rôle et ces instructions précèdent le premier message des nouveaux fils.</p></div>
      <PressButton onPress={save} className="flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">{saved ? <Check className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}{saved ? "Enregistré" : "Enregistrer le profil"}</PressButton>
    </div>
  </div>;
}

function SecurityPanel() {
  const [approveReads, setApproveReads] = useState(() => localStorage.getItem(ROOM_READ_APPROVAL_KEY) === "true");
  return <div className="space-y-5">
    <div><h3 className="text-sm font-semibold">Validation des actions</h3><p className="mt-1 text-xs text-muted-foreground">Les demandes d’autorisation restent contrôlées par Paseo et sont présentées dans ROOM pour décision explicite.</p></div>
    <div className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 text-xs"><ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /><span><b className="text-foreground">Politique active :</b> demander une validation explicite pour les actions sensibles.</span></div>
    <div className="rounded-xl border border-border bg-muted/30 p-3"><div className="flex items-center gap-2 text-xs font-semibold"><KeyRound className="h-4 w-4" />Jetons d’accès</div><p className="mt-1 text-[11px] text-muted-foreground">Les tokens des hôtes sont enregistrés dans le stockage local du relais avec des permissions de fichier restreintes. Gère-les depuis Hôtes & Réseau.</p></div>
    <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-xs">
      <input type="checkbox" checked={approveReads} onChange={(event) => {
        setApproveReads(event.target.checked);
        localStorage.setItem(ROOM_READ_APPROVAL_KEY, String(event.target.checked));
      }} />
      <span><b>Autoriser automatiquement la lecture de fichiers dans ROOM</b><br />
        <span className="text-muted-foreground">Pour les agents distants et les demandes explicitement identifiées comme lectures. Les commandes, modifications et autres actions demandent une validation.</span>
      </span>
    </label>
  </div>;
}

function InterfacePanel() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const [density, setDensity] = useState(() => localStorage.getItem(DENSITY_KEY) || "comfortable");
  const [notifications, setNotifications] = useState(() => localStorage.getItem(NOTIFICATIONS_KEY) === "true");
  const [notice, setNotice] = useState("");
  const [approvalNotifications, setApprovalNotifications] = useState(approvalNotificationsEnabled);
  const toggleApprovalNotifications = () => {
    const next = !approvalNotifications;
    setApprovalNotifications(next);
    localStorage.setItem(APPROVAL_NOTIFICATIONS_KEY, String(next));
  };
  const toggleNotifications = async () => {
    if (!notifications) {
      if (!("Notification" in window)) { setNotice("Les notifications ne sont pas disponibles dans ce WebView."); return; }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setNotice("L’autorisation de notification a été refusée dans macOS."); return; }
    }
    const next = !notifications; setNotifications(next); localStorage.setItem(NOTIFICATIONS_KEY, String(next)); setNotice(next ? "Notifications activées pour les tâches terminées." : "Notifications désactivées.");
  };
  return <div className="space-y-5">
    <section className="space-y-2"><label htmlFor="getaroom-language" className="text-sm font-semibold">{t("Langue / Language")}</label><select data-no-translate id="getaroom-language" value={language} onChange={(event) => setLanguage(event.target.value as "en" | "fr")} className="box-border h-10 w-full max-w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"><option value="en">English</option><option value="fr">Français</option></select></section>
    <section className="space-y-2"><h3 className="text-sm font-semibold">Apparence</h3><div className="grid grid-cols-3 gap-2">{([["light", "Clair", Sun], ["dark", "Sombre", Moon], ["system", "Système", Monitor]] as const).map(([id, label, Icon]) => <PressButton key={id} onPress={() => setTheme(id)} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs ${theme === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}><Icon className="h-3.5 w-3.5" />{label}</PressButton>)}</div></section>
    <section className="space-y-2"><h3 className="text-sm font-semibold">Densité d’affichage</h3><div className="flex gap-2">{([["comfortable", "Confortable"], ["compact", "Compacte"]] as const).map(([id, label]) => <PressButton key={id} onPress={() => { setDensity(id); localStorage.setItem(DENSITY_KEY, id); document.documentElement.dataset.density = id; }} className={`min-h-10 rounded-lg border px-3 text-xs ${density === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{label}</PressButton>)}</div></section>
    <section className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><div><h3 className="text-xs font-semibold">Notifications macOS</h3><p className="mt-1 text-[10px] text-muted-foreground">Alerte lors de la fin d’une tâche d’agent en arrière-plan.</p>{notice && <p role="status" className="mt-1 text-[10px] text-muted-foreground">{notice}</p>}</div><input type="checkbox" checked={notifications} onChange={() => void toggleNotifications()} aria-label="Activer les notifications macOS" className="h-4 w-4 accent-primary" /></section>
    <section className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><div><h3 className="text-xs font-semibold">Notifications de validation</h3><p className="mt-1 text-[10px] text-muted-foreground">Notification macOS quand un agent demande une validation et que getaroom n’est pas au premier plan.</p></div><input type="checkbox" checked={approvalNotifications} onChange={toggleApprovalNotifications} aria-label="Activer les notifications de validation" className="h-4 w-4 accent-primary" /></section>
    <section className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-3"><GetaroomMark className="h-12 w-12" label="Logo getaroom" /><div><h3 className="text-sm font-semibold">getaroom</h3><p className="font-mono text-[10px] text-muted-foreground">Version {APP_VERSION} · macOS · Tauri v2</p></div></div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Espace de travail multi-hôtes propulsé par le daemon Paseo et le protocole ACP.</p><UpdateSettingsRow /></section>
    <section className="rounded-xl border border-border p-3"><h3 className="text-xs font-semibold">Raccourcis clavier</h3><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Ouvrir les réglages</span><kbd className="font-mono">⌘,</kbd></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Recherche rapide</span><kbd className="font-mono">⌘K</kbd></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Replier ou déplier la barre latérale</span><kbd className="font-mono">⌘\</kbd></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Open Space · Room · Dev · The Room</span><kbd className="font-mono">⌘1 ⌘2 ⌘3 ⌘4</kbd></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Prochaine validation en attente</span><kbd className="font-mono">⌘⇧A</kbd></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Calibrer The Room</span><kbd className="font-mono">⇧E</kbd></div></section>
    <ProfileSettings />
  </div>;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>("hosts");
  const content = useMemo(() => {
    switch (section) {
      case "hosts": return <HostsSettingsPanel />;
      case "models": return <ModelsPanel />;
      case "agents": return <RoomAgentsPanel onClose={onClose} />;
      case "security": return <SecurityPanel />;
      case "interface": return <InterfacePanel />;
    }
  }, [section, onClose]);
  useEffect(() => { if (isOpen) setSection("hosts"); }, [isOpen]);
  return <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="w-[min(96vw,1080px)] max-w-[1080px] overflow-hidden border-border bg-background p-0 sm:rounded-2xl">
      <DialogHeader className="border-b border-border px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><GetaroomMark className="h-9 w-9" /><div><DialogTitle className="text-base">Centre de contrôle</DialogTitle><DialogDescription className="mt-1">Hôtes Paseo, providers ACP, Agents ROOM et préférences de getaroom.</DialogDescription></div></div></DialogHeader>
      <div className="grid min-h-0 max-h-[calc(90vh-82px)] md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label={t("Rubriques des réglages")} className="flex gap-1 overflow-x-auto border-b border-border bg-sidebar p-2 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3">{sections.map(({ id, label, icon: Icon }) => <PressButton key={id} role="tab" aria-selected={section === id} onPress={() => setSection(id)} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-xs md:w-full ${section === id ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}><Icon className="h-4 w-4 shrink-0" /><span className="whitespace-nowrap md:whitespace-normal">{t(label)}</span>{section === id && <ChevronRight className="ml-auto hidden h-3.5 w-3.5 md:block" />}</PressButton>)}</nav>
        <main role="tabpanel" className="min-h-0 overflow-y-auto p-4 sm:p-6">{content}</main>
      </div>
    </DialogContent>
  </Dialog>;
}

function UpdateSettingsRow() {
  const [result, setResult] = useState<UpdateCheckResult | null>(() => readStoredUpdateCheck());
  const [checking, setChecking] = useState(false);

  const run = async () => {
    setChecking(true);
    const next = await checkForUpdate(APP_VERSION);
    storeUpdateCheck(next);
    setResult(next);
    setChecking(false);
  };

  return (
    <section className="mt-4 space-y-2 border-t border-border/60 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-foreground">Mise à jour</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {result?.available
              ? <>v{result.latest} disponible · vérifié {formatCheckTime(result.checkedAt)}</>
              : result?.error
                ? <>Dernière vérification : {result.error}</>
                : result
                  ? <>À jour · vérifié {formatCheckTime(result.checkedAt)}</>
                  : "Aucune vérification effectuée pour le moment."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {result?.available && result.url && (
            <PressButton
              onPress={() => window.open(result.url!, "_blank", "noopener,noreferrer")}
              className="flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] text-foreground hover:bg-muted cursor-pointer touch-manipulation"
            >
              <Plus className="h-3 w-3" />
              Ouvrir la release
            </PressButton>
          )}
          <PressButton
            onPress={() => void run()}
            disabled={checking}
            className="flex min-h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer touch-manipulation disabled:opacity-50"
          >
            {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Vérifier
          </PressButton>
        </div>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Releases suivies sur <span className="font-mono">mauvestudio/getaroom</span>. Pour pousser une nouvelle
        version sur le staging local, relance <span className="font-mono">bun run deploy</span>.
      </p>
    </section>
  );
}
