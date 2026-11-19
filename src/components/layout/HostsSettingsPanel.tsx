import { useState, type FormEvent } from "react";
import { Check, CircleAlert, LoaderCircle, Plus, RefreshCw, Trash2, Wifi, ScrollText, ChevronDown, ChevronUp } from "lucide-react";
import { usePaseo } from "../../context/PaseoContext";
import { LOCAL_HOST, normalizeHostWsUrl, type PaseoHost } from "../../lib/paseo/hosts";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PressButton } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

function StatePill({ state }: { state: string }) {
  const connected = state === "connected";
  const pending = state === "connecting" || state === "reconnecting";
  const label = connected ? "Connecté" : pending ? "Connexion…" : state === "disabled" ? "Inactif" : "Hors ligne";
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">
    <span className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500 shadow-[0_0_7px_rgb(16_185_129_/_0.45)]" : pending ? "animate-pulse bg-amber-500" : "bg-muted-foreground/40"}`} />{label}
  </span>;
}

export function HostsSettingsPanel() {
  const { getClientForHost, hosts, hostStates, setHosts, testHost } = usePaseo();
  const { providers } = useWorkspace();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [testState, setTestState] = useState<{ kind: "testing" | "ok" | "error"; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [probes, setProbes] = useState<Record<string, { latencyMs?: number; version?: string; message?: string }>>({});
  const [logs, setLogs] = useState<Array<{ at: string; level: string; message: string; target?: string }>>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logsError, setLogsError] = useState("");
  const remoteHosts = hosts.filter((host) => !host.local);

  const toggleHost = async (host: PaseoHost) => {
    if (host.local) return;
    try {
      await setHosts(hosts.map((candidate) => candidate.id === host.id ? { ...candidate, enabled: !candidate.enabled } : candidate));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Enregistrement impossible.");
    }
  };

  const removeHost = async (hostId: string) => {
    try { await setHosts(hosts.filter((candidate) => candidate.id !== hostId)); }
    catch (error) { setSaveError(error instanceof Error ? error.message : "Suppression impossible."); }
  };

  const runTest = async () => {
    const normalizedUrl = normalizeHostWsUrl(url);
    if (!normalizedUrl) {
      setTestState({ kind: "error", message: "Adresse invalide. Utilise ws:// ou wss://." });
      return;
    }
    setTestState({ kind: "testing", message: "Test de la connexion…" });
    const result = await testHost({ id: "test-host", name: name.trim() || "Hôte à tester", url: normalizedUrl, token, enabled: true });
    if (result.ok && result.endpoint) setUrl((current) => current === url ? result.endpoint! : current);
    setTestState({ kind: result.ok ? "ok" : "error", message: result.message });
  };

  const saveHost = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedUrl = normalizeHostWsUrl(url);
    if (!name.trim() || !normalizedUrl) {
      setSaveError("Renseigne un nom et une adresse WebSocket valide.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const original = remoteHosts.find((item) => item.id === editingId);
    const host: PaseoHost = { ...original, id: original?.id ?? crypto.randomUUID(), name: name.trim(), url: normalizedUrl, token: token.trim() || undefined, enabled: original?.enabled ?? true };
    try {
      await setHosts(original ? remoteHosts.map((item) => item.id === original.id ? host : item) : [...remoteHosts, host]);
      setEditingId(null);
      setName(""); setUrl(""); setToken(""); setTestState(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally { setSaving(false); }
  };

  const localState = hostStates.local || "disconnected";
  const runProbe = async (host: PaseoHost) => {
    const connection = getClientForHost(host.id);
    if (!connection) return;
    setProbes((current) => ({ ...current, [host.id]: { message: "Test en cours…" } }));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([connection.connect(connection.getState() !== "connected"),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Délai dépassé après 10 s.")), 10000); })]);
      const latencyMs = await connection.measureLatency();
      setProbes((current) => ({ ...current, [host.id]: { latencyMs, version: connection.getServerInfo()?.version ?? undefined } }));
    } catch (error) {
      setProbes((current) => ({ ...current, [host.id]: { message: error instanceof Error ? error.message : "Connexion impossible." } }));
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
  const readLogs = async () => {
    setShowLogs((value) => !value);
    try {
      const response = await fetch("/api/paseo/logs");
      if (!response.ok) throw new Error("Le relais n’a pas renvoyé ses journaux.");
      setLogs(await response.json());
      setLogsError("");
    } catch (error) { setLogsError(error instanceof Error ? error.message : "Journaux indisponibles."); }
  };
  const hostCard = (host: PaseoHost) => {
    const state = host.local ? localState : host.enabled ? (hostStates[host.id] || "disconnected") : "disabled";
    const info = getClientForHost(host.id)?.getServerInfo();
    const probe = probes[host.id];
    const providerCount = providers.filter((provider) => provider.hostId === host.id && provider.enabled).length;
    return <div key={host.id} className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><Wifi className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><div className="text-xs font-semibold text-foreground">{host.name}</div><div className="truncate font-mono text-[10px] text-muted-foreground">{host.url}</div></div>
        <StatePill state={state} />
        {!host.local && <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground" title={host.enabled ? "Désactiver l’hôte" : "Activer l’hôte"}><input type="checkbox" checked={host.enabled} onChange={() => void toggleHost(host)} className="h-3.5 w-3.5 accent-primary" aria-label={`${host.enabled ? "Désactiver" : "Activer"} ${host.name}`} />Actif</label>}
        <PressButton disabled={!host.enabled} onPress={() => void runProbe(host)} aria-label={`Tester et reconnecter ${host.name}`} title="Tester / Reconnecter" className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2 text-[10px] text-foreground hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Tester / Reconnecter</span></PressButton>
        {!host.local && <PressButton onPress={() => {
          setEditingId(host.id); setName(host.name); setUrl(host.url); setToken(host.token || ""); setTestState(null);
        }} className="rounded-lg border border-border px-2 py-2 text-[10px]">Modifier</PressButton>}
        {!host.local && <PressButton onPress={() => void removeHost(host.id)} aria-label={`Supprimer ${host.name}`} title="Supprimer" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></PressButton>}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border/70 pt-2 text-[10px]">
        <span className="text-muted-foreground">Latence <b className="ml-1 font-mono text-foreground">{probe?.latencyMs !== undefined ? `${probe.latencyMs} ms` : "—"}</b></span>
        <span className="text-muted-foreground">Daemon <b className="ml-1 font-mono text-foreground">{probe?.version || info?.version || "—"}</b></span>
        <span className="text-muted-foreground">Providers <b className="ml-1 font-mono text-foreground">{providerCount}</b></span>
      </div>
      {probe?.message && <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{probe.message}</p>}
    </div>;
  };
  return <div className="space-y-5 pt-2">
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Hôte local</h3>
      {hostCard(LOCAL_HOST)}
    </section>

    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Hôtes distants</h3>
      {remoteHosts.length === 0 ? <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">Aucun hôte distant enregistré.</p> :
        <div className="space-y-2">{remoteHosts.map(hostCard)}</div>}
    </section>

    <section className="space-y-2">
      <PressButton onPress={() => void readLogs()} className="flex min-h-10 w-full items-center justify-between rounded-xl border border-border px-3 text-xs font-medium text-foreground hover:bg-muted"><span className="flex items-center gap-2"><ScrollText className="h-4 w-4" />Voir les logs du relais</span>{showLogs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</PressButton>
      {showLogs && <div className="max-h-52 space-y-1 overflow-auto rounded-xl border border-border bg-background p-3 font-mono text-[10px]">{logsError ? <p className="text-destructive">{logsError}</p> : logs.length ? logs.map((entry, index) => <p key={`${entry.at}-${index}`} className="break-all text-muted-foreground"><span className="text-foreground">{new Date(entry.at).toLocaleTimeString("fr-FR")}</span> · {entry.level} · {entry.message}{entry.target ? ` · ${entry.target}` : ""}</p>) : <p className="text-muted-foreground">Aucun événement enregistré par le relais.</p>}</div>}
    </section>

    <form onSubmit={saveHost} className="space-y-3 rounded-xl border border-border p-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground"><Plus className="h-3.5 w-3.5" />{editingId ? "Modifier l’hôte" : "Ajouter un hôte"}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="host-name" className="text-[10px] text-muted-foreground">Nom</Label><Input id="host-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Unraid" className="h-9 w-full max-w-full box-border text-xs" /></div>
        <div className="space-y-1.5"><Label htmlFor="host-url" className="text-[10px] text-muted-foreground">Adresse WebSocket</Label><Input id="host-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="ws://unraid:6767" className="h-9 w-full max-w-full box-border font-mono text-xs" /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="host-token" className="text-[10px] text-muted-foreground">Token (facultatif)</Label><Input id="host-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Jeton Paseo" className="h-9 w-full max-w-full box-border font-mono text-xs" /></div>
      {testState && <p className={`flex items-center gap-1.5 text-[11px] ${testState.kind === "error" ? "text-destructive" : testState.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
        {testState.kind === "testing" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : testState.kind === "ok" ? <Check className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}{testState.message}
      </p>}
      {saveError && <p role="alert" className="text-[11px] text-destructive">{saveError}</p>}
      <div className="flex justify-end gap-2">
        <PressButton type="button" disabled={testState?.kind === "testing"} onPress={() => void runTest()} className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted">Tester la connexion</PressButton>
        <PressButton type="submit" disabled={saving} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">{saving ? "Enregistrement…" : "Enregistrer"}</PressButton>
      </div>
    </form>
  </div>;
}
