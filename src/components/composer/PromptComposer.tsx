import React, { useState, useRef, useEffect, useCallback } from "react";
import { useWorkspace, type NewSessionOptions } from "../../context/WorkspaceContext";
import { useI18n } from "../../i18n/I18nContext";
import { cn } from "../../lib/utils";
import { modeLabel } from "../../lib/mode-labels";
import { ModelSelector } from "./ModelSelector";
import { EffortSelector } from "./EffortSelector";
import { SlashCommands, type SlashCommandItem } from "./SlashCommands";
import { FileMentionPopup } from "./FileMentionPopup";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button, PressButton } from "../ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "../ui/button-group";
import type { ImageAttachment, ActiveTurnBehavior, QueuedFollowup } from "../../lib/paseo/types";
import {
  isValidImageFile,
  fileToImageAttachment,
  getImagesFromClipboard,
} from "../../lib/vision";
import {
  ArrowUp,
  Square,
  Paperclip,
  Hammer,
  Brain,
  HelpCircle,
  Terminal,
  Eraser,
  RotateCcw,
  GitCommit,
  Layers,
  Sparkles,
  FileText,
  Search,
  Check,
  ChevronDown,
  Plus,
  X,
  AlertCircle,
  Image as ImageIcon,
  Navigation,
  Zap,
  Clock,
  Mic,
  ListTodo,
  LoaderCircle,
} from "lucide-react";
import { ContextUsagePill } from "../layout/ContextUsagePill";

function containsDroppedFiles(transfer: DataTransfer | null): boolean {
  if (!transfer) return false;
  const types = Array.from(transfer.types || []).map((type) => type.toLowerCase());
  return (
    types.some((type) => type === "files" || type.includes("file")) ||
    Array.from(transfer.items || []).some((item) => item.kind === "file") ||
    transfer.files.length > 0
  );
}

function getDroppedFiles(transfer: DataTransfer): File[] {
  const files = Array.from(transfer.files);
  for (const item of Array.from(transfer.items || [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }

  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getModeIcon(modeId: string) {
  switch (modeId.toLowerCase()) {
    case "plan":
      return <Brain className="w-3 h-3 text-purple-500" />;
    case "ask":
    case "chat":
      return <HelpCircle className="w-3 h-3 text-blue-500" />;
    case "debug":
      return <Terminal className="w-3 h-3 text-amber-500" />;
    case "review":
      return <Search className="w-3 h-3 text-purple-500" />;
    default:
      return <Hammer className="w-3 h-3 text-emerald-500" />;
  }
}

export function PromptComposer({ initialValue = "", modelProvider, newSessionOptions, focusKey }: { initialValue?: string; modelProvider?: string; newSessionOptions?: NewSessionOptions; focusKey?: number }) {
  const { t } = useI18n();
  const {
    sendMessage,
    isTurnRunning,
    cancelTurn,
    modes,
    selectedMode,
    setSelectedMode,
    canChangeMode,
    toggleDrawer,
    openChangesTab,
    refreshTimeline,
    gitStatus,
    isVisionCapable,
    commands,
    archiveAgentSession,
    createAgentTab,
    activeAgentId,
    queuedFollowups,
    cancelQueuedFollowup,
    summaryMode,
    setSummaryMode,
  } = useWorkspace();

  const isDebugRunning =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("debugRunning");
  const effectiveIsTurnRunning = !newSessionOptions && (isTurnRunning || isDebugRunning);

  const activeAgentQueuedFollowups = (queuedFollowups || []).filter(
    (q) => !activeAgentId || q.agentId === activeAgentId,
  );

  const handleCancelFollowup = (q: QueuedFollowup) => {
    cancelQueuedFollowup(q.id);
    if (!prompt.trim()) {
      setPrompt(q.text);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  const [prompt, setPrompt] = useState(initialValue);
  const [slashFilter, setSlashFilter] = useState<string | null>(null);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [mentionFilter, setMentionFilter] = useState<string | null>(null);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [draftModel, setDraftModel] = useState(newSessionOptions?.model || "");
  const [draftReasoning, setDraftReasoning] = useState(newSessionOptions?.reasoning || "medium");
  const [isListening, setIsListening] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handledDropEventsRef = useRef(new WeakSet<Event>());
  const speechRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const speechAvailable = typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  useEffect(() => {
    setDraftModel(newSessionOptions?.model || "");
    setDraftReasoning(newSessionOptions?.reasoning || "medium");
  }, [newSessionOptions?.provider, newSessionOptions?.model, newSessionOptions?.reasoning]);

  useEffect(() => {
    if (focusKey && focusKey > 0) {
      textareaRef.current?.focus();
    }
  }, [focusKey]);

  useEffect(() => () => speechRef.current?.stop(), []);

  const toggleDictation = () => {
    if (isListening) { speechRef.current?.stop(); setIsListening(false); return; }
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = document.documentElement.lang === "fr" ? "fr-FR" : "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as ArrayLike<any>).map((result: any) => result[0]?.transcript || "").join(" ").trim();
      if (transcript) setPrompt((previous) => `${previous}${previous && !previous.endsWith(" ") ? " " : ""}${transcript}`);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    speechRef.current = recognition;
    try { recognition.start(); setIsListening(true); }
    catch { setIsListening(false); }
  };

  useEffect(() => {
    if (initialValue) {
      setPrompt(initialValue);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, [initialValue]);

  // Autosize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        220,
      )}px`;
    }
  }, [prompt]);

  const handleAddFiles = useCallback(async (files: File[]) => {
    setImageError(null);
    if (files.length === 0) return;

    const newAttachments: ImageAttachment[] = [];
    for (const file of files) {
      const validation = isValidImageFile(file);
      if (!validation.valid) {
        setImageError(validation.error || "Fichier image invalide");
        continue;
      }
      try {
        const att = await fileToImageAttachment(file);
        newAttachments.push(att);
      } catch {
        setImageError(`Lecture de l'image impossible : ${file.name}`);
      }
    }

    if (newAttachments.length > 0) {
      setPendingImages((prev) => [...prev, ...newAttachments]);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAddFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const handleDroppedFiles = useCallback((event: DragEvent) => {
    if (handledDropEventsRef.current.has(event) || !containsDroppedFiles(event.dataTransfer)) return;
    handledDropEventsRef.current.add(event);
    event.preventDefault();
    setIsDraggingOver(false);
    if (!event.dataTransfer) return;

    const imageFiles = getDroppedFiles(event.dataTransfer).filter((file) =>
      file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|heic|avif)$/i.test(file.name),
    );
    if (imageFiles.length > 0) {
      void handleAddFiles(imageFiles);
    } else {
      setImageError("Aucune image reconnue dans les fichiers déposés.");
    }
  }, [handleAddFiles]);

  const removePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const images = getImagesFromClipboard(e);
    if (images.length > 0) {
      e.preventDefault();
      handleAddFiles(images);
    }
  };

  // Window-level drag and drop so users can drop images anywhere into the chat window
  useEffect(() => {
    let dragCounter = 0;

    const handleWindowDragEnter = (e: DragEvent) => {
      if (containsDroppedFiles(e.dataTransfer)) {
        e.preventDefault();
        dragCounter++;
        setIsDraggingOver(true);
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      if (containsDroppedFiles(e.dataTransfer)) {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          setIsDraggingOver(false);
        }
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      if (containsDroppedFiles(e.dataTransfer)) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        setIsDraggingOver(true);
      }
    };

    window.addEventListener("dragenter", handleWindowDragEnter, true);
    window.addEventListener("dragleave", handleWindowDragLeave, true);
    window.addEventListener("dragover", handleWindowDragOver, true);
    window.addEventListener("drop", handleDroppedFiles, true);

    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter, true);
      window.removeEventListener("dragleave", handleWindowDragLeave, true);
      window.removeEventListener("dragover", handleWindowDragOver, true);
      window.removeEventListener("drop", handleDroppedFiles, true);
    };
  }, [handleDroppedFiles]);

  const hasContent = Boolean(prompt.trim() || pendingImages.length > 0);
  const isSteeringActive = effectiveIsTurnRunning && hasContent;

  const creatingSessionRef = useRef(false);
  const handleSend = async (activeTurnBehavior?: ActiveTurnBehavior) => {
    const trimmed = prompt.trim();
    if (creatingSessionRef.current || (!trimmed && pendingImages.length === 0)) return;
    if (newSessionOptions) creatingSessionRef.current = true;

    const imagesToSend = pendingImages.length > 0 ? [...pendingImages] : undefined;
    const textToSend = trimmed || (imagesToSend?.length ? "Décris cette image" : "");

    setPrompt("");
    setPendingImages([]);
    setImageError(null);
    setSlashFilter(null);
    setMentionFilter(null);

    try {
      await sendMessage(textToSend, undefined, imagesToSend, {
        activeTurnBehavior: effectiveIsTurnRunning ? (activeTurnBehavior || "steer") : undefined,
        newSession: newSessionOptions ? { ...newSessionOptions, model: draftModel || newSessionOptions.model, reasoning: draftReasoning || newSessionOptions.reasoning } : undefined,
      });
    } catch (err) {
      console.error("[PromptComposer] Send failed:", err);
      // Le message n'est jamais perdu : il revient dans le champ, avec la raison de l'échec.
      setPrompt((current) => current || trimmed);
      if (imagesToSend) setPendingImages((current) => current.length ? current : imagesToSend);
      setImageError(err instanceof Error ? err.message : "Le message n’a pas pu être envoyé.");
    } finally {
      creatingSessionRef.current = false;
    }
  };

  const getCommandIcon = (cmd: { name: string; kind?: string }) => {
    if (cmd.kind === "skill") {
      return <Sparkles className="w-3.5 h-3.5 text-amber-500" />;
    }
    const name = cmd.name.toLowerCase();
    if (name === "compact" || name === "summarize") {
      return <Layers className="w-3.5 h-3.5 text-purple-500" />;
    }
    if (name.includes("git") || name === "review") {
      return <GitCommit className="w-3.5 h-3.5 text-blue-500" />;
    }
    if (name.includes("init")) {
      return <FileText className="w-3.5 h-3.5 text-emerald-500" />;
    }
    if (name.includes("search") || name.includes("exa")) {
      return <Search className="w-3.5 h-3.5 text-purple-500" />;
    }
    return <Terminal className="w-3.5 h-3.5 text-primary" />;
  };

  const modeSlashCommands: SlashCommandItem[] = !newSessionOptions && canChangeMode
    ? modes.map((m) => ({
        name: m.id.toLowerCase(),
        description: m.description || `Passer en ${modeLabel(m.name)}`,
        kind: "mode" as const,
        icon: getModeIcon(m.id),
        action: () => {
          setSelectedMode(m.id);
          setPrompt("");
          setSlashFilter(null);
        },
      }))
    : [];

  const providerSlashCommands: SlashCommandItem[] = (commands || []).map((cmd) => ({
    name: cmd.name,
    description: cmd.description,
    argumentHint: cmd.argumentHint,
    kind: cmd.kind || "command",
    icon: getCommandIcon(cmd),
    action: () => {
      setPrompt(`/${cmd.name} `);
      setSlashFilter(null);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    },
  }));

  const localActionCommands: SlashCommandItem[] = [
    {
      name: "terminal",
      description: "Ouvrir le terminal intégré",
      kind: "action",
      icon: <Terminal className="w-3.5 h-3.5 text-amber-500" />,
      action: () => {
        toggleDrawer("terminal");
        setPrompt("");
        setSlashFilter(null);
      },
    },
    ...(!modelProvider && gitStatus?.isGitRepo ? [{
      name: "git",
      description: "Ouvrir les changements git et le diff",
      kind: "action" as const,
      icon: <GitCommit className="w-3.5 h-3.5 text-blue-500" />,
      action: () => {
        openChangesTab();
        setPrompt("");
        setSlashFilter(null);
      },
    }] : []),
    {
      name: "clear",
      description: "Archiver cet agent et repartir de zéro",
      kind: "action",
      icon: <Eraser className="w-3.5 h-3.5 text-rose-500" />,
      action: async () => {
        setPrompt("");
        setSlashFilter(null);
        if (activeAgentId) {
          await archiveAgentSession(activeAgentId);
          await createAgentTab();
        }
      },
    },
    {
      name: "exit",
      description: "Archiver l'agent actuel",
      kind: "action",
      icon: <Eraser className="w-3.5 h-3.5 text-rose-500" />,
      action: async () => {
        setPrompt("");
        setSlashFilter(null);
        if (activeAgentId) {
          await archiveAgentSession(activeAgentId);
        }
      },
    },
  ];

  // Merge commands, prioritizing provider commands & skills
  const slashCommands: SlashCommandItem[] = [];
  const seenNames = new Set<string>();

  for (const cmd of [...providerSlashCommands, ...modeSlashCommands, ...localActionCommands]) {
    const key = cmd.name.toLowerCase();
    if (!seenNames.has(key)) {
      seenNames.add(key);
      slashCommands.push(cmd);
    }
  }

  const filteredSlashCommands =
    slashFilter !== null
      ? slashCommands.filter(
          (c) =>
            c.name.toLowerCase().includes(slashFilter.toLowerCase()) ||
            c.description.toLowerCase().includes(slashFilter.toLowerCase()),
        )
      : [];

  useEffect(() => {
    setSelectedSlashIndex(0);
  }, [slashFilter]);

  const handleSlashSelect = (cmd: SlashCommandItem) => {
    cmd.action();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashFilter !== null && filteredSlashCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSlashIndex(
          (prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length,
        );
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const picked = filteredSlashCommands[selectedSlashIndex];
        if (picked) {
          handleSlashSelect(picked);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashFilter(null);
        return;
      }
    }

    if (e.key === "Enter") {
      if (e.altKey) {
        e.preventDefault();
        if (effectiveIsTurnRunning) {
          handleSend("followup");
        } else {
          handleSend();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        if (effectiveIsTurnRunning) {
          handleSend("interrupt");
        } else {
          handleSend();
        }
        return;
      }
      if (!e.shiftKey) {
        e.preventDefault();
        if (effectiveIsTurnRunning) {
          handleSend("steer");
        } else {
          handleSend();
        }
        return;
      }
    } else if (e.key === "Escape") {
      setSlashFilter(null);
      setMentionFilter(null);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPrompt(val);

    // Check for slash command trigger
    const cursor = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const slashMatch = textBeforeCursor.match(/(?:^|\n)\/([a-zA-Z0-9_-]*)$/);
    if (slashMatch) {
      setSlashFilter(slashMatch[1] ?? "");
    } else {
      setSlashFilter(null);
    }

    // Check for file mention trigger
    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_./-]*)$/);
    if (mentionMatch) {
      setMentionFilter(mentionMatch[1] ?? "");
    } else {
      setMentionFilter(null);
    }
  };

  const currentMode = modes.find((mode) => mode.id === selectedMode) || modes[0];

  const sampleFiles = [
    ...(gitStatus?.stagedFiles.map((f) => f.path) || []),
    ...(gitStatus?.unstagedFiles.map((f) => f.path) || []),
    "package.json",
    "src/index.ts",
    "src/App.tsx",
    "src/frontend.tsx",
    "docs/PLAN.md",
  ];

  const handleMentionSelect = (filePath: string) => {
    if (textareaRef.current) {
      const cursor = textareaRef.current.selectionStart || prompt.length;
      const textBeforeCursor = prompt.slice(0, cursor).replace(/@[a-zA-Z0-9_./-]*$/, `@${filePath} `);
      const textAfterCursor = prompt.slice(cursor);
      setPrompt(`${textBeforeCursor}${textAfterCursor}`);
      setMentionFilter(null);
    }
  };

  const dictationButton = speechAvailable ? <PressButton
    type="button"
    onPress={toggleDictation}
    aria-pressed={isListening}
    aria-label={isListening ? t("Arrêter la dictée") : t("Dicter un message")}
    title={isListening ? t("Arrêter la dictée") : t("Dicter un message")}
    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted/60 ${isListening ? "text-destructive" : "text-muted-foreground"}`}
  ><Mic className="h-4 w-4" /></PressButton> : null;

  return (
    <div
      style={{ paddingBottom: "max(0.5rem, var(--safe-area-bottom, 0px))" }}
      className="relative w-full max-w-[1500px] mx-auto px-3 sm:px-5 pt-0 shrink-0 min-w-0"
    >
      {/* Popups */}
      {slashFilter !== null && (
        <SlashCommands
          filter={slashFilter}
          onSelect={handleSlashSelect}
          commands={slashCommands}
          selectedIndex={selectedSlashIndex}
        />
      )}

      {mentionFilter !== null && (
        <FileMentionPopup
          filter={mentionFilter}
          files={sampleFiles}
          onSelect={handleMentionSelect}
        />
      )}

      {/* Full-window drop target overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs pointer-events-none transition-all">
          <div className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-primary bg-card/95 shadow-2xl space-y-3 max-w-sm text-center">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <Plus className="w-8 h-8" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">
                Dépose des images pour les joindre
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                PNG, JPEG, WebP ou GIF, jusqu’à 20 Mo
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Composer Box */}
      <div
        onDrop={(event) => handleDroppedFiles(event.nativeEvent)}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest("button, input, textarea, select, [role='button'], [data-radix-collection-item], a")) {
            textareaRef.current?.focus();
          }
        }}
        className={`max-w-3xl mx-auto rounded-2xl border ${
          isDraggingOver
            ? "border-primary ring-2 ring-primary/20 bg-primary/5"
            : "border-border/70 bg-card"
        } p-2.5 space-y-1 text-card-foreground cursor-text`}
      >
        {/* Error Notification */}
        {imageError && (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{imageError}</span>
            </div>
            <PressButton
              type="button"
              onPress={() => setImageError(null)}
              className="p-0.5 rounded-sm hover:bg-destructive/20 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </PressButton>
          </div>
        )}

        {/* Queued Follow-ups Preview Strip */}
        {activeAgentQueuedFollowups.length > 0 && (
          <div className="space-y-1.5 p-1 pt-0">
            {activeAgentQueuedFollowups.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-card-foreground shadow-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                    Suite en attente :
                  </span>
                  <span className="truncate text-muted-foreground font-normal">
                    {q.text}
                  </span>
                </div>
                <PressButton
                  type="button"
                  onPress={() => handleCancelFollowup(q)}
                  className="p-0.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors shrink-0"
                  title="Annuler la suite"
                  aria-label="Annuler la suite"
                >
                  <X className="w-3 h-3" />
                </PressButton>
              </div>
            ))}
          </div>
        )}

        {/* Pending Image Attachments Preview Strip - Style Paseo */}
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-2 pb-1">
            {pendingImages.map((img, idx) => (
              <div
                key={idx}
                className="group relative flex items-center gap-2 rounded border border-border bg-card px-2 py-1.5 text-foreground"
              >
                <img
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={img.name || `Image ${idx + 1}`}
                  className="w-8 h-8 rounded border border-border/40 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium truncate">
                    {img.name || `Image ${idx + 1}`}
                  </div>
                  {img.size && (
                    <div className="text-[10px] text-muted-foreground">
                      {(img.size / 1024).toFixed(0)} KB
                    </div>
                  )}
                </div>
                <PressButton
                  type="button"
                  onPress={() => removePendingImage(idx)}
                  className="p-1 rounded-md bg-card border border-border hover:bg-muted/60 hover:text-muted-foreground"
                  aria-label="Supprimer"
                >
                  <X className="w-3 h-3" />
                </PressButton>
              </div>
            ))}
          </div>
        )}

        {/* Text Input Area */}
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            effectiveIsTurnRunning
              ? "Écrire à l'agent en cours… (Entrée : réorienter, ⌘↵ : interrompre, ⌥↵ : suite)"
              : t("Écrivez à l’agent, mentionnez des @fichiers ou utilisez les /commandes et /skills")
          }
          rows={1}
          className="w-full min-h-[44px] resize-none bg-transparent border-0 px-2 py-1 text-base sm:text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-hidden leading-relaxed max-h-56 touch-manipulation"
        />

        {/* Controls Row */}
        <div className="flex items-center justify-between gap-1.5 pt-1 select-none">
          {/* Left: Image upload button & Mode/Model/Effort selectors */}
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden sm:gap-2 [scrollbar-width:thin]">
            {/* Upload Button: Always available on mobile and desktop */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
            <PressButton
              type="button"
              onPress={() => fileInputRef.current?.click()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors touch-manipulation"
              title={
                isVisionCapable
                  ? "Joindre une image (modèle avec vision)"
                  : "Joindre une image"
              }
              aria-label="Joindre une image"
            >
              <Paperclip className="w-4 h-4 text-muted-foreground" />
            </PressButton>

            {/* Mode, Model & Effort: hidden on mobile during active turn with text so steering controls fit */}
            <div
              className={cn(
                "items-center gap-1 sm:gap-1.5 shrink-0",
                isSteeringActive ? "hidden sm:flex" : "flex",
              )}
            >
              {/* Show a mode picker only when the provider can actually change modes. */}
              {!newSessionOptions && modes.length > 1 && canChangeMode && (
                <>
                  {currentMode && (
                    <Popover open={isModeMenuOpen} onOpenChange={setIsModeMenuOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          disabled={!canChangeMode}
                          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-default disabled:opacity-70 touch-manipulation"
                          title={
                            canChangeMode
                              ? `Mode de l'agent : ${modeLabel(currentMode.name)} (toucher pour changer)`
                              : `Mode : ${modeLabel(currentMode.name)}`
                          }
                          aria-label={`Mode de l'agent : ${currentMode.name}`}
                        >
                          {getModeIcon(currentMode.id)}
                          <span className="min-w-0 truncate">{modeLabel(currentMode.name)}</span>
                          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        sideOffset={6}
                        className="w-56 p-1.5"
                      >
                        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Mode de l'agent
                        </div>
                        <div className="space-y-0.5">
                          {modes.map((m) => {
                            const isActive = m.id === selectedMode;
                            return (
                              <PressButton
                                key={m.id}
                                type="button"
                                disabled={!canChangeMode || isActive}
                                onPress={() => {
                                  setSelectedMode(m.id);
                                  setIsModeMenuOpen(false);
                                }}
                                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors disabled:cursor-default ${
                                  isActive
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-foreground hover:bg-accent cursor-pointer"
                                }`}
                              >
                                {getModeIcon(m.id)}
                                <span className="min-w-0 flex-1 truncate">{modeLabel(m.name)}</span>
                                {isActive && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                              </PressButton>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </>
              )}

              {/* Model & Effort */}
              <ModelSelector providerFilter={modelProvider} value={newSessionOptions ? draftModel : undefined} onSelect={newSessionOptions ? setDraftModel : undefined} quiet />
              <EffortSelector providerFilter={modelProvider} value={newSessionOptions ? draftReasoning : undefined} onSelect={newSessionOptions ? setDraftReasoning : undefined} modelId={newSessionOptions ? draftModel : undefined} quiet />
            </div>
            <PressButton type="button" onPress={() => { setSlashFilter(""); textareaRef.current?.focus(); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground" title={t("Commandes et skills")} aria-label={t("Commandes et skills")}><Zap className="h-4 w-4" /></PressButton>
            <PressButton type="button" onPress={() => setSummaryMode((value) => !value)} aria-pressed={summaryMode} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted/60 ${summaryMode ? "text-foreground" : "text-muted-foreground"}`} title={t("Afficher ou masquer le résumé d’activité")} aria-label={t("Afficher ou masquer le résumé d’activité")}><ListTodo className="h-4 w-4" /></PressButton>
          </div>

          {/* Right: Context gauge, then Submit / Steer / Interrupt Action */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-auto">
            <div className="hidden sm:block h-4 w-px bg-border/60 shrink-0" aria-hidden="true" />
            <ContextUsagePill />
            {effectiveIsTurnRunning ? (
              hasContent ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <ButtonGroup className="rounded-lg overflow-hidden border border-border/60 bg-transparent">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onPress={() => handleSend("steer")}
                      className="h-9 rounded-none px-2.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground cursor-pointer gap-1.5 touch-manipulation"
                      title="Réorienter (Entrée) : injecter le message dans le tour en cours sans l'arrêter"
                      aria-label="Réorienter le tour en cours"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Réorienter</span>
                    </Button>
                    <ButtonGroupSeparator className="bg-primary-foreground/20" />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onPress={() => handleSend("interrupt")}
                      className="h-9 rounded-none px-2.5 text-xs font-medium bg-transparent text-muted-foreground hover:bg-destructive/15 hover:text-destructive cursor-pointer gap-1.5 transition-colors touch-manipulation"
                      title="Interrompre (⌘↵ / Ctrl+Entrée) : arrêter le tour en cours et en démarrer un nouveau"
                      aria-label="Interrompre et démarrer un nouveau tour"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Interrompre</span>
                    </Button>
                    <ButtonGroupSeparator className="bg-border" />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onPress={() => handleSend("followup")}
                      className="h-9 rounded-none px-2.5 text-xs font-medium bg-transparent text-muted-foreground hover:bg-blue-500/15 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer gap-1.5 transition-colors touch-manipulation"
                      title="Suite (⌥↵ / Alt+Entrée) : envoyer le message quand l'agent a fini"
                      aria-label="Suite une fois l'agent terminé"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Suite</span>
                    </Button>
                  </ButtonGroup>

                  <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                  {dictationButton}

                  <PressButton
                    type="button"
                    onPress={cancelTurn}
                    className="h-9 w-9 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center justify-center cursor-pointer shrink-0 touch-manipulation"
                    title="Arrêter la génération sans envoyer"
                    aria-label="Arrêter la génération"
                  >
                    <Square className="w-3 h-3 fill-current stroke-none" />
                  </PressButton>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                  {dictationButton}
                  <PressButton type="button" onPress={cancelTurn} className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90" title="Arrêter la génération" aria-label="Arrêter la génération"><Square className="h-3.5 w-3.5 fill-current stroke-none" /></PressButton>
                </div>
              )
            ) : (
              <>{dictationButton}<PressButton
                type="button"
                onPress={() => handleSend()}
                disabled={!hasContent}
                className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-medium cursor-pointer transition-colors shrink-0 touch-manipulation ${
                  hasContent
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                }`}
                title="Envoyer le message (Entrée)"
                aria-label="Envoyer le message"
              >
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </PressButton></>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
