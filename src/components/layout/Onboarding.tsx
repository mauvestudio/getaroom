import { useState } from "react";
import { Bot, Download, Wifi } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import { getInitialProfileStatus } from "../../lib/profile-storage";
import { normalizeSavedHost } from "../../lib/paseo/hosts";
import { usePaseo } from "../../context/PaseoContext";
import { useRoom } from "../../context/RoomContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { PressButton } from "../ui/button";

const templates = [
  { id: "general", name: "Agent général", role: "Recherche et tâches du quotidien", avatar: "robot.png", accentColor: "#5EE6F2" },
  { id: "developer", name: "Agent développeur", role: "Code, tests et relectures", avatar: "medecin.png", accentColor: "#5B9BFF" },
] as const;

export function Onboarding() {
  const { t } = useI18n();
  const { hosts, setHosts } = usePaseo();
  const { agents, customizeAgent } = useRoom();
  const status = getInitialProfileStatus();
  const [open, setOpen] = useState(status?.firstRun === true);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [provider, setProvider] = useState("");
  const [template, setTemplate] = useState<(typeof templates)[number]["id"]>("general");
  const [error, setError] = useState("");
  const complete = async () => {
    try { await fetch("/api/profile/onboarding", { method: "POST" }); } catch {}
    setOpen(false);
  };
  const addHost = async () => {
    const host = normalizeSavedHost({ id: `host-${crypto.randomUUID().slice(0, 8)}`, name, url, token, enabled: true });
    if (!host) { setError(t("Indique un nom et une adresse WebSocket valides.")); return; }
    try { await setHosts([...hosts, host]); setError(""); setStep(2); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const createAgent = async () => {
    const selected = agents.find((agent) => agent.paseo.provider === provider) || agents.find((agent) => agent.paseo.provider);
    if (selected?.paseo.provider) {
      const choice = templates.find((item) => item.id === template)!;
      customizeAgent(selected.paseo.provider, { name: choice.name, role: choice.role, avatar: choice.avatar, accentColor: choice.accentColor, providerId: selected.paseo.provider, hostId: selected.paseo.hostId });
    }
    await complete();
  };
  if (!open) return null;
  return <Dialog open={open} onOpenChange={() => {}}>
    <DialogContent className="w-[min(95vw,540px)] max-w-[540px] rounded-2xl border-border bg-background p-6" onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
      <DialogHeader><DialogTitle className="text-xl">{t("Bienvenue dans getaroom")}</DialogTitle></DialogHeader>
      {step === 1 ? <div className="space-y-4">
        {status?.paseoDetected && <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Download className="h-4 w-4" />{t("Installation Paseo détectée")}</div><p className="mt-2 text-xs text-muted-foreground">{t("Les hôtes Paseo détectés sont prêts à être utilisés.")}</p><PressButton onPress={() => void complete()} className="mt-3 min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">{t("Importer mes hôtes et projets en 1 clic")}</PressButton></div>}
        <div className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Wifi className="h-4 w-4" />1. {t("Connecter un hôte Paseo")}</h3>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Nom")} className="box-border h-10 w-full max-w-full rounded-lg border border-border bg-card px-3 text-sm" />
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="ws://host:6767" className="box-border h-10 w-full max-w-full rounded-lg border border-border bg-card px-3 font-mono text-xs" />
          <input value={token} onChange={(event) => setToken(event.target.value)} placeholder={t("Token (facultatif)")} type="password" className="box-border h-10 w-full max-w-full rounded-lg border border-border bg-card px-3 text-sm" />
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2"><PressButton onPress={() => void addHost()} className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">{t("Continuer")}</PressButton><PressButton onPress={() => setStep(2)} className="min-h-10 rounded-lg border border-border px-4 text-xs">{t("Passer")}</PressButton></div>
        </div>
      </div> : <div className="space-y-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4" />2. {t("Créer un agent ROOM")}</h3>
        <p className="text-xs text-muted-foreground">{t("Choisis un profil et associe-le à un provider ACP disponible.")}</p>
        <div className="grid grid-cols-2 gap-2">{templates.map((item) => <PressButton key={item.id} onPress={() => setTemplate(item.id)} className={`min-h-20 rounded-xl border p-3 text-left text-xs ${template === item.id ? "border-primary bg-primary/10" : "border-border bg-card"}`}><img src={`/avatars/${item.avatar}`} alt="" className="mb-1 h-10 w-10 object-contain" />{t(item.name)}</PressButton>)}</div>
        <select value={provider} onChange={(event) => setProvider(event.target.value)} className="box-border h-10 w-full max-w-full rounded-lg border border-border bg-card px-3 text-xs"><option value="">{t("Premier provider disponible")}</option>{agents.filter((agent) => agent.paseo.provider).map((agent) => <option key={agent.id} value={agent.paseo.provider}>{agent.name} · {agent.paseo.provider}</option>)}</select>
        <div className="flex gap-2"><PressButton onPress={() => void createAgent()} className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">{t("Terminer")}</PressButton><PressButton onPress={() => void complete()} className="min-h-10 rounded-lg border border-border px-4 text-xs">{t("Passer")}</PressButton></div>
      </div>}
    </DialogContent>
  </Dialog>;
}
