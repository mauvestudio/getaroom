// Raccourcis globaux et notifications natives de Getaroom.
// Module autonome : il ne lit que les contextes existants et ne modifie rien du core Paseo.
import { useEffect, useRef } from "react";
import { useMode, type AppMode } from "../../context/ModeContext";
import { useRoom } from "../../context/RoomContext";
import { useSessionView } from "../../context/SessionViewContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { tr } from "../../i18n/I18nContext";
import { isTauriWindow } from "../../lib/useWindowDragRegion";
import type { PendingPermission } from "../../lib/paseo/types";

export const APPROVAL_NOTIFICATIONS_KEY = "getaroom-approval-notifications";
export const ROOM_FOCUS_EVENT = "getaroom:room-focus";
const STARTUP_GRACE_MS = 5000;

const MODE_SHORTCUTS: Record<string, AppMode> = {
  Digit1: "openspace",
  Digit2: "room",
  Digit3: "studio",
  Digit4: "the-room",
};

export const approvalNotificationsEnabled = () => {
  try { return localStorage.getItem(APPROVAL_NOTIFICATIONS_KEY) !== "false"; } catch { return true; }
};

export async function sendNativeNotification(title: string, body: string): Promise<boolean> {
  if (isTauriWindow()) {
    try {
      const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
      let granted = await isPermissionGranted();
      if (!granted) granted = (await requestPermission()) === "granted";
      if (granted) { sendNotification({ title, body }); return true; }
    } catch { /* repli sur l'API Web ci-dessous */ }
  }
  try {
    if ("Notification" in window && Notification.permission === "granted") { new Notification(title, { body }); return true; }
  } catch {}
  return false;
}

function describeRequest(permission: PendingPermission): string {
  const { request } = permission;
  if (request.kind === "question") return request.title || request.description || tr("Une question attend ta réponse");
  const detail = request.detail as { command?: unknown; filePath?: unknown } | undefined;
  const command = typeof detail?.command === "string" ? detail.command : undefined;
  const file = typeof detail?.filePath === "string" ? detail.filePath.split("/").pop() : undefined;
  return [request.title || request.name, command ? `$ ${command.slice(0, 80)}` : file].filter(Boolean).join(" · ");
}

/** ⌘1/2/3/4 : Open Space, Room, Dev, The Room · ⌘⇧A : prochaine validation en attente. */
export function GlobalShortcuts() {
  const { mode, setMode } = useMode();
  const { agents, sessionsOf, openAgent, setThreadId } = useRoom();
  const { pendingPermissions, setActiveAgentId } = useWorkspace();
  const { setViewMode } = useSessionView();
  const cursor = useRef(0);
  const latest = useRef({ mode, setMode, agents, sessionsOf, openAgent, setThreadId, pendingPermissions, setActiveAgentId, setViewMode });
  latest.current = { mode, setMode, agents, sessionsOf, openAgent, setThreadId, pendingPermissions, setActiveAgentId, setViewMode };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || event.repeat) return;
      const state = latest.current;

      if (!event.shiftKey && MODE_SHORTCUTS[event.code]) {
        event.preventDefault();
        state.setMode(MODE_SHORTCUTS[event.code]!);
        return;
      }

      if (event.shiftKey && event.code === "KeyA") {
        event.preventDefault();
        const queue = state.pendingPermissions;
        if (!queue.length) return;
        const pending = queue[cursor.current % queue.length]!;
        cursor.current = (cursor.current + 1) % queue.length;
        const agent = state.agents.find((candidate) => state.sessionsOf(candidate).some((session) => session.id === pending.agentId));
        if (agent && state.mode === "the-room") {
          // Déjà dans The Room : on met l'agent en avant, la fenêtre d'approbation s'ouvre sur place.
          window.dispatchEvent(new CustomEvent(ROOM_FOCUS_EVENT, { detail: { id: `${agent.id}:${pending.agentId}` } }));
          return;
        }
        if (agent) {
          state.setThreadId(agent.id, pending.agentId);
          state.openAgent(agent.id);
          state.setMode("room");
        } else {
          state.setMode("studio");
        }
        state.setActiveAgentId(pending.agentId);
        state.setViewMode("discussion");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}

/** Notification macOS native quand un agent demande une validation et que la fenêtre n'est pas au premier plan. */
export function ApprovalNotifier() {
  const { agents, sessionsOf } = useRoom();
  const { pendingPermissions } = useWorkspace();
  const seen = useRef(new Set<string>());
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    const current = new Set(pendingPermissions.map((permission) => permission.key));
    const startingUp = Date.now() - mountedAt.current < STARTUP_GRACE_MS;
    for (const permission of pendingPermissions) {
      if (seen.current.has(permission.key)) continue;
      seen.current.add(permission.key);
      if (startingUp || !approvalNotificationsEnabled()) continue;
      if (document.hasFocus() && !document.hidden) continue;
      const agent = agents.find((candidate) => sessionsOf(candidate).some((session) => session.id === permission.agentId));
      const name = agent?.name || tr("Un agent");
      void sendNativeNotification(
        `${name} ${tr("demande une validation")}`,
        `${describeRequest(permission)} · ⌘⇧A`,
      );
    }
    for (const key of [...seen.current]) if (!current.has(key)) seen.current.delete(key);
  }, [pendingPermissions, agents, sessionsOf]);

  return null;
}
