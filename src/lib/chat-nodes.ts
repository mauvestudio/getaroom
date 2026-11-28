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

export interface TurnFooter {
  /** Index (dans la timeline) du message utilisateur qui ouvre le tour, s'il existe. */
  userIndex: number | null;
  /** Durée du tour (message utilisateur → dernière réponse), si les deux horodatages sont connus. */
  durationMs: number | null;
  /** Dernier tour terminé de la conversation (ses statistiques sont celles de `agent.lastUsage`). */
  isLastTurn: boolean;
}

/**
 * Comme le « turnFooter » de Paseo : un seul pied par tour, sous la DERNIÈRE réponse de l'agent (avant le message
 * utilisateur suivant). Le tour en cours n'en a pas tant qu'il tourne. Clé : index de la réponse dans la timeline.
 */
export function computeTurnFooters(nodes: readonly ChatNode[], isTurnRunning: boolean): Map<number, TurnFooter> {
  const footers = new Map<number, TurnFooter>();
  let userItem: { index: number; timestamp?: string } | null = null;
  let lastAssistant: { index: number; timestamp?: string } | null = null;
  const closeTurn = (isLastTurn: boolean) => {
    if (!lastAssistant) return;
    const start = userItem?.timestamp ? Date.parse(userItem.timestamp) : NaN;
    const end = lastAssistant.timestamp ? Date.parse(lastAssistant.timestamp) : NaN;
    footers.set(lastAssistant.index, {
      userIndex: userItem?.index ?? null,
      durationMs: end > start ? end - start : null,
      isLastTurn,
    });
  };
  for (const node of nodes) {
    if (node.kind !== "item") continue;
    if (node.item.type === "user_message") {
      closeTurn(false);
      userItem = { index: node.index, timestamp: node.item.timestamp };
      lastAssistant = null;
    } else if (node.item.type === "assistant_message") {
      lastAssistant = { index: node.index, timestamp: node.item.timestamp };
    }
  }
  if (!isTurnRunning) closeTurn(true);
  return footers;
}
