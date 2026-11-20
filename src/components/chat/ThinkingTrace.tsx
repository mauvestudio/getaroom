import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Sparkles, Loader2 } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { PressButton } from "../ui/button";

interface ThinkingTraceProps {
  text: string;
  isStreaming?: boolean;
  durationMs?: number;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export function ThinkingTrace({
  text,
  isStreaming,
  durationMs,
  isExpanded: controlledExpanded,
  onToggle,
}: ThinkingTraceProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const contentRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  // Auto-scroll thought details to bottom as new tokens arrive while streaming & expanded
  useEffect(() => {
    if (isStreaming && isExpanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [text, isStreaming, isExpanded]);

  const duration = durationMs && durationMs > 0 ? `${(durationMs / 1000).toFixed(durationMs < 10000 ? 1 : 0)} s` : null;

  return (
    <div className="my-1.5 text-xs">
      <PressButton
        type="button"
        onPress={handleToggle}
        className="group/think flex items-center gap-2 py-1.5 min-h-[44px] sm:min-h-[32px] text-muted-foreground hover:text-foreground cursor-pointer select-none transition-colors touch-manipulation"
      >
        {isStreaming ? (
          <Loader2 className="w-3 h-3 animate-spin text-amber-500/80 shrink-0" />
        ) : (
          <Sparkles className="w-3 h-3 text-muted-foreground/60 shrink-0" />
        )}
        <span className="text-[12px]">{isStreaming ? "Réflexion…" : "Raisonnement"}</span>
        {duration && <span className="text-[11px] font-mono text-muted-foreground/50">{duration}</span>}
        <ChevronDown
          className={`w-3 h-3 text-muted-foreground/50 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </PressButton>

      {isExpanded && (
        <div
          ref={contentRef}
          className="mt-1 ml-[5px] border-l border-border/60 pl-3 py-1 text-[13px] leading-6 text-muted-foreground max-h-80 overflow-y-auto overflow-x-hidden min-w-0 max-w-full"
        >
          {text ? (
            <MarkdownRenderer content={text} variant="thought" />
          ) : isStreaming ? (
            <div className="flex items-center gap-2 text-muted-foreground italic">
              <Loader2 className="w-3 h-3 animate-spin text-amber-500/70" />
              <span>Réflexion…</span>
            </div>
          ) : (
            <span className="italic text-muted-foreground">Aucun détail de raisonnement disponible.</span>
          )}
        </div>
      )}
    </div>
  );
}
