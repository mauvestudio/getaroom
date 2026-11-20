import React, { useState } from "react";
import { Copy, Check, ZoomIn, Navigation, Zap, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { formatTime } from "../../lib/utils";
import type { UserMessageTimelineItem, ImageAttachment } from "../../lib/paseo/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { PressButton } from "../ui/button";

const BEHAVIOR_LABELS = {
  steer: { label: "Réorienté", icon: Navigation, title: "Message injecté dans le tour en cours" },
  interrupt: { label: "Interrompu", icon: Zap, title: "Tour interrompu et relancé avec ce message" },
  followup: { label: "Suite", icon: Clock, title: "Message envoyé après la fin du tour précédent" },
} as const;

export function UserCard({ item }: { item: UserMessageTimelineItem }) {
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState<ImageAttachment | null>(null);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  const displayText =
    item.images && item.images.length > 0
      ? item.text.replace(/\n?\[image\]/gi, "").trim()
      : item.text;
  const compactText = displayText.replace(/\s+/g, " ").trim();
  const canExpandMobile = compactText.length > 110 || compactText !== displayText;
  const behavior = item.activeTurnBehavior ? BEHAVIOR_LABELS[item.activeTurnBehavior] : null;

  const handleCopy = () => {
    navigator.clipboard.writeText(displayText || item.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group flex flex-col items-end my-4" data-user-message="" data-preview={compactText.slice(0, 160)}>
      <div className="flex items-center gap-2 mb-1.5 px-1 select-none">
        <span className="text-[11px] font-medium text-muted-foreground">Vous</span>
        {behavior && (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
            title={behavior.title}
          >
            <behavior.icon className="w-2.5 h-2.5" />
            {behavior.label}
          </span>
        )}
        {item.timestamp && (
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground/70">
            {formatTime(item.timestamp)}
          </span>
        )}
        <PressButton
          onPress={handleCopy}
          className="p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground transition-opacity cursor-pointer"
          title="Copier le message"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </PressButton>
      </div>

      <div className="max-w-[85%] rounded-2xl bg-muted/45 px-4 py-2.5 text-foreground">
        {displayText ? (
          <>
            <div className="md:hidden flex items-start gap-1.5 min-w-0 max-w-full text-sm leading-6">
              <span
                className={`min-w-0 flex-1 break-words [overflow-wrap:anywhere] ${
                  isMobileExpanded ? "whitespace-pre-wrap" : "line-clamp-3"
                }`}
              >
                {displayText}
              </span>
              {canExpandMobile && (
                <PressButton
                  type="button"
                  onPress={() => setIsMobileExpanded((expanded) => !expanded)}
                  className="inline-flex min-h-8 shrink-0 items-center gap-0.5 rounded-md px-1 text-[11px] font-medium text-primary touch-manipulation"
                  aria-expanded={isMobileExpanded}
                  aria-label={isMobileExpanded ? "Réduire le message" : "Afficher le message en entier"}
                >
                  <span>{isMobileExpanded ? "Moins" : "Plus"}</span>
                  {isMobileExpanded ? (
                    <ChevronUp className="pointer-events-none h-3 w-3" />
                  ) : (
                    <ChevronDown className="pointer-events-none h-3 w-3" />
                  )}
                </PressButton>
              )}
            </div>
            <div className="hidden md:block text-[15px] leading-7 whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 max-w-full">
              {displayText}
            </div>
          </>
        ) : null}

        {item.images && item.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border/40">
            {item.images.map((img, idx) => (
              <PressButton
                key={idx}
                onPress={() => setPreviewImage(img)}
                className="group/img relative block overflow-hidden rounded-lg border border-border/60 bg-background/40 text-left cursor-pointer"
              >
                <img
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={img.name || `Image ${idx + 1}`}
                  className="max-h-24 md:max-h-40 max-w-full md:max-w-xs object-cover rounded-lg"
                />
                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 flex items-center justify-center transition-colors">
                  <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow-md" />
                </div>
                {img.name && (
                  <div className="p-1.5 px-2 bg-card/90 border-t border-border/40 text-[11px] font-mono text-muted-foreground truncate max-w-xs">
                    {img.name}
                  </div>
                )}
              </PressButton>
            ))}
          </div>
        )}

        {item.attachments && item.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {item.attachments.map((att, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md bg-background/50 text-muted-foreground text-[11px] font-mono"
              >
                {att}
              </span>
            ))}
          </div>
        )}
      </div>

      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
          <DialogContent className="max-w-3xl p-4 sm:rounded-2xl">
            <DialogHeader className="mb-2">
              <DialogTitle className="text-sm font-semibold truncate">
                {previewImage.name || "Aperçu de l'image"}
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center max-h-[75vh] overflow-auto rounded-xl bg-muted/30 p-2">
              <img
                src={`data:${previewImage.mimeType};base64,${previewImage.data}`}
                alt={previewImage.name || "Aperçu"}
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
