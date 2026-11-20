import React, { useMemo, useState, useEffect, useRef } from "react";
import { SessionStatusIcon } from "../ui/SessionStatusIcon";
import { aggregateVisual, sessionVisual } from "../../lib/session-visual";
import { GetaroomMark } from "../ui/GetaroomMark";
import { useWorkspace } from "../../context/WorkspaceContext";
import { usePaseo } from "../../context/PaseoContext";
import { ScrollArea } from "../ui/scroll-area";
import type { ProjectItem, WorkspaceItem, AgentSnapshot } from "../../lib/paseo/types";
import type { PaseoClient } from "../../lib/paseo/client";
import { cn } from "../../lib/utils";
import {
  isProjectEmpty,
  resolveProjectCollapsed,
  resolveWorktreeCollapsed,
  parseStoredCollapseState,
  toggleCollapseRecord,
} from "./sidebar-collapse-utils";
import { ProjectIcon } from "./ProjectIcon";
import {
  Folder,
  GitFork,
  GitBranch,
  Plus,
  X,
  ChevronRight,
  ChevronDown,
  Loader2,
  AlertCircle,
  Check,
  Search,
  Sparkles,
  Pencil,
  Clock,
  GripVertical,
  Settings,
  MoreVertical,
  SquareArrowOutUpRight,
  FolderOpen,
  Trash2,
  RefreshCw,
  FolderPlus,
  LifeBuoy,
  BookOpen,
  Bug,
  Keyboard,
} from "lucide-react";
import {
  getProjectKey,
  parseStoredProjectOrder,
  sortProjectsByOrder,
  reorderProjectKeys,
  getRecentSessions,
  getSessionContextLabel,
} from "./sidebar-order-utils";
import { slugify } from "@getpaseo/protocol/branch-slug";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { Button, PressButton, PressTarget } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { RegisterProjectModal } from "./RegisterProjectModal";
import { useMode } from "../../context/ModeContext";
import { openProjectWindow } from "../../lib/useWindowDragRegion";
import { RoomAgentList } from "../room/RoomAgentList";
import { ModeSwitch } from "../room/ModeSwitch";
import {
  GROUP_LABEL,
    projectGroup,
  sortByGroup,
  type GroupFilter,
} from "../../lib/project-groups";
import { checkForUpdate, readStoredUpdateCheck, storeUpdateCheck, formatCheckTime, type UpdateCheckResult } from "../../lib/updater";
import pkg from "../../../package.json" with { type: "json" };
import { ProviderUsageGauge } from "./ProviderUsageGauge";

interface SidebarProps {
  onCloseMobile?: () => void;
  isMobile?: boolean;
  /** Réglages : affichés dans l'en-tête en mode Ma Room (Studio Dev a sa propre barre). */
  onOpenSettings?: () => void;
  /** Ouvre la recherche rapide (⌘K). */
  onOpenSearch?: () => void;
}

function formatElapsed(timestamp?: string | number): string {
  if (!timestamp) return "";
  const timeMs = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
  if (isNaN(timeMs)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - timeMs) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function BranchCombobox({
  value,
  onChange,
  branches,
  placeholder,
  disabled,
  isLoading,
}: {
  value: string;
  onChange: (val: string) => void;
  branches: string[];
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filteredBranches = useMemo(() => {
    if (!filter.trim()) return branches;
    const q = filter.trim().toLowerCase();
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, filter]);

  const hasExactMatch = useMemo(() => {
    return branches.some((b) => b.toLowerCase() === filter.trim().toLowerCase());
  }, [branches, filter]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFilter("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-2xs transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0 truncate">
            <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {value || placeholder || "Choisir une branche…"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-1.5 bg-popover border-border shadow-lg"
      >
        <div className="p-1 pb-1.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer les branches…"
              className="pl-8 h-8 text-xs font-mono"
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="max-h-52" viewportClassName="max-h-52">
          <div className="space-y-0.5 p-0.5">
            {filteredBranches.map((branch) => {
              const isSelected = branch === value;
              return (
                <PressButton
                  key={branch}
                  type="button"
                  onPress={() => {
                    onChange(branch);
                    setOpen(false);
                    setFilter("");
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-mono text-left cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "hover:bg-accent/50 text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 truncate">
                    <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{branch}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-2" />}
                </PressButton>
              );
            })}

            {filter.trim() && !hasExactMatch && (
              <PressButton
                type="button"
                onPress={() => {
                  onChange(filter.trim());
                  setOpen(false);
                  setFilter("");
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-mono text-left cursor-pointer hover:bg-accent/50 text-muted-foreground hover:text-foreground border-t border-border/40 mt-1 pt-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="truncate">Use &quot;{filter.trim()}&quot;</span>
              </PressButton>
            )}

            {filteredBranches.length === 0 && !filter.trim() && (
              <div className="p-3 text-center text-xs text-muted-foreground">
                Aucune branche trouvée
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function CreateWorktreeModal({
  isOpen,
  onClose,
  project,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectItem | null;
  onCreated?: (project: ProjectItem) => void;
}) {
  const { client } = usePaseo();
  const { workspaces, createWorktree } = useWorkspace();
  const [tab, setTab] = useState<"new" | "existing">("new");
  const [featureDescription, setFeatureDescription] = useState("");
  const [featureTitle, setFeatureTitle] = useState("");
  const [branchName, setBranchName] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [existingBranch, setExistingBranch] = useState("");
  const [branchSuggestions, setBranchSuggestions] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedRootPath = useMemo(() => {
    if (!project) return "";
    if (project.rootPath) return project.rootPath;
    const ws = workspaces.find((w) => w.projectId === project.id);
    return ws?.path || "";
  }, [project, workspaces]);

  useEffect(() => {
    if (!isOpen || !project) {
      setFeatureDescription("");
      setFeatureTitle("");
      setBranchName("");
      setExistingBranch("");
      setError(null);
      return;
    }

    let cancelled = false;
    const fetchBranches = async () => {
      if (!resolvedRootPath) return;
      setIsLoadingBranches(true);
      try {
        const branches = await client.getBranchSuggestions({ cwd: resolvedRootPath });
        if (!cancelled && Array.isArray(branches) && branches.length > 0) {
          setBranchSuggestions(branches);
          if (branches.includes("main")) {
            setBaseBranch("main");
          } else if (branches.includes("master")) {
            setBaseBranch("master");
          } else {
            setBaseBranch(branches[0] || "main");
          }
          setExistingBranch(branches[0] || "");
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (!cancelled) {
          setIsLoadingBranches(false);
        }
      }
    };

    fetchBranches();
    return () => {
      cancelled = true;
    };
  }, [isOpen, project?.id, resolvedRootPath, client]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !resolvedRootPath) {
      setError("Dossier du projet introuvable");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (tab === "new") {
        let trimmedSlug = branchName.trim().replace(/\s+/g, "-");
        const trimmedDesc = featureDescription.trim();
        const trimmedTitle = featureTitle.trim();

        if (!trimmedSlug && !trimmedDesc) {
          setError("Indique un nom de branche ou une description");
          setIsSubmitting(false);
          return;
        }

        if (!trimmedSlug && trimmedDesc) {
          trimmedSlug = slugify(trimmedDesc).slice(0, 45);
        }

        const res = await createWorktree({
          projectId: project.id,
          cwd: resolvedRootPath,
          worktreeSlug: trimmedSlug || undefined,
          refName: baseBranch.trim() || undefined,
          action: "branch-off",
          nameContext: trimmedDesc || undefined,
          firstAgentContext: trimmedDesc ? { prompt: trimmedDesc } : undefined,
          title: trimmedTitle || (trimmedDesc ? trimmedDesc.slice(0, 60) : undefined),
        });

        if (res.error) {
          setError(res.error);
          setIsSubmitting(false);
          return;
        }
      } else {
        const trimmedRef = existingBranch.trim();
        const trimmedTitle = featureTitle.trim();
        if (!trimmedRef) {
          setError("Une branche existante est requise");
          setIsSubmitting(false);
          return;
        }

        const res = await createWorktree({
          projectId: project.id,
          cwd: resolvedRootPath,
          refName: trimmedRef,
          action: "checkout",
          title: trimmedTitle || undefined,
        });

        if (res.error) {
          setError(res.error);
          setIsSubmitting(false);
          return;
        }
      }

      if (project) {
        onCreated?.(project);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || "Échec de la création du worktree");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <GitFork className="w-4 h-4 text-primary shrink-0" />
            <span>Nouveau worktree</span>
          </DialogTitle>
          <DialogDescription>
            Create a git worktree for{" "}
            <span className="font-semibold text-foreground">
              {project?.name || "project"}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <Tabs
            value={tab}
            onValueChange={(val) => setTab(val as "new" | "existing")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 h-8">
              <TabsTrigger value="new" className="text-xs py-1">
                Nouvelle branche
              </TabsTrigger>
              <TabsTrigger value="existing" className="text-xs py-1">
                Branche existante
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="space-y-3 pt-3">
              {/* Feature Description (AI metadata generation) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Description de la fonctionnalité
                  </Label>
                  <span className="text-[10px] text-muted-foreground/70">Métadonnées IA</span>
                </div>
                <Input
                  type="text"
                  value={featureDescription}
                  onChange={(e) => {
                    setFeatureDescription(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="ex. Ajouter la génération des titres"
                  className="text-xs"
                  autoFocus
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-muted-foreground">
                  Paseo génère le titre et le nom de branche à partir de ce contexte.
                </p>
              </div>

              {/* Branch / Worktree Slug */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5" />
                    Nom de la branche / du worktree
                  </Label>
                  {featureDescription && (
                    <PressButton
                      type="button"
                      onPress={() => setBranchName(slugify(featureDescription).slice(0, 40))}
                      className="text-[11px] text-primary hover:underline cursor-pointer"
                    >
                      Utiliser le nom suggéré
                    </PressButton>
                  )}
                </div>
                <Input
                  type="text"
                  value={branchName}
                  onChange={(e) => {
                    setBranchName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={
                    featureDescription
                      ? slugify(featureDescription).slice(0, 40)
                      : "e.g. feat/dashboard (leave blank to auto-generate)"
                  }
                  className="text-xs font-mono"
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-muted-foreground">
                  Laisse vide pour générer le nom de branche depuis la description.
                </p>
              </div>

              {/* Feature Title (Optional) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" />
                  Titre (facultatif)
                </Label>
                <Input
                  type="text"
                  value={featureTitle}
                  onChange={(e) => setFeatureTitle(e.target.value)}
                  placeholder="ex. Génération des titres"
                  className="text-xs"
                  disabled={isSubmitting}
                />
              </div>

              {/* Base Branch */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <GitFork className="w-3.5 h-3.5" />
                  Branche de départ
                </Label>
                <BranchCombobox
                  value={baseBranch}
                  onChange={(val) => setBaseBranch(val)}
                  branches={branchSuggestions}
                  placeholder="Choisir la branche de départ…"
                  disabled={isSubmitting}
                  isLoading={isLoadingBranches}
                />
                <p className="text-[11px] text-muted-foreground">
                  Le commit ou la branche de départ (main par défaut).
                </p>
              </div>
            </TabsContent>

            <TabsContent value="existing" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5" />
                  Branche existante à récupérer
                </Label>
                <BranchCombobox
                  value={existingBranch}
                  onChange={(val) => {
                    setExistingBranch(val);
                    if (error) setError(null);
                  }}
                  branches={branchSuggestions}
                  placeholder="Choisir la branche à récupérer…"
                  disabled={isSubmitting}
                  isLoading={isLoadingBranches}
                />
                <p className="text-[11px] text-muted-foreground">
                  Récupère une branche locale ou distante dans un nouveau worktree.
                </p>
              </div>

              {/* Feature Title (Optional) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" />
                  Titre (facultatif)
                </Label>
                <Input
                  type="text"
                  value={featureTitle}
                  onChange={(e) => setFeatureTitle(e.target.value)}
                  placeholder="ex. Refonte de la navigation"
                  className="text-xs"
                  disabled={isSubmitting}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onPress={onClose}
              className="text-xs"
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                isSubmitting ||
                (tab === "new"
                  ? !branchName.trim() && !featureDescription.trim()
                  : !existingBranch.trim())
              }
              className="gap-1.5 text-xs font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Création…
                </>
              ) : (
                <>
                  <GitFork className="w-3.5 h-3.5" />
                  Créer le worktree
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const PROJECT_MENU_ITEM =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-accent cursor-pointer touch-manipulation min-h-8";

function ProjectActionsMenu({ project }: { project: ProjectItem }) {
  const { client } = usePaseo();
  const { refreshWorkspaces } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setConfirmRemove(false);
  }, [open]);

  const revealInFinder = async () => {
    try {
      const response = await fetch("/api/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: project.rootPath }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Impossible d'ouvrir le dossier.");
    } catch (error) {
      console.error("reveal:", error);
    }
  };

  const removeProject = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setBusy(true);
    try {
      await client.removeProject(project.id);
      await refreshWorkspaces();
      setOpen(false);
    } catch (error) {
      console.error("removeProject:", error);
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <PressButton
            type="button"
            draggable={false}
            onDragStart={(e) => e.stopPropagation()}
            className="p-1 sm:p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer touch-manipulation"
            title={`Options du projet ${project.name}`}
            aria-label={`Options du projet ${project.name}`}
            aria-expanded={open}
          >
            <MoreVertical className="w-3.5 h-3.5 sm:w-3 sm:h-3 pointer-events-none" />
          </PressButton>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={4} className="w-60 p-1.5">
          <div className="space-y-0.5">
            <PressButton
              type="button"
              draggable={false}
              onDragStart={(e) => e.stopPropagation()}
              onPress={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
              className={PROJECT_MENU_ITEM}
            >
              <Settings className="w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <span className="truncate">Ouvrir les paramètres du projet</span>
            </PressButton>
            <PressButton
              type="button"
              draggable={false}
              onDragStart={(e) => e.stopPropagation()}
              onPress={() => {
                setOpen(false);
                openProjectWindow(project.id, project.name);
              }}
              className={PROJECT_MENU_ITEM}
            >
              <SquareArrowOutUpRight className="w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <span className="truncate">Ouvrir dans une nouvelle fenêtre</span>
            </PressButton>
            <PressButton
              type="button"
              draggable={false}
              onDragStart={(e) => e.stopPropagation()}
              onPress={() => {
                setOpen(false);
                void revealInFinder();
              }}
              className={PROJECT_MENU_ITEM}
            >
              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <span className="truncate">Ouvrir dans le gestionnaire de fichiers</span>
            </PressButton>
            <PressButton
              type="button"
              disabled={busy}
              draggable={false}
              onDragStart={(e) => e.stopPropagation()}
              onPress={() => void removeProject()}
              className={cn(
                PROJECT_MENU_ITEM,
                "text-muted-foreground",
                confirmRemove
                  ? "bg-destructive/10 text-destructive"
                  : "hover:text-destructive",
              )}
            >
              <Trash2 className={cn("w-3.5 h-3.5 pointer-events-none", confirmRemove ? "text-destructive" : "text-muted-foreground")} />
              <span className="truncate">{confirmRemove ? "Confirmer le retrait" : "Retirer le projet"}</span>
            </PressButton>
          </div>
        </PopoverContent>
      </Popover>
      <ProjectSettingsModal project={project} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

function ProjectSettingsModal({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { client } = usePaseo();
  const { refreshWorkspaces } = useWorkspace();
  const [name, setName] = useState(project.name);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(project.name);
      setNotice("");
    }
  }, [open, project.id, project.name]);

  const uploadIcon = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setNotice("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await client.setProjectIcon(project.id, { type: "upload", data: btoa(binary) });
      await refreshWorkspaces();
      setNotice("Icône mise à jour.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Impossible de charger l'icône.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const resetIcon = async () => {
    setBusy(true);
    setNotice("");
    try {
      await client.setProjectIcon(project.id, { type: "automatic" });
      await refreshWorkspaces();
      setNotice("Icône réinitialisée.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Impossible de réinitialiser l'icône.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    setBusy(true);
    setNotice("");
    try {
      if (trimmed && trimmed !== project.name) {
        await client.renameProject(project.id, trimmed);
        await refreshWorkspaces();
      }
      onOpenChange(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Impossible d'enregistrer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Paramètres du projet</DialogTitle>
          <DialogDescription className="truncate font-mono text-[11px]" title={project.rootPath}>
            {project.rootPath}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name" className="text-xs">Nom du projet</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={project.name}
              className="h-9 w-full max-w-full box-border text-xs"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40">
              <ProjectIcon key={`${project.id}-${notice}`} project={project} client={client} className="h-6 w-6" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PressButton
                onPress={() => fileInput.current?.click()}
                disabled={busy}
                className="min-h-8 rounded-lg border border-border px-2.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer touch-manipulation disabled:opacity-50"
              >
                Changer l'icône
              </PressButton>
              <PressButton
                onPress={() => void resetIcon()}
                disabled={busy}
                className="min-h-8 rounded-lg border border-border px-2.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer touch-manipulation disabled:opacity-50"
              >
                Icône automatique
              </PressButton>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
                className="sr-only"
                onChange={(event) => void uploadIcon(event.target.files?.[0])}
              />
            </div>
          </div>
          {notice && <p role="status" className="text-[11px] text-muted-foreground">{notice}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onPress={() => onOpenChange(false)} className="text-xs">Annuler</Button>
          <Button variant="outline" disabled={busy || !name.trim()} onPress={() => void save()} className="text-xs cursor-pointer">
            {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SIDEBAR_FOOTER_ICON =
  "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground cursor-pointer touch-manipulation";

function HelpMenuPopover() {
  const [open, setOpen] = useState(false);

  const openLink = (url: string) => {
    setOpen(false);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shortcut = (label: string, keys: string) => (
    <div className="flex items-center justify-between px-2.5 py-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <kbd className="font-mono text-[10px] text-foreground">{keys}</kbd>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PressButton
          type="button"
          className={SIDEBAR_FOOTER_ICON}
          title="Aide & assistance"
          aria-label="Aide & assistance"
          aria-expanded={open}
        >
          <LifeBuoy className="h-4 w-4 pointer-events-none" />
        </PressButton>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" sideOffset={6} className="w-64 p-1.5">
        <div className="space-y-0.5">
          <PressButton
            type="button"
            onPress={() => openLink("https://github.com/mauvestudio/getaroom")}
            className={PROJECT_MENU_ITEM}
          >
            <BookOpen className="h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <span className="truncate">Documentation getaroom</span>
          </PressButton>
          <PressButton
            type="button"
            onPress={() => openLink("https://github.com/mauvestudio/getaroom/issues")}
            className={PROJECT_MENU_ITEM}
          >
            <Bug className="h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <span className="truncate">Signaler un problème</span>
          </PressButton>
        </div>
        <div className="mt-1.5 border-t border-border/50 pt-1">
          <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Keyboard className="h-3 w-3" />
            Raccourcis
          </div>
          {shortcut("Nouvelle session", "⌘N")}
          {shortcut("Recherche rapide", "⌘K")}
          {shortcut("Réglages", "⌘,")}
          {shortcut("Barre latérale", "⌘" + "\\")}
          {shortcut("Discussion / Terminal", "⌘`")}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UpdateCheckButton() {
  const [result, setResult] = useState<UpdateCheckResult | null>(() => readStoredUpdateCheck());
  const [checking, setChecking] = useState(false);

  const run = async () => {
    if (result?.available && result.url) {
      window.open(result.url, "_blank", "noopener,noreferrer");
      return;
    }
    setChecking(true);
    const next = await checkForUpdate(pkg.version);
    storeUpdateCheck(next);
    setResult(next);
    setChecking(false);
  };

  const title = result?.available
    ? `Mise à jour v${result.latest} disponible (vérifié ${formatCheckTime(result.checkedAt)}) — cliquer pour ouvrir la release`
    : result && !result.error
      ? `À jour (v${pkg.version}) — revérifier les releases GitHub`
      : result?.error
        ? `Dernière vérification : ${result.error} — réessayer`
        : "Vérifier les mises à jour sur GitHub";

  return (
    <PressButton
      type="button"
      onPress={() => void run()}
      className={cn(SIDEBAR_FOOTER_ICON, "relative")}
      title={title}
      aria-label="Mise à jour"
    >
      {checking ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5 pointer-events-none" />
      )}
      {result?.available && !checking && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-foreground" aria-hidden="true" />
      )}
    </PressButton>
  );
}

export function Sidebar({ onCloseMobile, isMobile, onOpenSettings, onOpenSearch }: SidebarProps) {
  const { client } = usePaseo();
  const {
    projects,
    workspaces,
    allAgents,
    activeAgentId,
    activeWorkspaceId,
    setActiveAgentId,
    setActiveWorkspaceId,
    createSession,
    updateWorkspaceTitle,
    pendingPermissions,
  } = useWorkspace();
  // État façon Paseo de chaque session : roue (en cours), vert (terminé), ambre (validation), rouge (erreur).
  const pendingAgentIds = useMemo(() => new Set(pendingPermissions.map((entry) => entry.agentId)), [pendingPermissions]);
  const visualOf = (session: { id: string; status?: string; requiresAttention?: boolean; attentionReason?: string | null }) =>
    sessionVisual(session, pendingAgentIds.has(session.id));

  const { mode, setMode } = useMode();
  const [groupFilter, setGroupFilterState] = useState<GroupFilter>(() => {
    try {
      const v = localStorage.getItem("mauve-group-filter");
      return v === "mauve" || v === "perso" ? v : "all";
    } catch {
      return "all";
    }
  });
  const setGroupFilter = (v: GroupFilter) => {
    setGroupFilterState(v);
    try { localStorage.setItem("mauve-group-filter", v); } catch {}
  };

  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [projectCollapseOverrides, setProjectCollapseOverrides] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      return parseStoredCollapseState(localStorage.getItem("amble-collapsed-projects"));
    }
    return {};
  });

  const [worktreeCollapseOverrides, setWorktreeCollapseOverrides] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      return parseStoredCollapseState(localStorage.getItem("amble-collapsed-worktrees"));
    }
    return {};
  });

  const [targetWorktreeProject, setTargetWorktreeProject] = useState<ProjectItem | null>(null);
  const [isRegisterProjectOpen, setIsRegisterProjectOpen] = useState(false);

  const [projectOrder, setProjectOrder] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      return parseStoredProjectOrder(localStorage.getItem("amble-project-order"));
    }
    return [];
  });

  const [draggedProjectKey, setDraggedProjectKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    key: string;
    position: "above" | "below";
  } | null>(null);

  const recentSessions = useMemo(() => {
    return getRecentSessions(allAgents, 3);
  }, [allAgents]);

  const toggleProjectCollapse = (projectId: string, isCurrentlyCollapsed: boolean) => {
    setProjectCollapseOverrides((prev) => {
      const next = toggleCollapseRecord(prev, projectId, isCurrentlyCollapsed);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("amble-collapsed-projects", JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  const toggleWorktreeCollapse = (worktreeKey: string, isCurrentlyCollapsed: boolean) => {
    setWorktreeCollapseOverrides((prev) => {
      const next = toggleCollapseRecord(prev, worktreeKey, isCurrentlyCollapsed);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("amble-collapsed-worktrees", JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  const fullTree = useMemo(() => {
    // 1. Unique projects by id or rootPath
    const pMap = new Map<string, ProjectItem>();
    for (const p of projects) {
      const key = p.id || p.rootPath;
      if (key && !pMap.has(key)) pMap.set(key, p);
    }

    // 2. Ensure workspaces without an explicit project entry are included
    for (const w of workspaces) {
      const root = w.path;
      const key = w.projectId || root;
      if (root && key && !pMap.has(key) && !root.includes("-worktrees/")) {
        pMap.set(key, {
          id: key,
          name: w.name,
          rootPath: root,
        });
      }
    }

    const items = Array.from(pMap.values()).map((p) => {
      // Find registered workspaces belonging to this project
      const projectWorkspaces = workspaces.filter(
        (w) =>
          w.projectId === p.id ||
          (p.projectKey && w.projectId === p.projectKey) ||
          (p.rootPath && w.path === p.rootPath),
      );

      const directWorkspace = projectWorkspaces.find(
        (w) => w.workspaceKind === "local_checkout" || w.workspaceKind === "directory",
      );
      const worktreeWorkspaces = projectWorkspaces.filter(
        (w) => w.workspaceKind === "worktree",
      );

      const directSessions = directWorkspace
        ? allAgents.filter((a) => a.workspaceId === directWorkspace.id)
        : [];

      const worktrees = worktreeWorkspaces.map((wt) => ({
        title: wt.title,
        branch: wt.branch || wt.worktreeSlug || wt.name,
        workspaceId: wt.id,
        sessions: allAgents.filter((a) => a.workspaceId === wt.id),
      }));

      return {
        project: p,
        directWorkspace,
        directSessions,
        worktrees,
      };
    });

    return sortByGroup(sortProjectsByOrder(items, projectOrder), (i) => i.project.rootPath);
  }, [projects, workspaces, allAgents, projectOrder]);

  const projectTree = useMemo(
    () =>
      groupFilter === "all"
        ? fullTree
        : fullTree.filter((i) => projectGroup(i.project.rootPath) === groupFilter),
    [fullTree, groupFilter],
  );

  const handleDragStart = (e: React.DragEvent, projectKey: string) => {
    setDraggedProjectKey(projectKey);
    e.dataTransfer.setData("text/plain", projectKey);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetKey: string) => {
    if (!draggedProjectKey || draggedProjectKey === targetKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "above" : "below";

    setDropTarget((prev) => {
      if (prev?.key === targetKey && prev?.position === position) return prev;
      return { key: targetKey, position };
    });
  };

  const handleDragLeave = (e: React.DragEvent, targetKey: string) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
      return;
    }
    setDropTarget((prev) => (prev?.key === targetKey ? null : prev));
  };

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    if (!draggedProjectKey || draggedProjectKey === targetKey || !dropTarget) {
      setDraggedProjectKey(null);
      setDropTarget(null);
      return;
    }

    const currentKeys = fullTree.map((item) => getProjectKey(item.project));
    const nextOrder = reorderProjectKeys(
      currentKeys,
      draggedProjectKey,
      targetKey,
      dropTarget.position,
    );

    setProjectOrder(nextOrder);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("amble-project-order", JSON.stringify(nextOrder));
      } catch {}
    }

    setDraggedProjectKey(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedProjectKey(null);
    setDropTarget(null);
  };

  // Automatically uncollapse project/worktree containing the active session
  useEffect(() => {
    if (!activeAgentId) return;
    for (const item of projectTree) {
      if (item.directSessions.some((s) => s.id === activeAgentId)) {
        const isEmpty = isProjectEmpty(item.directSessions, item.worktrees);
        setProjectCollapseOverrides((prev) => {
          const isCollapsed = resolveProjectCollapsed(item.project.id, prev, isEmpty);
          if (!isCollapsed) return prev;
          const next = { ...prev, [item.project.id]: false };
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem("amble-collapsed-projects", JSON.stringify(next));
            } catch {}
          }
          return next;
        });
        break;
      }
      for (const wt of item.worktrees) {
        if (wt.sessions.some((s) => s.id === activeAgentId)) {
          const wtKey = `${item.project.id}:${wt.branch}`;
          const isEmpty = isProjectEmpty(item.directSessions, item.worktrees);
          setProjectCollapseOverrides((prev) => {
            const isProjCollapsed = resolveProjectCollapsed(item.project.id, prev, isEmpty);
            if (!isProjCollapsed) return prev;
            const next = { ...prev, [item.project.id]: false };
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem("amble-collapsed-projects", JSON.stringify(next));
              } catch {}
            }
            return next;
          });
          setWorktreeCollapseOverrides((prev) => {
            const hasChildren = wt.sessions.length > 0;
            const isWtCollapsed = resolveWorktreeCollapsed(wtKey, prev, hasChildren);
            if (!isWtCollapsed) return prev;
            const next = { ...prev, [wtKey]: false };
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem("amble-collapsed-worktrees", JSON.stringify(next));
              } catch {}
            }
            return next;
          });
          break;
        }
      }
    }
  }, [activeAgentId, projectTree]);

  const handleSelectSession = (sessionId: string, workspaceId?: string) => {
    setMode("studio");
    setActiveAgentId(sessionId);
    if (workspaceId) {
      setActiveWorkspaceId(workspaceId);
    }
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const handleSelectProject = (project: ProjectItem, directWorkspace?: WorkspaceItem) => {
    setMode("studio");
    const wsId = directWorkspace?.id || project.id;
    setActiveWorkspaceId(wsId);

    // Find if this project has any active sessions in its workspaces
    const projectWorkspaces = workspaces.filter(
      (w) =>
        w.projectId === project.id ||
        (project.projectKey && w.projectId === project.projectKey) ||
        (project.rootPath && w.path === project.rootPath),
    );
    const firstAgent = allAgents.find((a) =>
      projectWorkspaces.some((w) => w.id === a.workspaceId),
    );
    setActiveAgentId(firstAgent ? firstAgent.id : null);

    if (firstAgent && onCloseMobile) {
      onCloseMobile();
    }
  };

  const handleNewSession = async (workspaceId?: string) => {
    setMode("studio");
    await createSession(undefined, workspaceId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <aside
      className={cn(
        "w-full min-w-0 border-r border-border/60 bg-sidebar flex flex-col h-full shrink-0 select-none",
      )}
    >
      {/* Fixed top header with '+' button and hairline separator */}
      {!isMobile && <div data-tauri-drag-region className="h-[34px] shrink-0 border-b border-border/30" aria-hidden="true" />}
      <div data-tauri-drag-region className="flex h-11 min-w-0 shrink-0 items-center justify-between gap-1 border-b border-border/40 pl-3 pr-2">
        <PressButton
          onPress={() => { setMode("openspace"); onCloseMobile?.(); }}
          aria-label="Retour à Open Space"
          className="flex min-w-0 items-center gap-1 border-0 bg-transparent p-0 font-brand text-[22px] leading-none tracking-tight text-foreground cursor-pointer touch-manipulation"
        ><GetaroomMark className="h-9 w-9" /><span className="truncate">getaroom</span><span className="hidden shrink-0 font-mono text-[10px] leading-none text-muted-foreground/70 lg:inline">v{pkg.version}</span></PressButton>
        <div className="flex shrink-0 items-center gap-0.5">
          {isMobile && onCloseMobile && (
            <PressButton
              type="button"
              onPress={onCloseMobile}
              className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 cursor-pointer md:hidden transition-colors touch-manipulation"
              title="Fermer la barre latérale"
              aria-label="Fermer la barre latérale"
            >
              <X className="w-4 h-4" />
            </PressButton>
          )}
        </div>
      </div>

      {/* Navigation compacte : Open Space, Dev et Room */}
      <div data-tauri-drag-region className="shrink-0 border-b border-border/40 px-3 py-2">
        <ModeSwitch onNavigate={onCloseMobile} />
        {onOpenSearch && (
          <PressButton
            type="button"
            onPress={() => { onCloseMobile?.(); onOpenSearch(); }}
            aria-label="Recherche"
            title="Recherche (⌘K)"
            className="mt-2 flex h-8 w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 text-left text-[12px] text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5 shrink-0 pointer-events-none" />
            <span className="min-w-0 flex-1 truncate">Recherche</span>
            <kbd className="shrink-0 font-mono text-[10px] text-muted-foreground/70">⌘K</kbd>
          </PressButton>
        )}
      </div>

      {mode === "openspace" && (
        <ScrollArea className="sidebar-scroll flex-1 h-full min-h-0" viewportClassName="py-3 px-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3 w-3" /> Activité récente
            </div>
            {recentSessions.length > 0 ? recentSessions.map((session) => (
              <PressTarget
                key={session.id}
                onPress={() => handleSelectSession(session.id, session.workspaceId)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors",
                  activeAgentId === session.id ? "bg-muted/70 text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <SessionStatusIcon state={visualOf(session)} idle={<Sparkles className="h-3.5 w-3.5 shrink-0 opacity-60" />} />
                <span className="min-w-0 flex-1 truncate">{session.title || "Session sans titre"}</span>
                <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70">{formatElapsed(session.updatedAt || session.createdAt)}</span>
              </PressTarget>
            )) : <p className="px-2 py-2 text-[11px] text-muted-foreground">Les sessions récentes apparaîtront ici.</p>}
          </div>
        </ScrollArea>
      )}

      {(mode === "room" || mode === "the-room") && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agents Room</div>
          <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            <RoomAgentList embedded onSelect={() => onCloseMobile?.()} />
          </div>
        </div>
      )}

      {/* Filtre d'univers (Studio Dev) */}
      {mode === "studio" && (
        <div className="flex gap-1 px-3 py-2 border-b border-border/40 shrink-0" role="tablist" aria-label="Univers">
          {(["all", "mauve", "perso"] as GroupFilter[]).map((g) => (
            <PressButton
              key={g}
              role="tab"
              aria-selected={groupFilter === g}
              onPress={() => setGroupFilter(g)}
              className={cn(
                "px-2.5 min-h-8 rounded-full text-[11px] font-medium cursor-pointer transition-colors touch-manipulation",
                groupFilter === g ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {g === "all" ? "Tous" : GROUP_LABEL[g]}
            </PressButton>
          ))}
        </div>
      )}

      {/* Tree list with Shadcn ScrollArea */}
      {mode === "studio" && (
      <ScrollArea className="sidebar-scroll flex-1 h-full min-h-0" viewportClassName="py-3 px-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0">
        {/* Recent Sessions */}
        {recentSessions.length > 0 && (
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between px-1.5 py-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-muted-foreground/80" />
                Récentes
              </span>
            </div>
            <div className="space-y-0.5">
              {recentSessions.map((session) => {
                const isActive = session.id === activeAgentId;
                const elapsed = formatElapsed(session.updatedAt || session.createdAt);
                const contextLabel = getSessionContextLabel(session, workspaces, projects);

                return (
                  <div key={session.id} className="px-0.5">
                    <PressTarget
                      onPress={() => handleSelectSession(session.id, session.workspaceId)}
                      className={cn(
                        "group flex flex-col gap-0.5 px-2 py-1.5 rounded-md text-xs cursor-pointer transition-all",
                        isActive
                          ? "bg-muted/70 text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <SessionStatusIcon state={visualOf(session)} idle={<Sparkles className="w-3 h-3 text-muted-foreground/50 shrink-0" />} />
                          <span className="truncate font-medium text-foreground">
                            {session.title || "Session sans titre"}
                          </span>
                        </div>
                        {elapsed && (
                          <span
                            className={cn(
                              "text-[10px] font-mono shrink-0 ml-1",
                              isActive
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground/70",
                            )}
                          >
                            {elapsed}
                          </span>
                        )}
                      </div>
                      {contextLabel && (
                        <div className="pl-3 text-[10px] font-mono text-muted-foreground/60 truncate">
                          {contextLabel}
                        </div>
                      )}
                    </PressTarget>
                  </div>
                );
              })}
            </div>
            <div className="border-b border-border/40 pt-1.5" />
            <div className="flex items-center justify-between px-1.5 pt-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Projets
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2.5">
          {projectTree.map(({ project, directWorkspace, directSessions, worktrees }, index) => {
            const projectKey = getProjectKey(project);
            const group = projectGroup(project.rootPath);
            const startsGroup =
              groupFilter === "all" &&
              (index === 0 || projectGroup(projectTree[index - 1]!.project.rootPath) !== group);
            const isProjectSelected = mode === "studio" && (activeWorkspaceId === project.id || activeWorkspaceId === directWorkspace?.id || worktrees.some((wt) => wt.workspaceId === activeWorkspaceId) || directSessions.some((session) => session.id === activeAgentId) || worktrees.some((wt) => wt.sessions.some((session) => session.id === activeAgentId)));
            const isBeingDragged = draggedProjectKey === projectKey;
            const isDropTargetAbove = dropTarget?.key === projectKey && dropTarget.position === "above";
            const isDropTargetBelow = dropTarget?.key === projectKey && dropTarget.position === "below";

            const hasChildren =
              directSessions.length > 0 || worktrees.length > 0;
            const isEmpty = isProjectEmpty(directSessions, worktrees);
            const isProjectCollapsed = resolveProjectCollapsed(
              project.id,
              projectCollapseOverrides,
              isEmpty,
            );

            return (
              <React.Fragment key={projectKey}>
                {startsGroup && (
                  <div className="px-1.5 pt-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {GROUP_LABEL[group]}
                  </div>
                )}
              <div
                className={cn(
                  "space-y-0.5 relative transition-opacity",
                  isBeingDragged && "opacity-40",
                )}
                onDragOver={(e) => handleDragOver(e, projectKey)}
                onDragLeave={(e) => handleDragLeave(e, projectKey)}
                onDrop={(e) => handleDrop(e, projectKey)}
              >
                {/* Drop indicator above */}
                {isDropTargetAbove && (
                  <div className="absolute -top-1 left-1 right-1 h-0.5 bg-primary rounded-full z-20 pointer-events-none" />
                )}

                {/* Project Header */}
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, projectKey)}
                  onDragEnd={handleDragEnd}
                  className={cn("group flex items-center justify-between rounded-md px-1.5 py-1 text-foreground transition-colors", isProjectSelected ? "bg-muted/60 font-semibold" : "hover:bg-muted/40")}
                >
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <div
                      className="p-0.5 text-muted-foreground/30 group-hover:text-muted-foreground/80 hover:!text-foreground cursor-grab active:cursor-grabbing shrink-0 transition-colors"
                      title="Glisser pour réordonner le projet"
                      aria-label={`Glisser pour réordonner ${project.name}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical className="w-3.5 h-3.5 pointer-events-none" />
                    </div>

                    <PressButton
                      type="button"
                      draggable={false}
                      onDragStart={(e) => e.stopPropagation()}
                      onPress={() => {
                        toggleProjectCollapse(project.id, isProjectCollapsed);
                      }}
                      className="p-1 sm:p-0.5 rounded text-muted-foreground/60 hover:text-foreground cursor-pointer shrink-0 touch-manipulation"
                      title={isProjectCollapsed ? "Déplier le projet" : "Replier le projet"}
                      aria-label={isProjectCollapsed ? "Déplier le projet" : "Replier le projet"}
                    >
                      <ChevronRight
                        className={`w-3.5 h-3.5 sm:w-3 sm:h-3 pointer-events-none transition-transform duration-150 ${
                          !isProjectCollapsed ? "rotate-90" : ""
                        }`}
                      />
                    </PressButton>

                    <PressTarget
                      onPress={() => {
                        toggleProjectCollapse(project.id, isProjectCollapsed);
                        handleSelectProject(project, directWorkspace);
                      }}
                      className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer truncate touch-manipulation"
                    >
                      <ProjectIcon project={project} client={client} />
                      <span className="font-semibold text-[13px] tracking-tight lowercase truncate">
                        {project.name}
                      </span>
                      {isProjectCollapsed && <SessionStatusIcon state={aggregateVisual([...directSessions, ...worktrees.flatMap((entry) => entry.sessions)].map(visualOf))} />}
                    </PressTarget>
                  </div>

                  <div
                    className={`flex items-center gap-0.5 shrink-0 ${
                      isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    } transition-opacity`}
                  >
                    <PressButton
                      type="button"
                      draggable={false}
                      onDragStart={(e) => e.stopPropagation()}
                      onPress={() => {
                        setTargetWorktreeProject(project);
                      }}
                      className="p-1 sm:p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer touch-manipulation"
                      title={`Nouveau worktree dans ${project.name}`}
                      aria-label={`Nouveau worktree dans ${project.name}`}
                    >
                      <GitFork className="w-3.5 h-3.5 sm:w-3 sm:h-3 pointer-events-none" />
                    </PressButton>
                    <PressButton
                      type="button"
                      draggable={false}
                      onDragStart={(e) => e.stopPropagation()}
                      onPress={() => {
                        handleNewSession(directWorkspace?.id || project.id);
                      }}
                      className="p-1 sm:p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer touch-manipulation"
                      title={`Nouvelle session dans ${project.name}`}
                      aria-label={`Nouvelle session dans ${project.name}`}
                    >
                      <Plus className="w-3.5 h-3.5 sm:w-3 sm:h-3 pointer-events-none" />
                    </PressButton>
                    <ProjectActionsMenu project={project} />
                  </div>
                </div>

                {/* Project Body (Direct Sessions + Worktrees + Empty state) */}
                {!isProjectCollapsed && (
                  <div className="space-y-0.5">
                    {/* Direct Sessions */}
                    {directSessions.map((session) => {
                      const isActive = session.id === activeAgentId;
                      const elapsed = formatElapsed(session.updatedAt || session.createdAt);

                      return (
                        <div key={session.id} className="pl-6 pr-1">
                          <PressTarget
                            onPress={() =>
                              handleSelectSession(
                                session.id,
                                session.workspaceId || directWorkspace?.id || project.id,
                              )
                            }
                            className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer transition-all ${
                              isActive
                                ? "bg-muted/70 text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 truncate">
                              <SessionStatusIcon state={visualOf(session)} />
                              <span className="truncate">
                                {session.title || "Session sans titre"}
                              </span>
                            </div>
                            {elapsed && (
                              <span
                                className={`text-[10px] font-mono shrink-0 ml-1 ${
                                  isActive
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-muted-foreground/70"
                                  }`}
                              >
                                {elapsed}
                              </span>
                            )}
                          </PressTarget>
                        </div>
                      );
                    })}

                    {/* Per-Worktree Sections */}
                    {worktrees.map((wt) => {
                      const wtKey = `${project.id}:${wt.branch}`;
                      const hasWorktreeChildren = wt.sessions.length > 0;
                      const isWorktreeCollapsed = resolveWorktreeCollapsed(
                        wtKey,
                        worktreeCollapseOverrides,
                        hasWorktreeChildren,
                      );
                      const isEditingThisTitle = editingWorkspaceId === wt.workspaceId;
                      const displayTitle = wt.title?.trim();
                      const hasDistinctTitle = Boolean(displayTitle && displayTitle !== wt.branch);

                      return (
                        <div key={wtKey} className="space-y-0.5">
                          {/* Worktree Header */}
                          {isEditingThisTitle ? (
                            <div
                              className="pl-5 pr-2 py-1 flex items-center gap-1.5 rounded bg-accent/40"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GitFork className="w-3.5 h-3.5 shrink-0 text-primary" />
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onKeyDown={async (e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    if (editingTitle.trim() && wt.workspaceId) {
                                      await updateWorkspaceTitle(wt.workspaceId, editingTitle.trim());
                                    }
                                    setEditingWorkspaceId(null);
                                  } else if (e.key === "Escape") {
                                    setEditingWorkspaceId(null);
                                  }
                                }}
                                className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                autoFocus
                              />
                              <PressButton
                                type="button"
                                onPress={async () => {
                                  if (editingTitle.trim() && wt.workspaceId) {
                                    await updateWorkspaceTitle(wt.workspaceId, editingTitle.trim());
                                  }
                                  setEditingWorkspaceId(null);
                                }}
                                className="p-0.5 rounded hover:bg-accent text-primary cursor-pointer"
                                title="Enregistrer le titre"
                              >
                                <Check className="w-3 h-3" />
                              </PressButton>
                              <PressButton
                                type="button"
                                onPress={() => setEditingWorkspaceId(null)}
                                className="p-0.5 rounded hover:bg-accent text-muted-foreground cursor-pointer"
                                title="Annuler"
                              >
                                <X className="w-3 h-3" />
                              </PressButton>
                            </div>
                          ) : (
                            <div className="group pl-5 pr-1 py-1 flex items-center justify-between text-muted-foreground hover:text-foreground rounded hover:bg-accent/30 transition-colors">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                                {hasWorktreeChildren ? (
                                  <PressButton
                                    type="button"
                                    onPress={() => {
                                      toggleWorktreeCollapse(wtKey, isWorktreeCollapsed);
                                    }}
                                    className="p-1 sm:p-0.5 rounded text-muted-foreground/60 hover:text-foreground cursor-pointer shrink-0 touch-manipulation"
                                    title={isWorktreeCollapsed ? "Déplier le worktree" : "Replier le worktree"}
                                    aria-label={isWorktreeCollapsed ? "Déplier le worktree" : "Replier le worktree"}
                                  >
                                    <ChevronRight
                                      className={`w-3.5 h-3.5 sm:w-3 sm:h-3 pointer-events-none transition-transform duration-150 ${
                                        !isWorktreeCollapsed ? "rotate-90" : ""
                                      }`}
                                    />
                                  </PressButton>
                                ) : (
                                  <span className="w-5 sm:w-4 shrink-0" />
                                )}
                                <PressTarget
                                  onPress={() => {
                                    if (wt.workspaceId) {
                                      setActiveWorkspaceId(wt.workspaceId);
                                    }
                                    if (hasWorktreeChildren) {
                                      toggleWorktreeCollapse(wtKey, isWorktreeCollapsed);
                                    }
                                  }}
                                  className={`flex items-center gap-1.5 min-w-0 flex-1 touch-manipulation ${
                                    hasWorktreeChildren || wt.workspaceId ? "cursor-pointer" : "cursor-default"
                                  }`}
                                >
                                  <GitFork className="w-3.5 h-3.5 shrink-0 opacity-70 pointer-events-none" />
                                  {hasDistinctTitle ? (
                                    <div className="flex flex-col min-w-0 leading-tight">
                                      <span className="text-xs font-medium truncate text-foreground">
                                        {displayTitle}
                                      </span>
                                      <span className="text-[10px] font-mono text-muted-foreground/80 truncate">
                                        {wt.branch}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-xs font-medium truncate">{wt.branch}</span>
                                  )}
                                </PressTarget>
                              </div>
                              <div
                                className={`flex items-center gap-0.5 shrink-0 ${
                                  isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                } transition-opacity`}
                              >
                                {wt.workspaceId && (
                                  <PressButton
                                    type="button"
                                    onPress={() => {
                                      setEditingWorkspaceId(wt.workspaceId);
                                      setEditingTitle(wt.title || wt.branch);
                                    }}
                                    className="p-1 sm:p-0.5 rounded hover:text-foreground hover:bg-accent cursor-pointer touch-manipulation"
                                    title="Renommer le titre"
                                    aria-label="Renommer le titre"
                                  >
                                    <Pencil className="w-3.5 h-3.5 sm:w-3 sm:h-3 pointer-events-none" />
                                  </PressButton>
                                )}
                                <PressButton
                                  type="button"
                                  onPress={() => {
                                    handleNewSession(wt.workspaceId || directWorkspace?.id || project.id);
                                  }}
                                  className="p-1 sm:p-0.5 rounded hover:text-foreground hover:bg-accent cursor-pointer touch-manipulation"
                                  title={`Nouvelle session dans ${wt.branch}`}
                                  aria-label={`Nouvelle session dans ${wt.branch}`}
                                >
                                  <Plus className="w-3.5 h-3.5 sm:w-3 sm:h-3 pointer-events-none" />
                                </PressButton>
                              </div>
                            </div>
                          )}

                          {/* Worktree Sessions */}
                          {!isWorktreeCollapsed && (
                            <div className="space-y-0.5">
                              {wt.sessions.map((session) => {
                                const isActive = session.id === activeAgentId;
                                const elapsed = formatElapsed(session.updatedAt || session.createdAt);

                                return (
                                  <div key={session.id} className="pl-9 pr-1">
                                    <PressTarget
                                      onPress={() =>
                                        handleSelectSession(
                                          session.id,
                                          session.workspaceId || wt.workspaceId || project.id,
                                        )
                                      }
                                      className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer transition-all touch-manipulation ${
                                        isActive
                                          ? "bg-muted/70 text-foreground"
                                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                                        <SessionStatusIcon state={visualOf(session)} />
                                        <span className="truncate">
                                          {session.title || "Session sans titre"}
                                        </span>
                                      </div>
                                      {elapsed && (
                                        <span
                                          className={`text-[10px] font-mono shrink-0 ml-1 ${
                                            isActive
                                              ? "text-amber-600 dark:text-amber-400"
                                              : "text-muted-foreground/70"
                                          }`}
                                        >
                                          {elapsed}
                                        </span>
                                      )}
                                    </PressTarget>
                                  </div>
                                );
                              })}

                              {/* Empty Worktree State */}
                              {wt.sessions.length === 0 && (
                                <div className="pl-9 pr-2 py-0.5">
                                  <span className="text-[11px] text-muted-foreground/60 select-none">
                                    Aucune session dans ce worktree.
                                  </span>
                                </div>
                              )}

                              {/* New Session in Worktree Action Item */}
                              <div className="pl-9 pr-1 pt-0.5">
                                <PressButton
                                  type="button"
                                  onPress={() => {
                                    handleNewSession(wt.workspaceId || directWorkspace?.id || project.id);
                                  }}
                                  className="flex items-center gap-1.5 px-2 py-1 sm:py-0.5 rounded text-xs sm:text-[11px] text-muted-foreground/70 hover:text-foreground hover:bg-accent/40 transition-colors cursor-pointer w-full text-left touch-manipulation"
                                  title={`Nouvelle session dans ${wt.branch}`}
                                  aria-label={`Nouvelle session dans ${wt.branch}`}
                                >
                                  <Plus className="w-3.5 h-3.5 sm:w-3 sm:h-3 opacity-70 shrink-0 pointer-events-none" />
                                  <span className="truncate">Nouvelle session…</span>
                                </PressButton>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Empty Project / No Sessions */}
                    {!hasChildren && (
                      <div className="pl-6 pr-2 py-0.5">
                        <span className="text-[11px] text-muted-foreground/60 select-none">
                          Aucune session dans ce projet.
                        </span>
                      </div>
                    )}

                    {/* New Session Action Item */}
                    <div className="pl-6 pr-1 pt-0.5">
                      <PressButton
                        type="button"
                        onPress={() => {
                          handleNewSession(directWorkspace?.id || project.id);
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 sm:py-0.5 rounded text-xs sm:text-[11px] text-muted-foreground/70 hover:text-foreground hover:bg-accent/40 transition-colors cursor-pointer w-full text-left touch-manipulation"
                        title={`Nouvelle session dans ${project.name}`}
                        aria-label={`Nouvelle session dans ${project.name}`}
                      >
                        <Plus className="w-3.5 h-3.5 sm:w-3 sm:h-3 opacity-70 shrink-0 pointer-events-none" />
                        <span className="truncate">Nouvelle session…</span>
                      </PressButton>
                    </div>

                    {/* New Worktree Action Item */}
                    <div className="pl-6 pr-1 pt-0.5">
                      <PressButton
                        type="button"
                        onPress={() => {
                          setTargetWorktreeProject(project);
                        }}
                        className="flex items-center gap-1.5 px-2 py-1 sm:py-0.5 rounded text-xs sm:text-[11px] text-muted-foreground/70 hover:text-foreground hover:bg-accent/40 transition-colors cursor-pointer w-full text-left touch-manipulation"
                        title={`Nouveau worktree dans ${project.name}`}
                        aria-label={`Nouveau worktree dans ${project.name}`}
                      >
                        <GitFork className="w-3.5 h-3.5 sm:w-3 sm:h-3 opacity-70 shrink-0 pointer-events-none" />
                        <span className="truncate">Nouveau worktree…</span>
                      </PressButton>
                    </div>
                  </div>
                )}

                {/* Drop indicator below */}
                {isDropTargetBelow && (
                  <div className="absolute -bottom-1 left-1 right-1 h-0.5 bg-primary rounded-full z-20 pointer-events-none" />
                )}
              </div>
              </React.Fragment>
            );
          })}
        </div>
      </ScrollArea>
      )}

      <div className="shrink-0 border-t border-border/40 px-3 py-2">
        <ProviderUsageGauge />
      </div>

      {/* Pied de sidebar : dossier, mise à jour, aide, réglages (comme Paseo) */}
      <div className="flex h-12 shrink-0 items-center gap-0.5 border-t border-border/40 px-2">
        <PressButton
          type="button"
          onPress={() => setIsRegisterProjectOpen(true)}
          className={SIDEBAR_FOOTER_ICON}
          title="Ajouter un dossier"
          aria-label="Ajouter un dossier"
        >
          <FolderPlus className="h-4 w-4 pointer-events-none" />
        </PressButton>
        <UpdateCheckButton />
        <HelpMenuPopover />
        <div className="ml-auto flex items-center gap-0.5">
          {onOpenSettings && (
            <PressButton
              type="button"
              onPress={onOpenSettings}
              className={SIDEBAR_FOOTER_ICON}
              title="Ouvrir les réglages"
              aria-label="Ouvrir les réglages"
            >
              <Settings className="h-4 w-4 pointer-events-none" />
            </PressButton>
          )}
        </div>
      </div>

      {/* Create Worktree Modal */}
      <CreateWorktreeModal
        isOpen={!!targetWorktreeProject}
        onClose={() => setTargetWorktreeProject(null)}
        project={targetWorktreeProject}
        onCreated={(proj) => {
          setProjectCollapseOverrides((prev) => {
            const next = { ...prev, [proj.id]: false };
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem("amble-collapsed-projects", JSON.stringify(next));
              } catch {}
            }
            return next;
          });
        }}
      />

      {/* Register Project Modal */}
      <RegisterProjectModal
        isOpen={isRegisterProjectOpen}
        onClose={() => setIsRegisterProjectOpen(false)}
        onProjectRegistered={(proj) => {
          if (proj?.id || proj?.projectId) {
            const id = proj.projectId || proj.id;
            setProjectCollapseOverrides((prev) => {
              const next = { ...prev, [id]: false };
              if (typeof window !== "undefined") {
                try {
                  localStorage.setItem("amble-collapsed-projects", JSON.stringify(next));
                } catch {}
              }
              return next;
            });
          }
        }}
      />
    </aside>
  );
}
