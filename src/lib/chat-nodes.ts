// Mise en page du fil de discussion : comme Paseo, une séquence de réflexions et d'actions (appels d'outils) entre deux
// éléments visibles forme UN seul groupe repliable — jamais une ligne « Raisonnement » par réflexion, ni deux lignes
// d'activité d'affilée. Fonction pure : testable sans React.
import type { ReasoningTimelineItem, TimelineItem, ToolCallTimelineItem } from "./paseo/types";

export type ActivityEntry =
  | { kind: "reasoning"; item: ReasoningTimelineItem }
  | { kind: "tool"; item: ToolCallTimelineItem };

export type ChatNode =
  | { kind: "item"; item: TimelineItem; index: number }
  | { kind: "activity"; firstIndex: number; entries: ActivityEntry[] };

/** Éléments qui s'affichent à eux seuls : ils coupent une séquence d'activité. Les autres types sont invisibles. */
const VISIBLE_TYPES = new Set(["user_message", "assistant_message", "todo", "compaction", "error"]);

export function buildChatNodes(timeline: readonly TimelineItem[]): ChatNode[] {
  const nodes: ChatNode[] = [];
  let run: Extract<ChatNode, { kind: "activity" }> | null = null;
  let seenReasoning = new Set<string>();
  let seenCalls = new Set<string>();

  const flush = () => {
    if (run) nodes.push(run);
    run = null;
    seenReasoning = new Set();
    seenCalls = new Set();
  };

  timeline.forEach((item, index) => {
    if (item.type === "reasoning" || item.type === "tool_call") {
      run ??= { kind: "activity", firstIndex: index, entries: [] };
      if (item.type === "reasoning") {
        // Une même réflexion reçue deux fois (historique relu, événement rejoué) ne compte qu'une fois.
        const text = item.text?.trim() ?? "";
        if (text && seenReasoning.has(text)) return;
        if (text) seenReasoning.add(text);
        run.entries.push({ kind: "reasoning", item });
      } else {
        if (seenCalls.has(item.callId)) return;
        seenCalls.add(item.callId);
        run.entries.push({ kind: "tool", item });
      }
      return;
    }
    if (!VISIBLE_TYPES.has(item.type)) return; // invisible : ne coupe pas la séquence
    flush();
    nodes.push({ kind: "item", item, index });
  });
  flush();
  return nodes;
}

export interface ActivitySummary {
  reasoningTexts: string[];
  reasoningMs: number;
  reasoningStreaming: boolean;
  toolCalls: ToolCallTimelineItem[];
}

export function summarizeActivity(entries: readonly ActivityEntry[]): ActivitySummary {
  const summary: ActivitySummary = { reasoningTexts: [], reasoningMs: 0, reasoningStreaming: false, toolCalls: [] };
  for (const entry of entries) {
    if (entry.kind === "tool") { summary.toolCalls.push(entry.item); continue; }
    if (entry.item.text?.trim()) summary.reasoningTexts.push(entry.item.text.trim());
    if (entry.item.isStreaming) summary.reasoningStreaming = true;
    summary.reasoningMs += entry.item.durationMs ?? 0;
  }
  return summary;
}

/** « 5.3 s » (< 10 s, une décimale) ou « 16 s ». */
export function formatDuration(ms: number): string | null {
  return ms > 0 ? `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s` : null;
}
