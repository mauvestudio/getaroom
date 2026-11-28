import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { formatDuration } from "../../lib/chat-nodes";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { AssistantMessageTimelineItem } from "../../lib/paseo/types";
import { PressButton } from "../ui/button";

export function AssistantMessage({ item, workedMs }: { item: AssistantMessageTimelineItem; workedMs?: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(item.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group relative my-5">
      <div className="min-w-0 max-w-full overflow-hidden text-[15px] leading-7">
        <MarkdownRenderer content={item.text} />
      </div>
      <div className="mt-1.5 flex items-center gap-2 select-none">
        <PressButton
          onPress={handleCopy}
          className="p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground transition-opacity cursor-pointer"
          title="Copier le message"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </PressButton>
        {workedMs && workedMs > 0 ? (
          <span className="text-xs text-muted-foreground">A travaillé pendant {formatDuration(workedMs)?.replace(" s", "s")}</span>
        ) : null}
      </div>
    </div>
  );
}
