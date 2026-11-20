import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileDiff,
  FilePlus2,
  Files,
  Folder,
  FolderPlus,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { usePaseo } from "../../context/PaseoContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { GitFileChange } from "../../lib/paseo/types";
import { resolveWorkspacePath } from "../../lib/resolve-workspace-path";
import { cn } from "../../lib/utils";
import { DiffViewer } from "../chat/DiffViewer";
import { PressButton } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type PanelTab = "files" | "changes";
type FileEntry = { name: string; path: string; kind: "file" | "directory"; size: number; modifiedAt: string };
type ChangeNode = { name: string; path: string; file?: GitFileChange; children: Map<string, ChangeNode> };

const INTENTS: Record<GitFileChange["status"], { label: string; className: string }> = {
  added: { label: "A", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  modified: { label: "M", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  deleted: { label: "D", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  renamed: { label: "R", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
};

function buildChangeTree(files: GitFileChange[]): ChangeNode[] {
  const root = new Map<string, ChangeNode>();
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let branch = root;
    let parentPath = "";
    parts.forEach((part, index) => {
      const path = parentPath ? `${parentPath}/${part}` : part;
      let node = branch.get(part);
      if (!node) {
        node = { name: part, path, children: new Map() };
        branch.set(part, node);
      }
      if (index === parts.length - 1) node.file = file;
      branch = node.children;
      parentPath = path;
    });
  }
  return [...root.values()].sort((a, b) => {
    if (Boolean(a.file) !== Boolean(b.file)) return a.file ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

function nodeStats(node: ChangeNode): { additions: number; deletions: number; count: number } {
  if (node.file) return {
    additions: node.file.insertions || 0,
    deletions: node.file.deletions || 0,
    count: 1,
  };
  return [...node.children.values()].reduce(
    (sum, child) => {
      const stat = nodeStats(child);
      sum.additions += stat.additions;
      sum.deletions += stat.deletions;
      sum.count += stat.count;
      return sum;
    },
    { additions: 0, deletions: 0, count: 0 },
  );
}

function BranchSelector({ onError }: { onError: (message: string) => void }) {
  const { activeWorkspace, gitStatus, refreshGitStatus } = useWorkspace();
  const { getClientForHost } = usePaseo();
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const cwd = activeWorkspace?.path || "";
  const client = getClientForHost("local");

  const loadBranches = async () => {
    if (!cwd || !client) return;
    try {
      const validCwd = await resolveWorkspacePath(cwd);
      setBranches(await client.getBranchSuggestions({ cwd: validCwd, limit: 100 }));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  const switchBranch = async (branch: string) => {
    if (!cwd || !client || busy) return;
    setBusy(true);
    try {
      const validCwd = await resolveWorkspacePath(cwd);
      const result = await client.checkoutSwitchBranch(validCwd, branch);
      const payload = result as { success?: boolean; error?: string | { message?: string } };
      if (payload?.success === false || payload?.error) {
        throw new Error(typeof payload.error === "string" ? payload.error : payload.error?.message || "Impossible de changer de branche.");
      }
      await refreshGitStatus();
      setOpen(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(value) => { setOpen(value); if (value) void loadBranches(); }}>
      <PopoverTrigger asChild>
        <PressButton
          className="flex h-8 min-w-0 items-center gap-1.5 border-b border-border px-3 text-left text-xs text-foreground hover:bg-muted/40"
          title="Changer de branche"
          aria-label="Sélecteur de branche"
        >
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground pointer-events-none" />
          <span className="truncate font-mono">{gitStatus?.branch || "main"}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground pointer-events-none" />
          {busy && <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />}
        </PressButton>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={2} className="max-h-64 w-64 overflow-y-auto p-1.5">
        <div className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Branches</div>
        {branches.map((branch) => (
          <PressButton
            key={branch}
            onPress={() => void switchBranch(branch)}
            disabled={busy}
            className="flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 text-left font-mono text-[11px] hover:bg-accent disabled:opacity-50"
          >
            {branch === gitStatus?.branch ? <Check className="h-3 w-3 text-primary" /> : <span className="w-3" />}
            <span className="truncate">{branch}</span>
          </PressButton>
        ))}
        {branches.length === 0 && <p className="px-2.5 py-3 text-xs text-muted-foreground">Aucune branche disponible.</p>}
      </PopoverContent>
    </Popover>
  );
}

function CreateEntryDialog({
  cwd,
  parentPath,
  kind,
  onClose,
  onCreated,
}: {
  cwd: string;
  parentPath: string;
  kind: "file" | "directory" | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { getClientForHost } = usePaseo();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const client = getClientForHost("local");

  useEffect(() => {
    if (kind) { setName(""); setError(""); }
  }, [kind]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!kind || !trimmed || !client || !cwd) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.createFileEntry({ cwd, parentPath, name: trimmed, kind });
      if ((result as { error?: string | null })?.error) throw new Error(String((result as { error?: string }).error));
      onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={kind !== null} onOpenChange={(value) => { if (!value) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{kind === "directory" ? "Nouveau dossier" : "Nouveau fichier"}</DialogTitle>
          <DialogDescription className="truncate font-mono text-[10px]">{parentPath || cwd}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void create(event)} className="space-y-3">
          <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "directory" ? "nom-du-dossier" : "nom-du-fichier"} />
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <PressButton onPress={onClose} className="min-h-9 rounded-lg border border-border px-3 text-xs">Annuler</PressButton>
            <PressButton type="submit" disabled={!name.trim() || busy} className="min-h-9 rounded-lg bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Créer"}
            </PressButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WorkspacePanel({
  view,
  onViewChange,
  onClose,
}: {
  view: PanelTab;
  onViewChange: (tab: PanelTab) => void;
  onClose: () => void;
}) {
  const { activeWorkspace, gitStatus, refreshGitStatus } = useWorkspace();
  const { getClientForHost } = usePaseo();
  const client = getClientForHost("local");
  const cwd = activeWorkspace?.path || "";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [directory, setDirectory] = useState("");
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [createKind, setCreateKind] = useState<"file" | "directory" | null>(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "staged" | "unstaged">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [selectedChange, setSelectedChange] = useState<GitFileChange | null>(null);
  const directoryRequestRef = useRef(0);
  const [resolvedCwd, setResolvedCwd] = useState("");

  const loadDirectory = useCallback(async (path: string) => {
    const requestId = ++directoryRequestRef.current;
    if (!cwd || !cwd.startsWith("/") || !client) { setFiles([]); setBusy(false); return; }
    setBusy(true);
    setError("");
    try {
      const validCwd = await resolveWorkspacePath(cwd);
      if (requestId !== directoryRequestRef.current) return;
      setResolvedCwd(validCwd);
      const result = await client.listDirectory(validCwd, path) as {
        directory?: { entries?: FileEntry[] } | null;
        error?: string | null;
      };
      if (requestId !== directoryRequestRef.current) return;
      if (result.error) throw new Error(result.error);
      setFiles(result.directory?.entries || []);
      setDirectory(path);
    } catch (cause) {
      if (requestId !== directoryRequestRef.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setFiles([]);
    } finally {
      if (requestId === directoryRequestRef.current) setBusy(false);
    }
  }, [cwd, client]);

  useEffect(() => {
    directoryRequestRef.current += 1;
    setSelectedPath("");
    setSelectedText("");
    setDirectory("");
    setResolvedCwd("");
    setFiles([]);
    void loadDirectory("");
  }, [cwd, loadDirectory]);

  useEffect(() => {
    if (view !== "changes" || !cwd) return;
    let cancelled = false;
    setError("");
    void resolveWorkspacePath(cwd)
      .then((path) => { if (!cancelled) setResolvedCwd(path); })
      .catch((cause) => {
        if (!cancelled) {
          setResolvedCwd("");
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => { cancelled = true; };
  }, [cwd, view]);

  const openFile = async (entry: FileEntry) => {
    if (!client) return;
    setSelectedPath(entry.path);
    setFileLoading(true);
    setSelectedText("");
    try {
      if (!resolvedCwd) throw new Error("Le dossier du workspace n’est pas encore validé.");
      const result = await client.readFile(resolvedCwd, entry.path, 512 * 1024);
      if (result.kind !== "text") {
        setSelectedText("Aperçu indisponible pour ce fichier binaire.");
      } else {
        setSelectedText(new TextDecoder().decode(result.bytes));
      }
    } catch (cause) {
      setSelectedText(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setFileLoading(false);
    }
  };

  const sourceFiles = filter === "staged"
    ? gitStatus?.stagedFiles || []
    : filter === "unstaged"
      ? gitStatus?.unstagedFiles || []
      : [...(gitStatus?.stagedFiles || []), ...(gitStatus?.unstagedFiles || [])];
  const allChanges = [
    ...sourceFiles,
    ...(filter === "staged" ? [] : (gitStatus?.untrackedFiles || []).map((path) => ({ path, status: "added" as const, insertions: 0, deletions: 0 }))),
  ];
  const additions = allChanges.reduce((sum, file) => sum + (file.insertions || 0), 0);
  const deletions = allChanges.reduce((sum, file) => sum + (file.deletions || 0), 0);
  const tree = useMemo(() => buildChangeTree(allChanges), [allChanges]);
  const visibleEntries = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return [...files]
      .filter((entry) => !search || entry.path.toLocaleLowerCase().includes(search) || entry.name.toLocaleLowerCase().includes(search))
      .sort((a, b) => Number(b.kind === "directory") - Number(a.kind === "directory") || a.name.localeCompare(b.name));
  }, [files, query]);

  const closePanel = () => {
    onClose();
  };

  const renderChangeNode = (node: ChangeNode, depth = 0): React.ReactNode => {
    const isFolder = !node.file;
    const stats = nodeStats(node);
    const expanded = expandedFolders.has(node.path);
    if (isFolder) {
      return (
        <div key={node.path}>
          <PressButton
            onPress={() => setExpandedFolders((prev) => {
              const next = new Set(prev);
              expanded ? next.delete(node.path) : next.add(node.path);
              return next;
            })}
            className="flex min-h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-[11px] text-foreground hover:bg-muted/60"
            style={{ paddingLeft: `${8 + depth * 12}px` }}
          >
            {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            <ChangeCounts additions={stats.additions} deletions={stats.deletions} />
          </PressButton>
          {expanded && [...node.children.values()].sort((a, b) => Number(Boolean(a.file)) - Number(Boolean(b.file)) || a.name.localeCompare(b.name)).map((child) => renderChangeNode(child, depth + 1))}
        </div>
      );
    }
    const file = node.file!;
    const badge = INTENTS[file.status];
    return (
      <PressButton
        key={node.path}
        onPress={() => setSelectedChange(file)}
        className={cn(
          "flex min-h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-[11px] hover:bg-muted/60",
          selectedChange?.path === file.path ? "bg-muted text-foreground" : "text-muted-foreground",
        )}
        style={{ paddingLeft: `${18 + depth * 12}px` }}
        title={file.path}
      >
        <File className="h-3 w-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-mono">{node.name}</span>
        <ChangeCounts additions={file.insertions || 0} deletions={file.deletions || 0} />
        <span className={cn("ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 font-mono text-[9px] font-semibold", badge.className)}>{badge.label}</span>
      </PressButton>
    );
  };

  return (
    <aside aria-label="Fichiers et modifications" className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex h-9 shrink-0 items-stretch border-b border-border/70 px-2">
        <PressButton
          role="tab"
          aria-selected={view === "files"}
          onPress={() => onViewChange("files")}
          className={cn("flex items-center border-b-2 px-2.5 text-xs", view === "files" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >Fichiers</PressButton>
        <PressButton
          role="tab"
          aria-selected={view === "changes"}
          onPress={() => onViewChange("changes")}
          className={cn("flex items-center gap-1.5 border-b-2 px-2.5 text-xs", view === "changes" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          Modifications
          {allChanges.length > 0 && <span className="rounded-full bg-muted px-1.5 font-mono text-[9px]">{allChanges.length}</span>}
        </PressButton>
        <div className="ml-auto flex items-center gap-0.5">
          <Popover>
            <PopoverTrigger asChild>
              <PressButton className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Créer un fichier ou dossier" aria-label="Ajouter un fichier ou dossier">
                <Plus className="h-4 w-4 pointer-events-none" />
              </PressButton>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              <PressButton onPress={() => setCreateKind("file")} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent"><FilePlus2 className="h-3.5 w-3.5" />Nouveau fichier</PressButton>
              <PressButton onPress={() => setCreateKind("directory")} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent"><FolderPlus className="h-3.5 w-3.5" />Nouveau dossier</PressButton>
            </PopoverContent>
          </Popover>
          <PressButton onPress={closePanel} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Fermer le panneau" aria-label="Fermer le panneau"><X className="h-3.5 w-3.5 pointer-events-none" /></PressButton>
        </div>
      </header>

      <BranchSelector onError={setError} />
      {error && <div role="alert" className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-[10px] text-destructive"><AlertCircle className="h-3 w-3" />{error}</div>}

      {view === "files" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col border-r border-border/60">
            <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 px-2">
              <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate font-mono text-[10px] text-muted-foreground">{selectedPath || "Aucun fichier ouvert"}</span>
              <PressButton onPress={() => void loadDirectory(directory)} className="ml-auto flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted" title="Actualiser les fichiers"><RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} /></PressButton>
            </div>
            {selectedPath ? (
              fileLoading ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div> :
                <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-5 text-foreground"><code>{selectedText}</code></pre>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <FileCode2 className="h-7 w-7 opacity-40" />
                <span className="text-xs">Aucun fichier ouvert</span>
                <span className="text-[10px]">Choisis un fichier dans l’arborescence.</span>
              </div>
            )}
          </div>
          <div className="flex w-[42%] min-w-[150px] max-w-[240px] shrink-0 flex-col">
            <div className="border-b border-border/60 p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher des fichiers…" className="h-7 w-full rounded-md border border-border/70 bg-background pl-7 pr-2 text-[10px] text-foreground outline-none focus:border-ring" />
              </div>
              <div className="mt-1.5 truncate font-mono text-[9px] text-muted-foreground">{directory || cwd}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {busy && files.length === 0 ? <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div> : visibleEntries.map((entry) => (
                <PressButton
                  key={entry.path}
                  onPress={() => entry.kind === "directory" ? void loadDirectory(entry.path) : void openFile(entry)}
                  className={cn("flex min-h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[10px] hover:bg-muted/70", selectedPath === entry.path ? "bg-muted text-foreground" : "text-muted-foreground")}
                  title={entry.path}
                >
                  {entry.kind === "directory" ? <Folder className="h-3 w-3 shrink-0" /> : <File className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{entry.name}</span>
                </PressButton>
              ))}
              {!busy && visibleEntries.length === 0 && <p className="p-3 text-center text-[10px] text-muted-foreground">Aucun fichier.</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 px-2">
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <PressButton className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs font-medium text-foreground hover:bg-muted" aria-label="Filtrer les modifications">
                  <span className="truncate">{filter === "all" ? "Toutes les modifications" : filter === "staged" ? "Modifications préparées" : "Modifications locales"}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                </PressButton>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-52 p-1">
                {([["all", "Toutes les modifications"], ["staged", "Préparées"], ["unstaged", "Locales"]] as const).map(([value, label]) => (
                  <PressButton key={value} onPress={() => { setFilter(value); setFilterOpen(false); }} className="flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-accent">
                    {filter === value ? <Check className="h-3 w-3 text-primary" /> : <span className="w-3" />}{label}
                  </PressButton>
                ))}
              </PopoverContent>
            </Popover>
            <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
              {additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>}
              {deletions > 0 && <span className="text-rose-600 dark:text-rose-400">-{deletions}</span>}
            </span>
            <PressButton onPress={() => void refreshGitStatus()} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted" title="Actualiser les modifications"><RefreshCw className="h-3 w-3" /></PressButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {tree.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted-foreground">
                <FileDiff className="h-6 w-6 opacity-40" />
                <span className="text-xs">Aucune modification</span>
              </div>
            ) : tree.map((node) => renderChangeNode(node))}
          </div>
          {selectedChange && (
            <div className="flex max-h-[42%] shrink-0 flex-col border-t border-border/70">
              <div className="flex h-8 items-center gap-2 px-2">
                <FileDiff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-[10px]">{selectedChange.path}</span>
                <PressButton onPress={() => setSelectedChange(null)} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted" aria-label="Fermer le diff"><X className="h-3 w-3" /></PressButton>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-2">
                {selectedChange.diff ? <DiffViewer filePath={selectedChange.path} diffText={selectedChange.diff} /> : <p className="p-3 text-center text-[10px] text-muted-foreground">Diff indisponible pour ce fichier.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      <CreateEntryDialog
      cwd={resolvedCwd}
        parentPath={directory}
        kind={createKind}
        onClose={() => setCreateKind(null)}
        onCreated={() => { void loadDirectory(directory); void refreshGitStatus(); }}
      />
    </aside>
  );
}

function ChangeCounts({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] tabular-nums">
      {additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>}
      {deletions > 0 && <span className="text-rose-600 dark:text-rose-400">-{deletions}</span>}
    </span>
  );
}
