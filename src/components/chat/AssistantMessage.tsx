import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { formatTime } from "../../lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { AssistantMessageTimelineItem } from "../../lib/paseo/types";
import { PressButton } from "../ui/button";

export function AssistantMessage({ item }: { item: AssistantMessageTimelineItem }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(item.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group relative my-5">
      <div className="flex items-center gap-2 mb-2 select-none">
        <span className="text-[11px] font-medium text-foreground/80">Paseo</span>
        {item.model && (
          <span className="text-[10px] font-mono text-muted-foreground">{item.model}</span>
        )}
        {item.timestamp && (
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60">
            {formatTime(item.timestamp)}
          </span>
        )}
        <PressButton
          onPress={handleCopy}
          className="ml-auto p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground transition-opacity cursor-pointer"
          title="Copier le message"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </PressButton>
      </div>

      <div className="min-w-0 max-w-full overflow-hidden text-[15px] leading-7">
        <MarkdownRenderer content={item.text} />
      </div>
    </div>
  );
}
