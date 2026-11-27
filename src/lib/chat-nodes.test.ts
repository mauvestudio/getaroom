import { describe, expect, test } from "bun:test";
import { buildChatNodes, formatDuration, summarizeActivity } from "./chat-nodes";
import type { TimelineItem } from "./paseo/types";

const reasoning = (text: string, durationMs = 0): TimelineItem => ({ type: "reasoning", text, durationMs });
const tool = (callId: string): TimelineItem => ({ type: "tool_call", callId, name: "Bash", status: "completed" } as TimelineItem);
const user = (text: string): TimelineItem => ({ type: "user_message", text } as TimelineItem);
const assistant = (text: string): TimelineItem => ({ type: "assistant_message", text } as TimelineItem);
const kinds = (timeline: TimelineItem[]) => buildChatNodes(timeline).map((node) => node.kind === "item" ? node.item.type : "activity");

describe("séquences d'activité (comme Paseo)", () => {
  test("réflexions et actions consécutives forment une seule ligne", () => {
    expect(kinds([user("go"), reasoning("a"), tool("1"), reasoning("b"), tool("2"), assistant("fait")])).toEqual(["user_message", "activity", "assistant_message"]);
  });
  test("des réflexions seules d'affilée ne donnent qu'une ligne (jamais une file de « Raisonnement »)", () => {
    const stack = Array.from({ length: 30 }, (_, i) => reasoning(`pensée ${i}`, i % 2 ? 16000 : 5300));
    expect(kinds(stack)).toEqual(["activity"]);
  });
  test("la file du bug signalé : 5,3 s / 16 s répétés, textes identiques → doublons écartés", () => {
    const pattern = Array.from({ length: 20 }, (_, i) => reasoning(i % 2 ? "B" : "A", i % 2 ? 16000 : 5300));
    const [node] = buildChatNodes(pattern);
    expect(node?.kind).toBe("activity");
    expect(node?.kind === "activity" ? node.entries.length : 0).toBe(2);
  });
  test("un message visible coupe la séquence : une ligne par séquence, intercalée avec les messages", () => {
    expect(kinds([reasoning("a"), tool("1"), assistant("étape 1"), reasoning("b"), tool("2"), assistant("étape 2")]))
      .toEqual(["activity", "assistant_message", "activity", "assistant_message"]);
  });
  test("un élément invisible (type inconnu) ne coupe pas la séquence", () => {
    const hidden = { type: "permission_request" } as unknown as TimelineItem;
    expect(kinds([reasoning("a"), hidden, reasoning("b"), hidden, tool("1")])).toEqual(["activity"]);
  });
  test("jamais deux lignes d'activité adjacentes, quelle que soit la combinaison", () => {
    const mixed: TimelineItem[] = [reasoning("a"), tool("1"), { type: "todo" } as TimelineItem, reasoning("b"), user("x"), tool("2"), reasoning("c"), assistant("y"), reasoning("d")];
    const result = kinds(mixed);
    for (let i = 1; i < result.length; i += 1) expect(result[i] === "activity" && result[i - 1] === "activity").toBe(false);
  });
  test("un même appel d'outil reçu deux fois n'est listé qu'une fois", () => {
    const [node] = buildChatNodes([tool("1"), tool("1"), tool("2")]);
    expect(node?.kind === "activity" ? node.entries.length : 0).toBe(2);
  });
  test("l'ordre chronologique est conservé", () => {
    const [node] = buildChatNodes([reasoning("a"), tool("1"), reasoning("b")]);
    expect(node?.kind === "activity" ? node.entries.map((entry) => entry.kind) : []).toEqual(["reasoning", "tool", "reasoning"]);
  });
});

describe("résumé", () => {
  test("cumule durées, détecte le streaming, compte les outils", () => {
    const [node] = buildChatNodes([reasoning("a", 5300), { type: "reasoning", text: "b", durationMs: 16000, isStreaming: true }, tool("1")]);
    const summary = summarizeActivity(node?.kind === "activity" ? node.entries : []);
    expect(summary.reasoningMs).toBe(21300);
    expect(summary.reasoningStreaming).toBe(true);
    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.reasoningTexts).toEqual(["a", "b"]);
  });
  test("format des durées", () => {
    expect(formatDuration(5300)).toBe("5.3 s");
    expect(formatDuration(16000)).toBe("16 s");
    expect(formatDuration(0)).toBeNull();
  });
});
