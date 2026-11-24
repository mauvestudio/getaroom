import React, { useEffect, useMemo, useRef, useState } from "react";
import { TopRail } from "./TopRail";
import { Sidebar } from "./Sidebar";
import { SettingsModal } from "./SettingsModal";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PressButton, PressTarget } from "../ui/button";
import { useMode } from "../../context/ModeContext";
import { useGlobalWindowDrag } from "../../lib/useWindowDragRegion";
import { useRoom } from "../../context/RoomContext";
import { usePaseo } from "../../context/PaseoContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { DaemonPathBanner } from "./DaemonPathBanner";
import { Menu, Search, Bot, FolderKanban, PanelLeftOpen, Settings, LayoutGrid } from "lucide-react";

const SIDEBAR_DEFAULT_WIDTH = 328;
const SIDEBAR_MIN_WIDTH = 310;
const SIDEBAR_MAX_WIDTH = 520;
const clampSidebarWidth = (value: number) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));

interface AppShellProps {
  children: React.ReactNode;
  drawer?: React.ReactNode;
}

export function AppShell({ children, drawer }: AppShellProps) {
  useGlobalWindowDrag();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(localStorage.getItem("getaroom-sidebar-width"));
    return Number.isFinite(stored) && stored > 0 ? clampSidebarWidth(stored) : SIDEBAR_DEFAULT_WIDTH;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("getaroom-sidebar-collapsed") === "true");
  const { drawerOpen, workspaces, setActiveWorkspaceId } = useWorkspace();
  const { agents, openAgent } = useRoom();
  const { client } = usePaseo();
  const { mode, setMode } = useMode();
  const notifiedAgentIds = useRef(new Set<string>());
  const isFullView = mode === "room" || mode === "openspace" || mode === "the-room";
  const searchEntries = useMemo(() => {
    const query = quickSearch.trim().toLocaleLowerCase();
    return [
      ...agents.map((agent) => ({ id: agent.id, label: agent.name, detail: agent.role, kind: "agent" as const })),
      ...workspaces.map((workspace) => ({ id: workspace.id, label: workspace.name, detail: workspace.path || "Projet local", kind: "workspace" as const })),
    ].filter((entry) => !query || `${entry.label} ${entry.detail}`.toLocaleLowerCase().includes(query)).slice(0, 12);
  }, [agents, workspaces, quickSearch]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key === ",") { event.preventDefault(); setSettingsOpen(true); }
      if (event.key.toLowerCase() === "k") { event.preventDefault(); setQuickSearchOpen(true); setQuickSearch(""); }
      if (event.key === "\\") { event.preventDefault(); setSidebarCollapsed((value) => !value); }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  useEffect(() => client.on("agent_update", (payload: any) => {
    if (localStorage.getItem("getaroom-native-notifications") !== "true" || !("Notification" in window) || Notification.permission !== "granted") return;
    const agent = payload?.agent || payload;
    const status = String(agent?.status || payload?.status || "").toLocaleLowerCase();
    const id = String(agent?.id || payload?.agentId || "");
    if (!["completed", "complete", "done", "finished"].includes(status)) { if (id) notifiedAgentIds.current.delete(id); return; }
    if (id && notifiedAgentIds.current.has(id)) return;
    if (id) notifiedAgentIds.current.add(id);
    new Notification(agent?.title || agent?.name || "Tâche terminée", { body: agent?.provider ? `${agent.provider} · la tâche est terminée.` : "Un agent a terminé sa tâche." });
  }), [client]);

  useEffect(() => {
    document.documentElement.dataset.density = localStorage.getItem("getaroom-display-density") || "comfortable";
  }, []);

  useEffect(() => { localStorage.setItem("getaroom-sidebar-width", String(sidebarWidth)); }, [sidebarWidth]);
  useEffect(() => { localStorage.setItem("getaroom-sidebar-collapsed", String(sidebarCollapsed)); }, [sidebarCollapsed]);

  const startSidebarResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (move: PointerEvent) => setSidebarWidth(clampSidebarWidth(startWidth + move.clientX - startX));
    const onEnd = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  };

  const chooseSearchEntry = (entry: (typeof searchEntries)[number]) => {
    if (entry.kind === "agent") { setMode("room"); openAgent(entry.id); }
    else { setMode("studio"); setActiveWorkspaceId(entry.id); }
    setQuickSearchOpen(false);
  };

  return (
    <div className="flex h-full h-[100dvh] w-full max-w-full overflow-hidden bg-background text-foreground pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
      {/* Sidebar for Desktop */}
      <div className="relative hidden h-full shrink-0 md:flex" style={{ width: sidebarCollapsed ? 88 : sidebarWidth }}>
        {sidebarCollapsed ? (
          <aside className="flex h-full w-full flex-col items-center gap-2 border-r border-border bg-sidebar pt-12" aria-label="Barre latérale repliée">
            <PressButton onPress={() => setSidebarCollapsed(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title="Déplier la barre latérale (⌘\\)" aria-label="Déplier la barre latérale"><PanelLeftOpen className="h-4 w-4 pointer-events-none" /></PressButton>
            <PressButton onPress={() => setMode("openspace")} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title="Open Space" aria-label="Ouvrir Open Space"><LayoutGrid className="h-4 w-4 pointer-events-none" /></PressButton>
            <PressButton onPress={() => setMode("room")} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title="ROOM" aria-label="Ouvrir ROOM"><Bot className="h-4 w-4 pointer-events-none" /></PressButton>
            <PressButton onPress={() => setMode("studio")} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title="PROJETS" aria-label="Ouvrir PROJETS"><FolderKanban className="h-4 w-4 pointer-events-none" /></PressButton>
            <PressButton onPress={() => setSettingsOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted" title="Réglages" aria-label="Ouvrir les réglages"><Settings className="h-4 w-4 pointer-events-none" /></PressButton>
          </aside>
        ) : <Sidebar isMobile={false} onOpenSettings={() => setSettingsOpen(true)} onOpenSearch={() => { setQuickSearch(""); setQuickSearchOpen(true); }} />}
        {!sidebarCollapsed && <div role="separator" aria-orientation="vertical" aria-label="Redimensionner la barre latérale" title="Glisser pour redimensionner · double clic pour réinitialiser" onPointerDown={startSidebarResize} onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)} className="absolute inset-y-0 -right-1 z-40 w-2 cursor-col-resize border-r border-transparent hover:border-foreground/30" />}
      </div>

      {/* Sidebar Drawer for Mobile */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <PressTarget
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onPress={() => setMobileSidebarOpen(false)}
          />
          <div
            style={{
              paddingTop: "var(--safe-area-top, 0px)",
              paddingBottom: "var(--safe-area-bottom, 0px)",
            }}
            className="relative z-10 w-72 h-full bg-sidebar shadow-2xl pl-[env(safe-area-inset-left,0px)]"
          >
            <Sidebar
              onCloseMobile={() => setMobileSidebarOpen(false)}
              isMobile={true}
              onOpenSearch={() => { setQuickSearch(""); setQuickSearchOpen(true); }}
              onOpenSettings={() => {
                setMobileSidebarOpen(false);
                setSettingsOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <div className={`flex-1 flex flex-col h-full min-w-0 overflow-hidden relative${mode === "studio" ? " hide-scrollbars" : ""}`}>
        {/* Breadcrumbs Row (above top rail) */}
        {isFullView ? (
          <header className="md:hidden h-11 px-2 flex items-center border-b border-border shrink-0">
            <PressButton
              onPress={() => setMobileSidebarOpen(true)}
              className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground cursor-pointer touch-manipulation"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-4 h-4 pointer-events-none" />
            </PressButton>
          </header>
        ) : (
          <>
            {/* Barre supérieure unique : breadcrumb, session et contrôles (comme Paseo) */}
            <div className="relative shrink-0">
              <div data-tauri-drag-region aria-hidden="true" className="h-3 w-full" />
              <TopRail onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)} />
            </div>
          </>
        )}

        <DaemonPathBanner />

        {/* Content Area (Chat & Prompt Composer) */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {children}
        </main>

        {/* Bottom Drawer (Terminal & Changes) */}
        {!isFullView && drawer && drawerOpen && (
          <div
            style={{ paddingBottom: "var(--safe-area-bottom, 0px)" }}
            className="h-64 sm:h-72 border-t border-border bg-card transition-all duration-200 ease-in-out flex flex-col z-30 shrink-0"
          >
            {drawer}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Dialog open={quickSearchOpen} onOpenChange={setQuickSearchOpen}>
        <DialogContent className="max-w-lg overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-4 py-3"><DialogTitle className="flex items-center gap-2 text-sm"><Search className="h-4 w-4" />Recherche rapide</DialogTitle><DialogDescription className="text-xs">Agents ROOM et workspaces locaux.</DialogDescription></DialogHeader>
          <div className="p-3"><Input autoFocus value={quickSearch} onChange={(event) => setQuickSearch(event.target.value)} placeholder="Rechercher un agent ou un projet…" className="w-full max-w-full box-border" /><div className="mt-2 max-h-72 space-y-1 overflow-auto">{searchEntries.map((entry) => <PressButton key={`${entry.kind}:${entry.id}`} onPress={() => chooseSearchEntry(entry)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-muted"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">{entry.kind === "agent" ? <Bot className="h-4 w-4" /> : <FolderKanban className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{entry.label}</span><span className="block truncate text-[10px] text-muted-foreground">{entry.detail}</span></span></PressButton>)}{!searchEntries.length && <p className="p-4 text-center text-xs text-muted-foreground">Aucun résultat.</p>}</div></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
