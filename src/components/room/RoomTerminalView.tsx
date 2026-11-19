import { useEffect, useRef, useState } from "react";
import { Terminal, Copy, Trash2, Check } from "lucide-react";
import type { PublicAgent } from "../../config/agents";
import { usePaseo } from "../../context/PaseoContext";
import { useRoom } from "../../context/RoomContext";
import { PressButton } from "../ui/button";

interface Props { agent: PublicAgent; threadId: string | null }
interface LogEntry { id: string; timestamp: string; level: "info" | "req" | "res" | "stream" | "err"; message: string; detail?: string }

export function RoomTerminalView({ agent, threadId }: Props) {
  const { client, connectionState } = usePaseo();
  const { sessionsOf } = useRoom();
  const session = sessionsOf(agent).find((s) => s.id === threadId);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs([{ id: `state-${Date.now()}`, timestamp: new Date().toLocaleTimeString("fr-FR"), level: connectionState === "connected" ? "info" : "err", message: `Connexion au daemon Paseo : ${connectionState}` }]);
    if (!threadId) return;
    void client.fetchAgentTimeline(threadId).then(({ entries }) => {
      const history: LogEntry[] = entries.map((entry: any, index: number) => ({
        id: `history-${threadId}-${index}`,
        timestamp: entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString("fr-FR") : "",
        level: entry.type === "user_message" ? "req" : entry.type === "assistant_message" ? "res" : "stream",
        message: entry.type === "user_message" ? "Message envoyé via ACP" : entry.type === "assistant_message" ? "Réponse ACP" : `Événement ACP · ${entry.type}`,
        detail: typeof entry.text === "string" ? entry.text.slice(0, 500) : undefined,
      }));
      setLogs((current) => [...current, ...history]);
    }).catch((error) => setLogs((current) => [...current, { id: `error-${Date.now()}`, timestamp: new Date().toLocaleTimeString("fr-FR"), level: "err", message: "Impossible de charger le flux de session Paseo", detail: String(error) }]));
    const off = client.on("agent_stream", (event: any) => {
      if (event?.agentId !== threadId) return;
      const entry: LogEntry = { id: `stream-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString("fr-FR"), level: "stream", message: `Événement ACP · ${event.type || event.event || "flux"}`, detail: typeof event.text === "string" ? event.text : undefined };
      setLogs((current) => [...current, entry].slice(-500));
    });
    return () => { off?.(); };
  }, [agent.id, client, connectionState, threadId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  const handleCopyLogs = () => {
    void navigator.clipboard.writeText(logs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}${l.detail ? `\n  ${l.detail}` : ""}`).join("\n"));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const colors = { info: "text-muted-foreground", req: "text-amber-600 dark:text-amber-400", res: "text-emerald-600 dark:text-emerald-400", stream: "text-sky-600 dark:text-sky-400", err: "text-destructive" };
  return <div className="flex h-full min-h-0 flex-1 flex-col bg-background font-mono text-foreground select-text">
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-card px-3 text-xs">
      <div className="flex items-center gap-2"><Terminal className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-semibold">Flux ACP · {agent.name}</span><span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{session?.provider || agent.paseo.provider || "Paseo"}</span></div>
      <div className="flex items-center gap-1">
        <PressButton onPress={handleCopyLogs} className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors" title="Copier les logs">{copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}<span className="hidden sm:inline">{copied ? "Copié" : "Copier"}</span></PressButton>
        <PressButton onPress={() => setLogs([])} className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-destructive cursor-pointer transition-colors" title="Effacer la console"><Trash2 className="h-3 w-3" /><span className="hidden sm:inline">Effacer</span></PressButton>
      </div>
    </div>
    <div className="flex-1 space-y-1.5 overflow-y-auto p-4 text-[12px] leading-relaxed">
      {logs.map((log) => <div key={log.id} className="flex flex-col gap-0.5"><div className="flex items-start gap-2"><span className="shrink-0 text-muted-foreground">{log.timestamp}</span><span className={`shrink-0 rounded bg-muted px-1 text-[10px] uppercase ${colors[log.level]}`}>{log.level}</span><span className="flex-1 break-all">{log.message}</span></div>{log.detail && <div className="ml-2 break-all border-l-2 border-border pl-4 text-[11px] text-muted-foreground">{log.detail}</div>}</div>)}
      {!threadId && <p className="text-muted-foreground">Sélectionne une session Paseo pour afficher son activité ACP.</p>}
      <div ref={bottomRef} />
    </div>
  </div>;
}
