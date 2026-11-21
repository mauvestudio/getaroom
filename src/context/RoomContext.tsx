import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "./WorkspaceContext";
import { validateAgents, type AgentConfig, type PublicAgent, type RoomAgentCustomization } from "../config/agents";
import type { AgentSnapshot, PendingPermission } from "../lib/paseo/types";
import { mergeRoomProviders } from "../config/agents";
import { deriveStatus, type LiveStatus } from "../lib/room-status";

interface RoomCtx {
  agents: PublicAgent[];
  loadError: string | null;
  /** Agent ouvert (espace dédié) ; `null` = accueil Bento. */
  selectedAgentId: string | null;
  selectedAgent: PublicAgent | null;
  openAgent: (id: string) => void;
  openHome: () => void;
  threadId: (agentId: string) => string | null;
  setThreadId: (agentId: string, threadId: string | null) => void;
  statusOf: (agent: PublicAgent) => LiveStatus;
  /** Sessions du daemon pour un agent `paseo`. */
  sessionsOf: (agent: PublicAgent) => AgentSnapshot[];
  approvalsOf: (agent: PublicAgent) => PendingPermission[];
  customizeAgent: (providerId: string, profile: RoomAgentCustomization) => void;
  createAgentRequested: boolean;
  requestCreateAgent: () => void;
  clearCreateAgentRequest: () => void;
}

const Ctx = createContext<RoomCtx | undefined>(undefined);
const SEL_KEY = "mauve-room-agent";
const THREADS_KEY = "mauve-room-threads";
export const ROOM_READ_APPROVAL_KEY = "getaroom-room-auto-approve-file-reads";
const CUSTOMIZATIONS_KEY = "mauve-room-customizations";

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const { allAgents, pendingPermissions, providers, respondToPermission } = useWorkspace();
  const [customizations, setCustomizations] = useState<Record<string, RoomAgentCustomization>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOMIZATIONS_KEY) || "{}") as Record<string, RoomAgentCustomization>;
      // L'ancienne couleur par défaut de Webmaster pouvait avoir été enregistrée comme personnalisation.
      for (const [key, profile] of Object.entries(saved)) {
        if (["redaction", "hermes-webmaster", "webmaster"].includes(key.toLowerCase()) && profile.accentColor?.toLowerCase() === "#ff8fcb") {
          saved[key] = { ...profile, accentColor: "#5B9BFF" };
        }
      }
      return saved;
    } catch { return {}; }
  });
  const [baseProfiles, setBaseProfiles] = useState<AgentConfig[] | undefined>();
  useEffect(() => {
    let active = true;
    void fetch("/api/room/profiles").then((response) => response.json()).then((value) => {
      if (active) setBaseProfiles(validateAgents(value));
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const agents = useMemo(() => mergeRoomProviders(providers, customizations, baseProfiles), [providers, customizations, baseProfiles]);
  const loadError = null;
  const [selectedAgentId, setSelected] = useState<string | null>(() => {
    try { return localStorage.getItem(SEL_KEY); } catch { return null; }
  });
  const [threads, setThreads] = useState<Record<string, string | null>>(() => {
    try { return JSON.parse(localStorage.getItem(THREADS_KEY) ?? "{}"); } catch { return {}; }
  });
  const [createAgentRequested, setCreateAgentRequested] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(THREADS_KEY, JSON.stringify(threads)); } catch {}
  }, [threads]);

  const sessionsOf = useCallback(
    (a: PublicAgent) => {
      const provider = a.paseo.provider?.toLocaleLowerCase();
      return provider ? allAgents.filter((session) =>
        session.provider?.toLocaleLowerCase() === provider &&
        (!a.paseo.hostId || session.hostId === a.paseo.hostId),
      ) : [];
    },
    [allAgents],
  );
  const attemptedApprovals = useRef(new Set<string>());
  useEffect(() => {
    const pendingKeys = new Set(pendingPermissions.map(({ key }) => key));
    for (const key of attemptedApprovals.current) {
      if (!pendingKeys.has(key)) attemptedApprovals.current.delete(key);
    }
    if (localStorage.getItem(ROOM_READ_APPROVAL_KEY) !== "true") return;
    const roomIds = new Set(agents
      .filter((agent) => agent.paseo.hostId && agent.paseo.hostId !== "local")
      .flatMap(sessionsOf).map((session) => session.id));
    for (const { key, agentId, request } of pendingPermissions) {
      if (!roomIds.has(agentId) || attemptedApprovals.current.has(key)) continue;
      if (request.kind !== "tool" || request.detail?.type !== "read" || !request.detail.filePath) continue;
      const allowOnce = request.actions?.find((action) => action.behavior === "allow" && action.id === "allow-once");
      if (request.actions?.length && !allowOnce) continue;
      attemptedApprovals.current.add(key);
      void respondToPermission(agentId, request.id, {
        behavior: "allow", ...(allowOnce ? { selectedActionId: allowOnce.id } : {}),
      }).catch(() => { /* The permission card remains available for a manual response. */ });
    }
  }, [agents, sessionsOf, pendingPermissions, respondToPermission]);

  const approvalsOf = useCallback(
    (a: PublicAgent) => {
      const ids = new Set(sessionsOf(a).map((s) => s.id));
      return pendingPermissions.filter((p) => ids.has(p.agentId));
    },
    [sessionsOf, pendingPermissions],
  );
  const statusOf = useCallback(
    (a: PublicAgent): LiveStatus => {
      return deriveStatus(sessionsOf(a), approvalsOf(a).length > 0);
    },
    [sessionsOf, approvalsOf],
  );

  const customizeAgent = useCallback((providerId: string, profile: RoomAgentCustomization) => {
    setCustomizations((current) => {
      const next = { ...current, [providerId]: { ...current[providerId], ...profile } };
      try { localStorage.setItem(CUSTOMIZATIONS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const requestCreateAgent = useCallback(() => setCreateAgentRequested(true), []);
  const clearCreateAgentRequest = useCallback(() => setCreateAgentRequested(false), []);

  const openAgent = useCallback((id: string) => {
    setSelected(id);
    try { localStorage.setItem(SEL_KEY, id); } catch {}
  }, []);
  const openHome = useCallback(() => {
    setSelected(null);
    try { localStorage.removeItem(SEL_KEY); } catch {}
  }, []);

  const value = useMemo<RoomCtx>(
    () => ({
      agents, loadError, selectedAgentId,
      selectedAgent: agents.find((a) => a.id === selectedAgentId) ?? null,
      openAgent, openHome,
      threadId: (id) => threads[id] ?? null,
      setThreadId: (id, t) => setThreads((p) => ({ ...p, [id]: t })),
      statusOf, sessionsOf, approvalsOf, customizeAgent,
      createAgentRequested, requestCreateAgent, clearCreateAgentRequest,
    }),
    [agents, loadError, selectedAgentId, openAgent, openHome, threads, statusOf, sessionsOf, approvalsOf, customizeAgent, createAgentRequested, requestCreateAgent, clearCreateAgentRequest],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoom(): RoomCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRoom doit être utilisé dans <RoomProvider>");
  return v;
}
