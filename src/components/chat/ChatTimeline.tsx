import React, { useEffect, useRef, useState, useLayoutEffect, useMemo } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { ScrollArea } from "../ui/scroll-area";
import { TimelineMinimap } from "./TimelineMinimap";
import { useVisualHistory } from "../../lib/visual-history";
import { PressButton } from "../ui/button";
import { UserCard } from "./UserCard";
import { AssistantMessage } from "./AssistantMessage";
import { ThinkingTrace } from "./ThinkingTrace";
import { ToolActivityGroup } from "./ToolActivityGroup";
import { TodoBlock } from "./TodoBlock";
import { CompactionMarker } from "./CompactionMarker";
import { ApprovalCard } from "../room/ApprovalCard";
import { SummaryTurnCard } from "./SummaryTurnCard";
import { DiagnosticNotice } from "../ui/DiagnosticNotice";
import { getAgentHostId } from "../../lib/paseo/multi-host-client";
import {
  Sparkles,
  ArrowDown,
  AlertCircle,
  Terminal,
  FileCode,
  Search,
  Loader2,
} from "lucide-react";
import type {
  TimelineItem,
  UserMessageTimelineItem,
  ToolCallTimelineItem,
  ReasoningTimelineItem,
  AssistantMessageTimelineItem,
  TodoTimelineItem,
  CompactionTimelineItem,
  ErrorTimelineItem,
} from "../../lib/paseo/types";

interface TurnGroup {
  id: string;
  userMessage?: UserMessageTimelineItem;
  toolCalls: ToolCallTimelineItem[];
  reasonings: ReasoningTimelineItem[];
  todos: TodoTimelineItem[];
  compactions: CompactionTimelineItem[];
  errors: ErrorTimelineItem[];
  assistantMessages: AssistantMessageTimelineItem[];
  isCurrentRunningTurn: boolean;
}

export function ChatTimeline({ onSelectPrompt }: { onSelectPrompt?: (prompt: string) => void }) {
  const {
    timeline,
    isTimelineLoading,
    refreshTimeline,
    isTurnRunning,
    activeAgent,
    activeWorkspace,
    gitStatus,
    activeAgentId,
    pendingPermissions,
    respondToPermission,
    summaryMode,
  } = useWorkspace();

  const agentPendingPermissions = useMemo(() => {
    if (!activeAgentId) return [];
    return pendingPermissions.filter((p) => p.agentId === activeAgentId);
  }, [pendingPermissions, activeAgentId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [visualHistory] = useVisualHistory();
  const contentRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const initialScrollDoneRef = useRef<string | null>(null);
  const prevTimelineLengthRef = useRef<number>(0);
  const isPinnedToBottomRef = useRef<boolean>(true);
  const prevIsTurnRunningRef = useRef<boolean>(isTurnRunning);

  // Track the user's choice for each thought block while it streams.
  const [userReasoningOverrides, setUserReasoningOverrides] = useState<Record<string, boolean>>({});
  const isSwitchingSessionRef = useRef(false);
  const switchSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group timeline items into conversation turns for Summary Mode
  const turnGroups = useMemo<TurnGroup[]>(() => {
    if (!summaryMode) return [];

    const groups: TurnGroup[] = [];
    let currentGroup: TurnGroup = {
      id: "group-0",
      toolCalls: [],
      reasonings: [],
      todos: [],
      compactions: [],
      errors: [],
      assistantMessages: [],
      isCurrentRunningTurn: false,
    };

    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      if (!item) continue;

      if (item.type === "user_message") {
        if (
          currentGroup.userMessage ||
          currentGroup.toolCalls.length > 0 ||
          currentGroup.reasonings.length > 0 ||
          currentGroup.todos.length > 0 ||
          currentGroup.compactions.length > 0 ||
          currentGroup.errors.length > 0 ||
          currentGroup.assistantMessages.length > 0
        ) {
          groups.push(currentGroup);
        }
        currentGroup = {
          id: `turn-${i}`,
          userMessage: item,
          toolCalls: [],
          reasonings: [],
          todos: [],
          compactions: [],
          errors: [],
          assistantMessages: [],
          isCurrentRunningTurn: false,
        };
      } else {
        switch (item.type) {
          case "tool_call":
            currentGroup.toolCalls.push(item);
            break;
          case "reasoning":
            currentGroup.reasonings.push(item);
            break;
          case "todo":
            currentGroup.todos.push(item);
            break;
          case "compaction":
            currentGroup.compactions.push(item);
            break;
          case "error":
            currentGroup.errors.push(item);
            break;
          case "assistant_message":
            currentGroup.assistantMessages.push(item);
            break;
        }
      }
    }

    if (
      currentGroup.userMessage ||
      currentGroup.toolCalls.length > 0 ||
      currentGroup.reasonings.length > 0 ||
      currentGroup.todos.length > 0 ||
      currentGroup.compactions.length > 0 ||
      currentGroup.errors.length > 0 ||
      currentGroup.assistantMessages.length > 0
    ) {
      groups.push(currentGroup);
    }

    if (isTurnRunning && groups.length > 0) {
      const last = groups[groups.length - 1];
      if (last) {
        last.isCurrentRunningTurn = true;
      }
    }

    return groups;
  }, [timeline, summaryMode, isTurnRunning]);

  // Reset overrides and trigger session switch pinning when switching active agent / session
  useEffect(() => {
    isSwitchingSessionRef.current = true;
    initialScrollDoneRef.current = null;
    isPinnedToBottomRef.current = true;
  }, [activeAgentId]);

  // Observe inner content container resizes to keep bottom pinned when new tokens/content stream in
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (isSwitchingSessionRef.current) return;

      // Only auto-scroll to bottom on resize if a turn is actively running,
      // so user clicks (like expanding tool calls or thoughts) do not jump the scroll position
      if (isPinnedToBottomRef.current && isTurnRunning && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [isTurnRunning]);

  // Instant scroll to bottom on initial load / session switch (no animation)
  useLayoutEffect(() => {
    if (!scrollRef.current || timeline.length === 0) return;

    const currentAgentKey = activeAgentId || "default";
    const isNewSession = initialScrollDoneRef.current !== currentAgentKey;

    if (isNewSession) {
      initialScrollDoneRef.current = currentAgentKey;
      isSwitchingSessionRef.current = true;
      isPinnedToBottomRef.current = true;
      setShowScrollBottom(false);
      if (switchSettleTimeoutRef.current) {
        clearTimeout(switchSettleTimeoutRef.current);
      }

      // Immediately pin to bottom before paint
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      prevTimelineLengthRef.current = timeline.length;

      // Keep pinned to bottom on consecutive animation frames as markdown & syntax highlighters expand
      const frame1 = requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        const frame2 = requestAnimationFrame(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        });
      });

      switchSettleTimeoutRef.current = setTimeout(() => {
        isSwitchingSessionRef.current = false;
      }, 250);

      return () => {
        cancelAnimationFrame(frame1);
      };
    }

    // If still in the session switch settlement window, keep pinned instantly without animation
    if (isSwitchingSessionRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      prevTimelineLengthRef.current = timeline.length;
      return;
    }

    const wasRunning = prevIsTurnRunningRef.current;
    prevIsTurnRunningRef.current = isTurnRunning;
    const isTurnCompleted = wasRunning && !isTurnRunning;

    const lastItem = timeline[timeline.length - 1];
    if (lastItem?.type === "user_message" || agentPendingPermissions.length > 0) {
      isPinnedToBottomRef.current = true;
    }

    // If user is pinned to bottom OR a turn has just completed:
    if (isPinnedToBottomRef.current || isTurnCompleted) {
      if (isTurnCompleted) {
        isPinnedToBottomRef.current = true;
      }

      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;

      // Consecutive frame settling to ensure code blocks and syntax-highlighted blocks are fully scrolled
      const frame1 = requestAnimationFrame(() => {
        if (scrollRef.current && isPinnedToBottomRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        const frame2 = requestAnimationFrame(() => {
          if (scrollRef.current && isPinnedToBottomRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        });
      });

      return () => {
        cancelAnimationFrame(frame1);
      };
    }

    prevTimelineLengthRef.current = timeline.length;
  }, [timeline, activeAgentId, isTurnRunning, agentPendingPermissions.length]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isUp = distanceFromBottom > 100;
    setShowScrollBottom(isUp);

    // If user is near the bottom, keep them pinned.
    // If they scrolled up > 100px, respect their position and don't auto-scroll.
    if (distanceFromBottom <= 50) {
      isPinnedToBottomRef.current = true;
    } else if (distanceFromBottom > 100) {
      isPinnedToBottomRef.current = false;
    }
  };

  const scrollToBottomSmooth = () => {
    isPinnedToBottomRef.current = true;
    setShowScrollBottom(false);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const samplePrompts = [
    { label: "Analyser la structure du projet", icon: <Search className="w-3.5 h-3.5" />, prompt: "Explore le code et explique l'architecture principale et l'organisation des dossiers." },
    { label: "Lancer les tests et examiner les échecs", icon: <Terminal className="w-3.5 h-3.5" />, prompt: "Lance la suite de tests et résume les échecs avec des corrections proposées." },
    ...(gitStatus?.isGitRepo ? [{ label: "Relire les derniers changements Git", icon: <FileCode className="w-3.5 h-3.5" />, prompt: "Inspecte l'état git, les derniers commits et résume les modifications en cours." }] : []),
  ];

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
      {/* Scrollable Container with Shadcn ScrollArea */}
      {visualHistory && <TimelineMinimap viewportRef={scrollRef} contentRef={contentRef} revision={`${activeAgentId}:${timeline.length}:${summaryMode}`} onJump={() => { isPinnedToBottomRef.current = false; }} />}
      <ScrollArea
        type="auto"
        hideScrollbar
        viewportRef={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 w-full"
        viewportClassName="px-4 sm:px-6 md:px-10 py-6 sm:py-10"
      >
        <div ref={contentRef} className="space-y-5 max-w-3xl w-full mx-auto min-w-0">
          {isTimelineLoading && timeline.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-xs">Chargement de l'historique…</span>
            </div>
          ) : timeline.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col justify-center min-h-[48vh] max-w-lg mx-auto select-none">
              <div className="mb-8">
                <h2 className="text-lg font-medium tracking-tight text-foreground">
                  Sur quoi veux-tu avancer ?
                </h2>
                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                  {activeWorkspace?.path?.split("/").filter(Boolean).at(-1) || activeWorkspace?.name || "Espace actuel"} · pose une question, modifie du code ou relis un diff.
                </p>
              </div>

              <div className="border-t border-border/60">
                {samplePrompts.map((item, idx) => (
                  <PressButton
                    key={idx}
                    onPress={() => onSelectPrompt?.(item.prompt)}
                    className="group flex w-full items-center gap-3 border-b border-border/60 py-3 text-left text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <span className="shrink-0 text-muted-foreground/70">{item.icon}</span>
                    <span className="min-w-0 flex-1 text-[13px]">{item.label}</span>
                    <span className="shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5">→</span>
                  </PressButton>
                ))}
              </div>
            </div>
          ) : summaryMode ? (
            /* Summary Mode: Grouped turns */
            turnGroups.map((group) => {
              const hasActivity =
                group.toolCalls.length > 0 ||
                group.reasonings.length > 0 ||
                group.todos.length > 0;
              return (
                <div key={group.id} className="space-y-2">
                  {/* User Card */}
                  {group.userMessage && <UserCard item={group.userMessage} />}

                  {/* Compactions */}
                  {group.compactions.map((compaction, cIdx) => (
                    <CompactionMarker key={`comp-${cIdx}`} item={compaction} />
                  ))}

                  {/* Summary Card or Direct Assistant Message */}
                  {hasActivity ? (
                    <SummaryTurnCard
                      toolCalls={group.toolCalls}
                      reasonings={group.reasonings}
                      todos={group.todos}
                      assistantMessage={group.assistantMessages[0]}
                      isCurrentRunningTurn={group.isCurrentRunningTurn}
                      activeAgentCwd={activeAgent?.cwd}
                    />
                  ) : (
                    group.assistantMessages.map((msg, mIdx) => (
                      <AssistantMessage key={`msg-${mIdx}`} item={msg} />
                    ))
                  )}

                  {/* Additional assistant messages if more than one in turn */}
                  {hasActivity &&
                    group.assistantMessages.slice(1).map((msg, mIdx) => (
                      <AssistantMessage key={`extra-msg-${mIdx}`} item={msg} />
                    ))}

                  {/* In-flight indicator if no activity and running */}
                  {!hasActivity &&
                    group.isCurrentRunningTurn &&
                    group.assistantMessages.length === 0 && (
                      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground select-none">
                        <Loader2 className="w-3 h-3 animate-spin text-amber-500/80 shrink-0" />
                        <span>L'agent travaille…</span>
                      </div>
                    )}

                  {/* Errors */}
                  {group.errors.map((err, eIdx) => (
                    <div
                      key={`err-${eIdx}`}
                      className="my-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2 font-mono"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{err.message}</span>
                    </div>
                  ))}
                </div>
              );
            })
          ) : (
            /* Timeline items */
            timeline.map((item, index) => {
              switch (item.type) {
                case "user_message":
                  return <UserCard key={index} item={item} />;
                case "assistant_message":
                  return <AssistantMessage key={index} item={item} />;
                case "reasoning": {
                  let start = index;
                  // Reasoning chunks and assistant status messages can alternate
                  // during one Paseo turn. Keep them in one disclosure until the
                  // next user prompt instead of rendering a new collapsed row for
                  // every chunk.
                  while (start > 0 && timeline[start - 1]?.type !== "user_message") start--;
                  if (timeline.slice(start, index).some((entry) => entry.type === "reasoning")) return null;

                  const texts: string[] = [];
                  let isStreaming = false;
                  let durationMs = 0;
                  let turnId: string | undefined;
                  for (let cursor = index; cursor < timeline.length; cursor++) {
                    const next = timeline[cursor];
                    if (next?.type === "user_message") break;
                    if (next?.type !== "reasoning") continue;
                    turnId ||= next.turnId;
                    if (next.text?.trim()) texts.push(next.text.trim());
                    if (next.isStreaming) isStreaming = true;
                    if (next.durationMs) durationMs += next.durationMs;
                  }

                  const boundary = timeline[start];
                  const boundaryId = boundary?.type === "user_message"
                    ? boundary.clientMessageId || boundary.messageId || boundary.timestamp
                    : undefined;
                  const reasoningKey = `${activeAgentId || "session"}:${turnId || boundaryId || `index-${start}`}`;
                  // Match Paseo: reasoning is collapsed by default. Streaming a
                  // new thought must not override a user's collapse choice.
                  const isExpanded = userReasoningOverrides[reasoningKey] ?? false;

                  return (
                    <ThinkingTrace
                      key={`reasoning-${reasoningKey}`}
                      text={texts.join("\n\n")}
                      isStreaming={isStreaming}
                      durationMs={durationMs || undefined}
                      isExpanded={isExpanded}
                      onToggle={() => {
                        const nextExpanded = !isExpanded;
                        setUserReasoningOverrides((prev) => ({ ...prev, [reasoningKey]: nextExpanded }));
                      }}
                    />
                  );
                }
                case "tool_call": {
                  // One compact activity row for the whole agent segment, even when
                  // reasoning or progress items appear between tool calls.
                  let start = index;
                  while (start > 0 && timeline[start - 1]?.type !== "user_message" && timeline[start - 1]?.type !== "assistant_message") start--;
                  if (timeline.slice(start, index).some((entry) => entry.type === "tool_call")) return null;
                  const calls: ToolCallTimelineItem[] = [];
                  for (let cursor = index; cursor < timeline.length; cursor++) {
                    const next = timeline[cursor];
                    if (next?.type === "user_message" || next?.type === "assistant_message") break;
                    if (next?.type === "tool_call") calls.push(next);
                  }
                  return <ToolActivityGroup key={`tools-${index}`} items={calls} />;
                }
                case "todo":
                  return <TodoBlock key={index} item={item} />;
                case "compaction":
                  return <CompactionMarker key={index} item={item} />;
                case "error":
                  // Échec de chargement de l'historique : cause réelle (démon, hôte, provider) plutôt que message brut.
                  if (item.message.startsWith("Impossible de charger l’historique") || item.message.startsWith("L’hôte Paseo de cette session")) {
                    return (
                      <div key={index} className="my-3 space-y-2">
                        <DiagnosticNotice error={item.message} hostId={activeAgentId ? getAgentHostId(activeAgentId) : undefined} providerId={activeAgent?.provider} />
                        {timeline.length === 1 && (
                          <PressButton onPress={() => void refreshTimeline(activeAgentId || undefined)} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted">
                            Réessayer
                          </PressButton>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={index}
                      className="my-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex flex-wrap items-center gap-2 font-mono"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{item.message}</span>
                      {timeline.length === 1 && item.message.startsWith("Impossible de charger l’historique") && (
                        <PressButton
                          onPress={() => void refreshTimeline(activeAgentId || undefined)}
                          className="ml-auto rounded-lg border border-destructive/30 px-2 py-1 text-xs font-sans hover:bg-destructive/10"
                        >
                          Réessayer
                        </PressButton>
                      )}
                    </div>
                  );
                default:
                  return null;
              }
            })
          )}

          {/* Pending Permission Requests / Question Prompts */}
          {agentPendingPermissions.map((permission) => (
            <ApprovalCard
              key={permission.key}
              permission={permission}
              onRespond={(response) =>
                respondToPermission(permission.agentId, permission.request.id, response)
              }
            />
          ))}
        </div>
      </ScrollArea>

      {/* Scroll to bottom button */}
      {showScrollBottom && (
        <PressButton
          onPress={scrollToBottomSmooth}
          className="absolute bottom-3 right-4 sm:bottom-4 sm:right-8 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 cursor-pointer transition-all z-20"
          title="Aller en bas"
        >
          <ArrowDown className="w-4 h-4" />
        </PressButton>
      )}
    </div>
  );
}
